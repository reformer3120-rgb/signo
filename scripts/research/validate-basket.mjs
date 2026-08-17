// 바이낸스 주식 무기한선물 10종목 — 신호 검증 (거래비용·펀딩 포함).
//
// 앞선 검증(validate-score.mjs)에서 125종목 횡단면으로 찾은 후보 신호
// (모멘텀 + 성장 + 밸류)가 실제 거래 대상 10종목에서도 통하는지 본다.
//
// 10종목뿐이라 십분위는 의미가 없다. 대신 바스켓 안에서 순위를 매겨
// 상위 몇 개를 롱, 하위 몇 개를 숏 한다.
//
// ★ 기준선은 0% 가 아니라 '10종목 균등보유' 다 ★
//   이 10개는 지난 10년 최대 승자들이다. 아무 신호 없이 그냥 다 사서 들고만
//   있어도 크게 벌었다. 신호가 쓸모 있으려면 그것보다 나아야 한다.
//   0% 와 견주면 어떤 엉터리 신호도 훌륭해 보인다.
//
// 비용
//   수수료·슬리피지  봇 설정값 (taker 0.04% + 슬리피지 0.02%)
//   펀딩             봇이 받아 둔 실제 펀딩비 CSV 에서 종목별로 측정
//                    롱은 내고 숏은 받는다
//
// 실행
//   EDGAR_UA="이름 메일주소" node scripts/research/validate-basket.mjs
import fs from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";
import { tickerMap, companyFacts, annualSeries, asOf, priorOf } from "./edgar.mjs";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const SYMBOLS = ["TSLA", "AAPL", "GOOGL", "NVDA", "SNDK", "MSTR", "COIN", "AMZN", "META", "MSFT"];
const BOT_DATA = process.env.BOT_DATA ?? "C:/binance-bot/data";

// 봇 config.stocks.yaml 의 fees 절
const FEE = 0.0004; // taker
const SLIP = 0.0002;
const COST_PER_SIDE = FEE + SLIP;

const YEARS = 10;
const MIN_NAMES = 6; // 이보다 적으면 그 달은 건너뛴다 (COIN·SNDK 는 상장이 늦다)
/** 롱/숏 각 몇 종목. 민감도 확인 때 바꿀 수 있게 객체로 둔다 */
const N_LEG_REF = { v: 3 };
const N_LEG = 3; // 표시용 기본값

// ── 펀딩비 (실측) ───────────────────────────────────────────
//
// 계약이 2026년에 상장돼 펀딩 기록도 2026년치뿐이다. 그걸 과거 10년에
// 그대로 적용하는 셈이라 가정이 하나 들어간다. 민감도도 함께 낸다.
function loadFunding() {
  const out = {};
  for (const s of SYMBOLS) {
    const f = path.join(BOT_DATA, `funding_${s}USDT.csv`);
    try {
      const rows = fs.readFileSync(f, "utf8").trim().split("\n").slice(1);
      const rates = rows.map((l) => Number(l.split(",")[1])).filter(Number.isFinite);
      if (rates.length) {
        const per8h = rates.reduce((a, b) => a + b, 0) / rates.length;
        out[s] = per8h * 3 * 365; // 연환산
      }
    } catch {
      /* 파일 없음 — 아래에서 평균으로 채운다 */
    }
  }
  const vals = Object.values(out);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.03;
  for (const s of SYMBOLS) if (out[s] == null) out[s] = avg;
  return { rate: out, avg };
}

const FUND = loadFunding();

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - w(s)));
const padL = (s, n) => " ".repeat(Math.max(1, n - w(s))) + String(s);
const pc = (v) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%" : "—");

// ── 자료 ─────────────────────────────────────────────────────

console.log("펀딩비 실측 (연환산, 롱이 지불)");
for (const s of SYMBOLS) {
  const has = fs.existsSync(path.join(BOT_DATA, `funding_${s}USDT.csv`));
  console.log(`  ${pad(s, 8)}${padL(pc(FUND.rate[s]), 9)}${has ? "" : "  (기록 없음 — 평균으로 대체)"}`);
}

console.log("\n자료 수집 중…");
const map = await tickerMap();
const stock = {};
for (const t of SYMBOLS) {
  try {
    const [facts, chart] = await Promise.all([
      companyFacts(map[t]),
      yf.chart(t, { period1: `${new Date().getUTCFullYear() - YEARS - 2}-01-01`, interval: "1d" }),
    ]);
    const px = chart.quotes
      .filter((q) => q.close != null)
      .map((q) => ({ d: new Date(q.date).toISOString().slice(0, 10), c: q.close }));
    const fin = annualSeries(facts);
    if (px.length < 200) continue;
    stock[t] = { fin, px, idx: Object.fromEntries(px.map((p, i) => [p.d, i])) };
  } catch (e) {
    console.log(`  ${t} 제외: ${String(e.message).slice(0, 40)}`);
  }
}
console.log(`  ${Object.keys(stock).length}종목 (${Object.keys(stock).join(", ")})`);

// 리밸런스: 매월 말
const base = stock.AAPL ?? Object.values(stock)[0];
const dates = base.px.map((p) => p.d);
const from = dates.findIndex((d) => d >= `${new Date().getUTCFullYear() - YEARS}-01-01`);
const rebal = [];
for (let i = Math.max(1, from); i < dates.length; i++) {
  if (dates[i].slice(0, 7) !== dates[i - 1].slice(0, 7)) rebal.push(dates[i - 1]);
}

// ── 신호 ─────────────────────────────────────────────────────

/** 그 시점 바스켓 안의 신호값 (모멘텀·성장·밸류 백분위 평균) */
function signalAt(date) {
  const rows = [];
  for (const [sym, s] of Object.entries(stock)) {
    const i = s.idx[date];
    if (i == null || i < 252) continue;
    const price = s.px[i].c;
    const fin = asOf(s.fin, date); // 공시일 기준 — 미래 훔쳐보기 차단
    const prior = priorOf(s.fin, fin);
    const back = (n) => (i - n >= 0 ? price / s.px[i - n].c - 1 : NaN);
    const mom = mean([back(63), back(126), back(252)].filter(Number.isFinite));
    let growth = NaN;
    let per = NaN;
    let pbr = NaN;
    if (fin && prior && prior.revenue > 0) growth = fin.revenue / prior.revenue - 1;
    if (fin && fin.eps > 0) per = price / fin.eps;
    if (fin && fin.equity > 0 && fin.shares > 0) pbr = price / (fin.equity / fin.shares);
    rows.push({ sym, i, price, mom, growth, per, pbr });
  }
  if (rows.length < MIN_NAMES) return null;

  const rank = (key, higherBetter) => {
    const v = rows.map((r, i) => ({ i, x: r[key] })).filter((o) => Number.isFinite(o.x));
    v.sort((a, b) => a.x - b.x);
    const out = new Array(rows.length).fill(NaN);
    v.forEach((o, k) => {
      const p = v.length > 1 ? k / (v.length - 1) : 0.5;
      out[o.i] = higherBetter ? p : 1 - p;
    });
    return out;
  };
  const Rm = rank("mom", true);
  const Rg = rank("growth", true);
  const Rp = rank("per", false);
  const Rb = rank("pbr", false);
  rows.forEach((r, k) => {
    const 밸류 = mean([Rp[k], Rb[k]].filter(Number.isFinite));
    const parts = [Rm[k], Rg[k], 밸류].filter(Number.isFinite);
    r.sig = parts.length >= 2 ? mean(parts) : NaN;
  });
  const valid = rows.filter((r) => Number.isFinite(r.sig));
  return valid.length >= MIN_NAMES ? valid : null;
}

/** 다음 달 수익률 (다음 리밸런스일까지) */
function fwd(sym, d0, d1) {
  const s = stock[sym];
  const a = s.idx[d0];
  const b = s.idx[d1];
  if (a == null || b == null) return null;
  return { ret: s.px[b].c / s.px[a].c - 1, days: b - a };
}

// ── 전략 ─────────────────────────────────────────────────────

/**
 * @param mode  "ew" 균등보유 · "long" 상위N 롱 · "ls" 상위N 롱 + 하위N 숏
 * @param costs 비용을 반영할지
 */
function run(mode, costs) {
  const rets = [];
  const stamps = [];
  let prevW = {};
  for (let k = 0; k + 1 < rebal.length; k++) {
    const d0 = rebal[k];
    const d1 = rebal[k + 1];
    const rows = signalAt(d0);
    if (!rows) continue;

    // 이번 달 비중
    const wt = {};
    if (mode === "ew") {
      for (const r of rows) wt[r.sym] = 1 / rows.length;
    } else {
      const sorted = [...rows].sort((a, b) => b.sig - a.sig);
      const n = Math.min(N_LEG_REF.v, Math.floor(rows.length / 2));
      sorted.slice(0, n).forEach((r) => (wt[r.sym] = 1 / n));
      if (mode === "ls") sorted.slice(-n).forEach((r) => (wt[r.sym] = (wt[r.sym] ?? 0) - 1 / n));
    }

    // 수익
    let gross = 0;
    let fundCost = 0;
    let held = 0;
    for (const [sym, weight] of Object.entries(wt)) {
      const f = fwd(sym, d0, d1);
      if (!f) continue;
      gross += weight * f.ret;
      held += Math.abs(weight);
      // 펀딩 — 롱은 내고 숏은 받는다
      fundCost += weight * FUND.rate[sym] * (f.days / 365);
    }
    if (held < 0.5) continue;

    // 거래비용 — 지난달 비중에서 바뀐 만큼
    const syms = new Set([...Object.keys(wt), ...Object.keys(prevW)]);
    let turnover = 0;
    for (const s of syms) turnover += Math.abs((wt[s] ?? 0) - (prevW[s] ?? 0));
    const tradeCost = turnover * COST_PER_SIDE;

    rets.push(costs ? gross - fundCost - tradeCost : gross);
    stamps.push(d1);
    prevW = wt;
  }
  return { rets, stamps };
}

function stats(r) {
  if (r.length < 12) return null;
  const total = r.reduce((a, x) => a * (1 + x), 1) - 1;
  const yrs = r.length / 12;
  const cagr = (1 + total) ** (1 / yrs) - 1;
  const vol = sd(r) * Math.sqrt(12);
  let peak = 1;
  let eq = 1;
  let mdd = 0;
  for (const x of r) {
    eq *= 1 + x;
    peak = Math.max(peak, eq);
    mdd = Math.min(mdd, eq / peak - 1);
  }
  return { n: r.length, total, cagr, vol, sharpe: vol ? cagr / vol : NaN, mdd, win: r.filter((x) => x > 0).length / r.length };
}

function show(title, s) {
  if (!s) { console.log("  " + pad(title, 22) + "표본 부족"); return; }
  console.log(
    "  " + pad(title, 22) + padL(s.n, 5) + padL(pc(s.cagr), 11) + padL(pc(s.vol), 10) +
      padL(s.sharpe.toFixed(2), 8) + padL(pc(s.mdd), 11) + padL((s.win * 100).toFixed(0) + "%", 7),
  );
}

const header = "  " + pad("전략", 22) + padL("개월", 5) + padL("연수익", 11) + padL("변동성", 10) + padL("샤프", 8) + padL("최대낙폭", 11) + padL("승률", 7);

console.log(`\n리밸런스 ${rebal.length}회 · 롱 ${N_LEG} / 숏 ${N_LEG}\n`);

console.log("■ 비용 반영 전 (총수익)");
console.log(header);
for (const [m, t] of [["ew", "균등보유 (기준선)"], ["long", `상위${N_LEG} 롱`], ["ls", `상위${N_LEG}롱 / 하위${N_LEG}숏`]]) {
  show(t, stats(run(m, false).rets));
}

console.log("\n■ 비용 반영 후 (수수료 + 슬리피지 + 펀딩)");
console.log(header);
const withCost = {};
for (const [m, t] of [["ew", "균등보유 (기준선)"], ["long", `상위${N_LEG} 롱`], ["ls", `상위${N_LEG}롱 / 하위${N_LEG}숏`]]) {
  const r = run(m, true);
  withCost[m] = r.rets;
  show(t, stats(r.rets));
}

// 기준선 대비 초과
console.log("\n■ 기준선(균등보유) 대비 초과수익 — 이게 신호의 값어치다");
const ew = withCost.ew;
for (const [m, t] of [["long", `상위${N_LEG} 롱`], ["ls", `상위${N_LEG}롱 / 하위${N_LEG}숏`]]) {
  const a = withCost[m];
  const n = Math.min(a.length, ew.length);
  const ex = Array.from({ length: n }, (_, i) => a[i] - ew[i]);
  const m2 = mean(ex);
  const t2 = m2 / (sd(ex) / Math.sqrt(n));
  console.log(
    "  " + pad(t, 22) + padL(pc(m2 * 12), 12) + `  (월평균 ${pc(m2)}, t=${t2.toFixed(2)})  ` +
      (Math.abs(t2) >= 2 ? (t2 > 0 ? "★ 의미 있음" : "★ 오히려 손해") : "우연과 구분 안 됨"),
  );
}

// 기간을 갈라서
console.log("\n■ 기간을 반으로 갈라서 (비용 반영, 기준선 대비 초과)");
const half = Math.floor(ew.length / 2);
for (const [m, t] of [["long", `상위${N_LEG} 롱`], ["ls", `상위${N_LEG}롱 / 하위${N_LEG}숏`]]) {
  const a = withCost[m];
  const parts = [
    ["앞쪽", a.slice(0, half), ew.slice(0, half)],
    ["뒤쪽", a.slice(half), ew.slice(half)],
  ];
  const txt = parts.map(([lab, x, y]) => {
    const ex = x.map((v, i) => v - y[i]);
    return `${lab} ${pc(mean(ex) * 12)}`;
  });
  console.log("  " + pad(t, 22) + txt.join("   "));
}

// 비용 민감도
console.log("\n■ 펀딩비 민감도 — 실측은 2026년치뿐이라 과거에 적용한 건 가정이다");
console.log("  " + pad("펀딩 배수", 14) + padL(`상위${N_LEG} 롱`, 12) + padL("롱/숏", 12));
const baseRate = { ...FUND.rate };
for (const mult of [0, 1, 2, 3]) {
  for (const s of SYMBOLS) FUND.rate[s] = baseRate[s] * mult;
  const l = stats(run("long", true).rets);
  const ls = stats(run("ls", true).rets);
  console.log("  " + pad(mult === 1 ? "1배 (실측)" : `${mult}배`, 14) + padL(pc(l?.cagr), 12) + padL(pc(ls?.cagr), 12));
}
for (const s of SYMBOLS) FUND.rate[s] = baseRate[s];

// ── 레버리지 ────────────────────────────────────────────────
//
// 봇 설정(config.stocks.yaml)은 leverage 3 이다. 낙폭이 -50% 대인 전략에
// 3배를 걸면 산술적으로 계좌가 사라진다. 실제로 얼마까지 견디는지 본다.
console.log("\n■ 레버리지별 — 낙폭이 -100% 에 닿으면 청산이다");
console.log("  " + pad("배수", 10) + padL("연수익", 12) + padL("최대낙폭", 12) + padL("최악의 달", 12) + "  판정");
for (const L of [1, 1.5, 2, 3]) {
  const r = withCost.long.map((x) => x * L);
  const s = stats(r);
  const worst = Math.min(...r);
  const dead = s.mdd <= -0.99 || worst <= -0.99;
  console.log(
    "  " + pad(`${L}배`, 10) + padL(dead ? "청산" : pc(s.cagr), 12) + padL(pc(s.mdd), 12) +
      padL(pc(worst), 12) + "  " + (dead ? "★ 계좌 소멸" : s.mdd < -0.7 ? "견디기 어렵다" : "생존"),
  );
}
console.log("  ※ 월 단위 수익으로 계산했다. 실제로는 달 중간에 더 깊이 빠져 그전에 청산된다.");
console.log("     위 숫자는 실제보다 낙관적이다.");

// ── 종목 수 민감도 ──────────────────────────────────────────
//
// N=3 이 특별히 좋은 숫자여서가 아니라 그냥 골랐던 값이다. 다른 값에서도
// 같은 방향인지 본다. 하나만 유독 좋다면 그건 우연을 붙잡은 것이다.
console.log("\n■ 롱 종목 수를 바꿔 보면 (비용 반영, 기준선 대비 초과)");
console.log("  " + pad("상위 N개 롱", 14) + padL("연수익", 12) + padL("초과", 11) + padL("t", 8) + padL("최대낙폭", 12));
const savedN = N_LEG;
for (const n of [2, 3, 4, 5]) {
  N_LEG_REF.v = n;
  const a = run("long", true).rets;
  const s = stats(a);
  const m = Math.min(a.length, ew.length);
  const ex = Array.from({ length: m }, (_, i) => a[i] - ew[i]);
  const t = mean(ex) / (sd(ex) / Math.sqrt(m));
  console.log(
    "  " + pad(`${n}개`, 14) + padL(pc(s?.cagr), 12) + padL(pc(mean(ex) * 12), 11) +
      padL(t.toFixed(2), 8) + padL(pc(s?.mdd), 12),
  );
}
N_LEG_REF.v = savedN;

// ── 몇 달이 다 한 것은 아닌가 ───────────────────────────────
console.log("\n■ 초과수익이 몇 달에 몰려 있지는 않은가 (상위3 롱)");
{
  const a = withCost.long;
  const n = Math.min(a.length, ew.length);
  const ex = Array.from({ length: n }, (_, i) => a[i] - ew[i]).sort((x, y) => y - x);
  const drop = (k) => mean(ex.slice(k)) * 12;
  console.log(`  그대로            ${pc(drop(0))}`);
  console.log(`  best 1개월 제외   ${pc(drop(1))}`);
  console.log(`  best 3개월 제외   ${pc(drop(3))}`);
  console.log(`  best 6개월 제외   ${pc(drop(6))}`);
  console.log("  ※ 몇 달 빼면 사라지는 초과수익은 전략이 아니라 운이다.");
}

console.log("\n■ 읽을 때 조심할 것");
console.log("  · 대상 10종목은 지난 10년 최대 승자들이다. 이 목록 자체가 결과를 알고 고른 것이라");
console.log("    (생존 편향) 균등보유 수익이 실제보다 부풀려져 있다. 초과수익만 보는 게 안전하다.");
console.log("  · 펀딩 기록은 2026년치뿐이다. 계약이 그때 상장됐다.");
console.log("  · 기초자산(주식) 수익으로 계산했다. 무기한선물 가격은 여기서 펀딩만큼 갈린다.");
console.log(`  · 봇 설정은 레버리지 3배다. 수익도 낙폭도 그만큼 커진다 (위 숫자는 1배 기준).`);
