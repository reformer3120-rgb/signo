// 신호 검증 공통 엔진 — 자료 적재 · 신호 · 전략 · 성과지표.
//
// validate-basket.mjs(거래 대상 10종목)와 validate-universe.mjs(바이낸스가
// 상장한 주식선물 전체)가 같은 계산을 쓰도록 한곳에 모았다. 두 결과를
// 견주려면 계산이 같아야 한다.
import fs from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";
import { tickerMap, companyFacts, annualSeries, asOf, priorOf } from "./edgar.mjs";

export const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ── 표시 ─────────────────────────────────────────────────────
const wid = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
export const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - wid(s)));
export const padL = (s, n) => " ".repeat(Math.max(1, n - wid(s))) + String(s);
export const pc = (v) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%" : "—");
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
export const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

// ── 바이낸스 상장 목록 ──────────────────────────────────────

/**
 * 바이낸스 USDT 무기한 중 주식 기초자산만.
 * underlyingType 이 EQUITY / KR_EQUITY / HK_EQUITY 로 갈려 있다.
 * 미국 상장사만 SEC 공시가 있으므로 EQUITY 만 쓴다.
 */
export async function binanceEquityPerps() {
  const r = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
  if (!r.ok) throw new Error(`바이낸스 ${r.status}`);
  const j = await r.json();
  return j.symbols
    .filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT" && s.underlyingType === "EQUITY")
    .map((s) => ({
      symbol: s.symbol,
      ticker: s.symbol.replace(/USDT$/, ""),
      onboard: s.onboardDate ? new Date(s.onboardDate).toISOString().slice(0, 10) : null,
    }));
}

// ── 펀딩비 ───────────────────────────────────────────────────

/** 봇이 받아 둔 펀딩 CSV 에서 종목별 연환산 요율. 없으면 평균으로 채운다 */
export function loadFunding(tickers, botData) {
  const out = {};
  let measured = 0;
  for (const t of tickers) {
    try {
      const rows = fs.readFileSync(path.join(botData, `funding_${t}USDT.csv`), "utf8")
        .trim().split("\n").slice(1);
      const rates = rows.map((l) => Number(l.split(",")[1])).filter(Number.isFinite);
      if (rates.length) {
        out[t] = mean(rates) * 3 * 365;
        measured++;
      }
    } catch {
      /* 기록 없음 */
    }
  }
  const avg = measured ? mean(Object.values(out)) : 0.04;
  for (const t of tickers) if (out[t] == null) out[t] = avg;
  return { rate: out, avg, measured };
}

// ── 자료 적재 ────────────────────────────────────────────────

/**
 * 종목별 [공시일 기준 연간 재무 + 일봉]을 모은다.
 * ETF·해외상장은 us-gaap 재무가 없어 여기서 자연히 걸러진다.
 */
export async function loadStocks(tickers, years, onProgress) {
  const map = await tickerMap();
  const stock = {};
  const skipped = [];
  let n = 0;
  for (const t of tickers) {
    n++;
    const cik = map[t];
    if (!cik) { skipped.push([t, "CIK없음(ETF·해외 등)"]); continue; }
    try {
      const [facts, chart] = await Promise.all([
        companyFacts(cik),
        yf.chart(t, {
          period1: `${new Date().getUTCFullYear() - years - 2}-01-01`,
          interval: "1d",
        }),
      ]);
      const fin = annualSeries(facts);
      const px = chart.quotes
        .filter((q) => q.close != null)
        .map((q) => ({ d: new Date(q.date).toISOString().slice(0, 10), c: q.close }));
      if (fin.length < 3) { skipped.push([t, "재무 부족"]); continue; }
      if (px.length < 400) { skipped.push([t, "주가 부족"]); continue; }
      stock[t] = { fin, px, idx: Object.fromEntries(px.map((p, i) => [p.d, i])) };
    } catch (e) {
      skipped.push([t, String(e.message).slice(0, 26)]);
    }
    onProgress?.(n, tickers.length, Object.keys(stock).length);
  }
  return { stock, skipped };
}

/** 매월 마지막 거래일 */
export function rebalanceDates(stock, years) {
  const seen = new Set();
  for (const s of Object.values(stock)) for (const p of s.px) seen.add(p.d);
  const dates = [...seen].sort();
  const from = dates.findIndex((d) => d >= `${new Date().getUTCFullYear() - years}-01-01`);
  const out = [];
  for (let i = Math.max(1, from); i < dates.length; i++) {
    if (dates[i].slice(0, 7) !== dates[i - 1].slice(0, 7)) out.push(dates[i - 1]);
  }
  return out;
}

// ── 신호 ─────────────────────────────────────────────────────

/** 횡단면 백분위 (0~1). 값 없는 종목은 순위에서 빠진다 */
function rank(rows, key, higherBetter) {
  const v = rows.map((r, i) => ({ i, x: r[key] })).filter((o) => Number.isFinite(o.x));
  v.sort((a, b) => a.x - b.x);
  const out = new Array(rows.length).fill(NaN);
  v.forEach((o, k) => {
    const p = v.length > 1 ? k / (v.length - 1) : 0.5;
    out[o.i] = higherBetter ? p : 1 - p;
  });
  return out;
}

/**
 * 후보 신호 = 모멘텀 + 성장 + 밸류 (백분위 평균).
 * 앞선 125종목 검증에서 방향이 맞았던 셋만 모은 것이다.
 * 재무건전성·시가총액은 그 검증에서 반대로 나와 뺐다.
 *
 * 재무는 **공시일 기준**으로만 읽는다 — 결산이 끝났어도 공시 전이면
 * 그날의 투자자는 모르는 값이다.
 */
export function makeSignal(stock, minNames) {
  return function signalAt(date) {
    const rows = [];
    for (const [sym, s] of Object.entries(stock)) {
      const i = s.idx[date];
      if (i == null || i < 252) continue;
      const price = s.px[i].c;
      const fin = asOf(s.fin, date);
      const prior = priorOf(s.fin, fin);
      const back = (n) => (i - n >= 0 ? price / s.px[i - n].c - 1 : NaN);
      const mom = mean([back(63), back(126), back(252)].filter(Number.isFinite));
      let growth = NaN, per = NaN, pbr = NaN;
      if (fin && prior && prior.revenue > 0) growth = fin.revenue / prior.revenue - 1;
      if (fin && fin.eps > 0) per = price / fin.eps;
      if (fin && fin.equity > 0 && fin.shares > 0) pbr = price / (fin.equity / fin.shares);
      rows.push({ sym, i, price, mom, growth, per, pbr });
    }
    if (rows.length < minNames) return null;
    const Rm = rank(rows, "mom", true);
    const Rg = rank(rows, "growth", true);
    const Rp = rank(rows, "per", false);
    const Rb = rank(rows, "pbr", false);
    rows.forEach((r, k) => {
      const 밸류 = mean([Rp[k], Rb[k]].filter(Number.isFinite));
      const parts = [Rm[k], Rg[k], 밸류].filter(Number.isFinite);
      r.sig = parts.length >= 2 ? mean(parts) : NaN;
    });
    const valid = rows.filter((r) => Number.isFinite(r.sig));
    return valid.length >= minNames ? valid : null;
  };
}

// ── 전략 ─────────────────────────────────────────────────────

/**
 * @param mode "ew" 균등보유 · "long" 상위 롱 · "ls" 상위 롱 + 하위 숏
 * @param frac 상·하위 몇 할을 담을지 (0.2 = 상위 20%). 종목 수가 다른 두
 *             표본을 견주려면 개수가 아니라 비율로 잡아야 공정하다.
 */
export function runStrategy({ stock, rebal, signalAt, fund, mode, frac, costs, costPerSide, minNames }) {
  const rets = [];
  let prevW = {};
  for (let k = 0; k + 1 < rebal.length; k++) {
    const d0 = rebal[k];
    const d1 = rebal[k + 1];
    const rows = signalAt(d0);
    if (!rows) continue;

    const wt = {};
    if (mode === "ew") {
      for (const r of rows) wt[r.sym] = 1 / rows.length;
    } else {
      const sorted = [...rows].sort((a, b) => b.sig - a.sig);
      const n = Math.max(1, Math.min(Math.round(rows.length * frac), Math.floor(rows.length / 2)));
      sorted.slice(0, n).forEach((r) => (wt[r.sym] = 1 / n));
      if (mode === "ls") sorted.slice(-n).forEach((r) => (wt[r.sym] = (wt[r.sym] ?? 0) - 1 / n));
    }

    let gross = 0, fundCost = 0, held = 0;
    for (const [sym, weight] of Object.entries(wt)) {
      const s = stock[sym];
      const a = s.idx[d0], b = s.idx[d1];
      if (a == null || b == null) continue;
      gross += weight * (s.px[b].c / s.px[a].c - 1);
      held += Math.abs(weight);
      fundCost += weight * (fund.rate[sym] ?? fund.avg) * ((b - a) / 365); // 롱은 내고 숏은 받는다
    }
    if (held < 0.5) continue;

    let turnover = 0;
    for (const s of new Set([...Object.keys(wt), ...Object.keys(prevW)])) {
      turnover += Math.abs((wt[s] ?? 0) - (prevW[s] ?? 0));
    }
    rets.push(costs ? gross - fundCost - turnover * costPerSide : gross);
    prevW = wt;
  }
  return rets;
}

export function stats(r) {
  if (!r || r.length < 12) return null;
  const total = r.reduce((a, x) => a * (1 + x), 1) - 1;
  const cagr = (1 + total) ** (12 / r.length) - 1;
  const vol = sd(r) * Math.sqrt(12);
  let peak = 1, eq = 1, mdd = 0;
  for (const x of r) {
    eq *= 1 + x;
    peak = Math.max(peak, eq);
    mdd = Math.min(mdd, eq / peak - 1);
  }
  return { n: r.length, total, cagr, vol, sharpe: vol ? cagr / vol : NaN, mdd, win: r.filter((x) => x > 0).length / r.length, worst: Math.min(...r) };
}

/**
 * 변동성 타게팅 — 최근 변동성이 클수록 비중을 줄인다.
 *
 * 알파가 없어도 샤프는 올릴 수 있다. 변동성은 뭉쳐 다니기 때문이다
 * (요동친 달 다음엔 또 요동친다). 요동칠 때 작게 들고 잠잠할 때 크게
 * 들면 같은 수익을 더 얕은 낙폭으로 얻는다.
 *
 * 미래를 쓰지 않는다 — t 시점 비중은 t 이전 수익률로만 정한다.
 *
 * @param rets    월별 수익률
 * @param target  목표 연변동성 (0.20 = 20%)
 * @param lookback 변동성을 재는 개월 수
 * @param maxLev  비중 상한
 */
export function volTarget(rets, { target = 0.2, lookback = 6, maxLev = 2 } = {}) {
  const out = [];
  const scales = [];
  for (let i = 0; i < rets.length; i++) {
    if (i < lookback) { out.push(rets[i]); scales.push(1); continue; }
    const past = rets.slice(i - lookback, i); // ★ i 는 포함하지 않는다
    const v = sd(past) * Math.sqrt(12);
    const k = v > 0 ? Math.min(maxLev, target / v) : 1;
    out.push(rets[i] * k);
    scales.push(k);
  }
  return { rets: out, scales, avgScale: mean(scales) };
}

/** 기준선에 회귀해 베타와 알파를 가른다 */
export function alphaBeta(strategy, base) {
  const n = Math.min(strategy.length, base.length);
  const a = strategy.slice(0, n);
  const b = base.slice(0, n);
  const mA = mean(a);
  const mB = mean(b);
  const varB = mean(b.map((x) => (x - mB) ** 2));
  const cov = mean(Array.from({ length: n }, (_, i) => (a[i] - mA) * (b[i] - mB)));
  const beta = varB ? cov / varB : NaN;
  const alpha = mA - beta * mB;
  const resid = Array.from({ length: n }, (_, i) => a[i] - beta * b[i] - alpha);
  return { beta, alpha, t: alpha / (sd(resid) / Math.sqrt(n)), n };
}

export const HEADER =
  "  " + pad("전략", 24) + padL("개월", 5) + padL("연수익", 11) + padL("변동성", 10) +
  padL("샤프", 8) + padL("최대낙폭", 11) + padL("승률", 7);

export function show(title, s) {
  if (!s) { console.log("  " + pad(title, 24) + "표본 부족"); return; }
  console.log(
    "  " + pad(title, 24) + padL(s.n, 5) + padL(pc(s.cagr), 11) + padL(pc(s.vol), 10) +
      padL(s.sharpe.toFixed(2), 8) + padL(pc(s.mdd), 11) + padL((s.win * 100).toFixed(0) + "%", 7),
  );
}
