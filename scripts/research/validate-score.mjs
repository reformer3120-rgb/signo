// 종합평가 점수가 실제로 수익을 예측하는가 — 횡단면 요인 검증.
//
// 물음
//   SIGNO 의 종합평가 점수가 높은 종목이 낮은 종목보다 실제로 더 올랐는가.
//   답이 "아니오"면 그 점수로 자동매매를 돌릴 근거가 없다.
//
// 미래 훔쳐보기를 막는 두 가지
//   1) 재무는 EDGAR 의 **공시일 기준**으로만 쓴다. 결산은 끝났어도 공시 전이면
//      그날의 투자자는 모르는 값이다.
//   2) 점수는 그 시점 횡단면 안에서만 정규화한다. 나중에 알려진 분포를 쓰지 않는다.
//
// 실행
//   EDGAR_UA="이름 메일주소" node scripts/research/validate-score.mjs
//   (첫 실행은 종목마다 SEC 공시를 받아 오느라 몇 분 걸린다. 이후는 캐시)
import YahooFinance from "yahoo-finance2";
import { tickerMap, companyFacts, annualSeries, asOf, priorOf } from "./edgar.mjs";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ── 검증 대상 ────────────────────────────────────────────────
//
// 바이낸스 주식 무기한선물로 실제 거래하는 10종목은 표본이 너무 적어
// 그것만으로는 통계가 안 나온다. 넓은 미국 대형주로 요인을 검증한 뒤,
// 거래 대상 10종목에서도 같은 방향인지 따로 본다.

/** 실제 거래 대상 (config.stocks.yaml 의 심볼에서 USDT 를 뗀 것) */
const TRADED = ["TSLA", "AAPL", "GOOGL", "NVDA", "SNDK", "MSTR", "COIN", "AMZN", "META", "MSFT"];

/** 요인 검증용 넓은 표본 — 업종이 한쪽으로 쏠리지 않게 섞었다 */
const UNIVERSE = [
  ...TRADED,
  "JPM","BAC","WFC","GS","MS","C","AXP","BLK","SCHW","SPGI",
  "JNJ","UNH","LLY","PFE","MRK","ABBV","TMO","ABT","DHR","BMY",
  "XOM","CVX","COP","SLB","EOG","PSX","MPC","OXY","VLO","KMI",
  "PG","KO","PEP","WMT","COST","MCD","NKE","SBUX","TGT","CL",
  "HD","LOW","TJX","BKNG","MAR","GM","F","CMG","ORLY","YUM",
  "CAT","DE","BA","HON","GE","LMT","RTX","UPS","UNP","MMM",
  "ORCL","CRM","ADBE","AMD","INTC","QCOM","TXN","AVGO","MU","AMAT",
  "CSCO","IBM","NOW","INTU","ACN","PANW","ADI","LRCX","KLAC","SNPS",
  "NFLX","DIS","CMCSA","T","VZ","TMUS","CHTR","EA","TTWO","WBD",
  "LIN","APD","SHW","ECL","NEM","FCX","DOW","NUE","VMC","MLM",
  "NEE","DUK","SO","D","AEP","EXC","SRE","XEL","PEG","ED",
  "AMT","PLD","EQIX","CCI","SPG","O","PSA","WELL","DLR","AVB",
];

const YEARS = 10; // 검증 기간
const HOLD = [21, 63, 126]; // 보유 기간(거래일) ≈ 1·3·6개월

// ── 점수 규칙 ────────────────────────────────────────────────
//
// src/lib/score.ts 의 가중치를 그대로 쓰되, 과거 값을 구할 수 없는 둘은 뺀다.
//   기관 보유비중 12점 — 야후가 현재 값만 준다. 과거 시계열이 없다.
//   배당       3점 — 이번 검증에서는 제외 (배점이 작아 결론을 바꾸지 않는다)
// 나머지 85점을 100점으로 다시 나눈다.
const RAW_W = { 재무: 0.28, 밸류: 0.22, 성장: 0.15, 시총: 0.1, 모멘텀: 0.1 };
const SUM_W = Object.values(RAW_W).reduce((a, b) => a + b, 0);
const W = Object.fromEntries(Object.entries(RAW_W).map(([k, v]) => [k, v / SUM_W]));

const num = (v) => (Number.isFinite(v) ? v : NaN);

/** 그 시점 재무로 원지표를 만든다. 값이 없으면 NaN — 0 으로 채우지 않는다 */
function metrics(fin, prior, price) {
  if (!fin) return null;
  const equity = num(fin.equity);
  const shares = num(fin.shares);
  const roe = equity > 0 ? (fin.netInc / equity) * 100 : NaN;
  const debt = equity > 0 ? (fin.liabilities / equity) * 100 : NaN;
  const opMargin = fin.revenue > 0 ? (fin.opInc / fin.revenue) * 100 : NaN;
  const growth =
    prior && prior.revenue > 0 ? (fin.revenue / prior.revenue - 1) * 100 : NaN;
  const cap = shares > 0 ? price * shares : NaN;
  const per = fin.eps > 0 ? price / fin.eps : NaN;
  const pbr = equity > 0 && shares > 0 ? price / (equity / shares) : NaN;
  return { roe, debt, opMargin, growth, cap: cap > 0 ? Math.log10(cap) : NaN, per, pbr };
}

/** 횡단면 백분위 (0~1). 값이 없는 종목은 순위에서 빠진다 */
function ranks(rows, key, higherBetter) {
  const v = rows.map((r, i) => ({ i, x: r.m?.[key] })).filter((o) => Number.isFinite(o.x));
  v.sort((a, b) => a.x - b.x);
  const out = new Array(rows.length).fill(NaN);
  v.forEach((o, k) => {
    const p = v.length > 1 ? k / (v.length - 1) : 0.5;
    out[o.i] = higherBetter ? p : 1 - p;
  });
  return out;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - w(s)));
const padL = (s, n) => " ".repeat(Math.max(1, n - w(s))) + String(s);
const pc = (v) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%" : "—");

// ── 자료 모으기 ──────────────────────────────────────────────

console.log(`대상 ${UNIVERSE.length}종목 · 최근 ${YEARS}년\n자료 수집 중…`);
const map = await tickerMap();
const stock = {};
let ok = 0;
let failed = [];
for (const t of UNIVERSE) {
  const cik = map[t];
  if (!cik) { failed.push(`${t}(CIK없음)`); continue; }
  try {
    const [facts, chart] = await Promise.all([
      companyFacts(cik),
      yf.chart(t, { period1: `${new Date().getUTCFullYear() - YEARS - 2}-01-01`, interval: "1d" }),
    ]);
    const fin = annualSeries(facts);
    const px = chart.quotes
      .filter((q) => q.close != null)
      .map((q) => ({ d: new Date(q.date).toISOString().slice(0, 10), c: q.close }));
    if (fin.length < 3 || px.length < 500) { failed.push(`${t}(자료부족)`); continue; }
    stock[t] = { fin, px, idx: Object.fromEntries(px.map((p, i) => [p.d, i])) };
    ok++;
  } catch (e) {
    failed.push(`${t}(${String(e.message).slice(0, 24)})`);
  }
  if (ok % 20 === 0 && ok) process.stdout.write(`  ${ok}종목…\r`);
}
console.log(`  수집 완료 ${ok}종목${failed.length ? ` · 제외 ${failed.length}개` : ""}`);
if (failed.length) console.log(`  제외: ${failed.slice(0, 8).join(", ")}${failed.length > 8 ? " …" : ""}`);

// ── 리밸런스 날짜 (매월 말 거래일) ───────────────────────────
const anySym = Object.keys(stock)[0];
const allDates = stock[anySym].px.map((p) => p.d);
const start = allDates.findIndex((d) => d >= `${new Date().getUTCFullYear() - YEARS}-01-01`);
const rebal = [];
for (let i = Math.max(1, start); i < allDates.length; i++) {
  if (allDates[i].slice(0, 7) !== allDates[i - 1].slice(0, 7)) rebal.push(allDates[i - 1]);
}
console.log(`리밸런스 ${rebal.length}회 (${rebal[0]} ~ ${rebal[rebal.length - 1]})\n`);

// ── 각 시점 횡단면 ───────────────────────────────────────────

const samples = []; // {date, sym, score, fwd:{21,63,126}, traded}
for (const date of rebal) {
  const rows = [];
  for (const [sym, s] of Object.entries(stock)) {
    const i = s.idx[date];
    if (i == null) continue;
    const price = s.px[i].c;
    const fin = asOf(s.fin, date); // ★ 공시일 기준
    if (!fin) continue;
    // 모멘텀 — 최근 3·6·12개월 수익률 평균 (가격만 쓰므로 훔쳐보기 없음)
    const back = (n) => (i - n >= 0 ? price / s.px[i - n].c - 1 : NaN);
    const mom = mean([back(63), back(126), back(252)].filter(Number.isFinite));
    const m = metrics(fin, priorOf(s.fin, fin), price);
    if (!m) continue;
    m.mom = Number.isFinite(mom) ? mom * 100 : NaN;
    rows.push({ sym, i, price, m });
  }
  if (rows.length < 30) continue; // 횡단면이 얇으면 순위가 의미 없다

  // 지표별 백분위 → 항목 점수 → 가중합
  const R = {
    roe: ranks(rows, "roe", true),
    debt: ranks(rows, "debt", false),
    opMargin: ranks(rows, "opMargin", true),
    growth: ranks(rows, "growth", true),
    cap: ranks(rows, "cap", true),
    per: ranks(rows, "per", false),
    pbr: ranks(rows, "pbr", false),
    mom: ranks(rows, "mom", true),
  };
  rows.forEach((r, k) => {
    const 재무 = mean([R.roe[k] * 0.5, R.debt[k] * 0.3, R.opMargin[k] * 0.2].filter(Number.isFinite)) * 3;
    const 밸류 = mean([R.per[k], R.pbr[k]].filter(Number.isFinite));
    const parts = {
      재무: Number.isFinite(재무) ? Math.min(1, 재무) : NaN,
      밸류,
      성장: R.growth[k],
      시총: R.cap[k],
      모멘텀: R.mom[k],
    };
    let sc = 0;
    let wsum = 0;
    for (const [k2, v] of Object.entries(parts)) {
      if (Number.isFinite(v)) { sc += v * W[k2]; wsum += W[k2]; }
    }
    if (wsum < 0.6) return; // 절반 넘게 비면 점수로 치지 않는다
    const s = stock[r.sym];
    const fwd = {};
    for (const h of HOLD) fwd[h] = r.i + h < s.px.length ? s.px[r.i + h].c / r.price - 1 : null;
    samples.push({
      date, sym: r.sym, score: (sc / wsum) * 100, fwd, traded: TRADED.includes(r.sym),
      // 요소별 백분위도 남긴다 — 합친 점수가 안 되면 어느 요소가 문제인지 갈라보려고
      parts: { ...parts, per: R.per[k], pbr: R.pbr[k], roe: R.roe[k], mom: R.mom[k] },
    });
  });
}

console.log(`표본 ${samples.length.toLocaleString()}건 (시점 × 종목)\n`);

// ── 결과 ─────────────────────────────────────────────────────

function decileTable(rows, h, title) {
  const v = rows.filter((s) => s.fwd[h] != null);
  if (v.length < 50) { console.log(`  ${title}: 표본 부족 (${v.length})`); return; }
  // 시점마다 그 시점 안에서 십분위를 나눈다 (전 기간을 한꺼번에 나누면 시장 흐름이 섞인다)
  const byDate = {};
  for (const s of v) (byDate[s.date] = byDate[s.date] || []).push(s);
  const buckets = Array.from({ length: 10 }, () => []);
  for (const day of Object.values(byDate)) {
    const sorted = [...day].sort((a, b) => a.score - b.score);
    sorted.forEach((s, k) => buckets[Math.min(9, Math.floor((k / sorted.length) * 10))].push(s.fwd[h]));
  }
  const base = mean(v.map((s) => s.fwd[h]));
  console.log(`\n  ${title} (보유 ${h}거래일 ≈ ${Math.round(h / 21)}개월) · 전체 평균 ${pc(base)}`);
  console.log("  " + pad("십분위", 10) + padL("표본", 8) + padL("평균수익", 12) + padL("초과", 10) + padL("상승비율", 10));
  for (let d = 9; d >= 0; d--) {
    const b = buckets[d];
    if (!b.length) continue;
    const m = mean(b);
    const up = b.filter((x) => x > 0).length / b.length;
    console.log(
      "  " + pad(d === 9 ? "10 (최상)" : d === 0 ? "1 (최하)" : String(d + 1), 10) +
      padL(b.length, 8) + padL(pc(m), 12) + padL(pc(m - base), 10) + padL((up * 100).toFixed(1) + "%", 10),
    );
  }
  const top = mean(buckets[9]);
  const bot = mean(buckets[0]);
  const n = Math.min(buckets[9].length, buckets[0].length);
  // 상위-하위 차이의 표준오차 (독립 가정)
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
  const se = Math.sqrt(sd(buckets[9]) ** 2 / buckets[9].length + sd(buckets[0]) ** 2 / buckets[0].length);
  const t = (top - bot) / se;
  console.log(`  상위10% − 하위10% = ${pc(top - bot)}  (t = ${t.toFixed(2)}, 표본 ${n})`);
  console.log(`  ${Math.abs(t) >= 2 ? "→ 통계적으로 의미 있는 차이" : "→ 우연과 구분되지 않는다 (|t| < 2)"}`);
}

console.log("■ 전체 표본 — 종합평가 점수 십분위별 앞으로 수익률");
for (const h of HOLD) decileTable(samples, h, "전체");

console.log("\n\n■ 실제 거래 대상 10종목만");
const tr = samples.filter((s) => s.traded);
console.log(`  표본 ${tr.length}건`);
for (const h of [63]) {
  const v = tr.filter((s) => s.fwd[h] != null);
  if (v.length < 50) { console.log("  표본 부족"); break; }
  const half = [...v].sort((a, b) => a.score - b.score);
  const lo = half.slice(0, Math.floor(half.length / 2));
  const hi = half.slice(Math.ceil(half.length / 2));
  console.log(`  보유 ${h}일 · 상위 절반 ${pc(mean(hi.map((s) => s.fwd[h])))} vs 하위 절반 ${pc(mean(lo.map((s) => s.fwd[h])))}`);
  console.log("  (10종목뿐이라 십분위는 의미가 없어 반으로만 갈랐다)");
}

// ── 요소별 분해 ─────────────────────────────────────────────
//
// 합친 점수가 예측을 못 한다고 해서 재료가 전부 쓸모없다는 뜻은 아니다.
// 서로 반대로 당기는 요소를 한 숫자로 뭉치면 상쇄돼 사라진다.
console.log("\n\n■ 요소별로 갈라 보기 — 상위10% − 하위10% (보유 63일 ≈ 3개월)");
console.log("  " + pad("요소", 18) + padL("상위10%", 11) + padL("하위10%", 11) + padL("차이", 10) + padL("t", 8) + "  판정");
const sd2 = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
for (const [key, label] of [
  ["재무", "재무건전성"],
  ["밸류", "밸류(싼 것)"],
  ["성장", "성장성"],
  ["시총", "시가총액(큰 것)"],
  ["모멘텀", "모멘텀"],
  ["per", "PER 단독"],
  ["pbr", "PBR 단독"],
  ["roe", "ROE 단독"],
]) {
  const h = 63;
  const v = samples.filter((s) => s.fwd[h] != null && Number.isFinite(s.parts?.[key]));
  if (v.length < 200) {
    console.log("  " + pad(label, 18) + "표본 부족 (" + v.length + ")");
    continue;
  }
  const byDate = {};
  for (const s of v) (byDate[s.date] = byDate[s.date] || []).push(s);
  const top = [];
  const bot = [];
  for (const day of Object.values(byDate)) {
    const sorted = [...day].sort((a, b) => a.parts[key] - b.parts[key]);
    const n = Math.max(1, Math.floor(sorted.length / 10));
    sorted.slice(-n).forEach((s) => top.push(s.fwd[h]));
    sorted.slice(0, n).forEach((s) => bot.push(s.fwd[h]));
  }
  const dm = mean(top) - mean(bot);
  const se2 = Math.sqrt(sd2(top) ** 2 / top.length + sd2(bot) ** 2 / bot.length);
  const t = dm / se2;
  console.log(
    "  " + pad(label, 18) + padL(pc(mean(top)), 11) + padL(pc(mean(bot)), 11) +
      padL(pc(dm), 10) + padL(t.toFixed(2), 8) + "  " +
      (Math.abs(t) >= 2 ? (t > 0 ? "★ 방향 맞음" : "★ 방향 반대") : "무의미"),
  );
}

// ── 후보 신호: 방향이 맞는 요소만 ───────────────────────────
//
// 주의 — 여기서 고른 세 요소는 **같은 데이터에서 이긴 것들**이다.
// 그대로 좋다고 하면 그 기간에만 맞는 숫자를 손에 쥐게 된다.
// 그래서 기간을 반으로 갈라, 앞쪽에서도 뒤쪽에서도 유지되는지 본다.
// 앞뒤가 다르면 그 신호는 우연이다.
console.log("\n\n■ 후보 신호 — 모멘텀 + 성장 + 밸류 (동일가중)");
console.log("  방향이 맞는 요소만 모았다. 재무·시총은 이 표본에서 반대로 나와 뺐다.");
{
  const scored = samples
    .map((s) => {
      const v = [s.parts?.모멘텀, s.parts?.성장, s.parts?.밸류].filter(Number.isFinite);
      return v.length >= 2 ? { ...s, cand: mean(v) } : null;
    })
    .filter(Boolean);
  const mid = rebal[Math.floor(rebal.length / 2)];
  const spread = (rows, h) => {
    const v = rows.filter((s) => s.fwd[h] != null);
    if (v.length < 200) return null;
    const byDate = {};
    for (const s of v) (byDate[s.date] = byDate[s.date] || []).push(s);
    const top = [];
    const bot = [];
    for (const day of Object.values(byDate)) {
      const sorted = [...day].sort((a, b) => a.cand - b.cand);
      const n = Math.max(1, Math.floor(sorted.length / 10));
      sorted.slice(-n).forEach((s) => top.push(s.fwd[h]));
      sorted.slice(0, n).forEach((s) => bot.push(s.fwd[h]));
    }
    const dm = mean(top) - mean(bot);
    const se2 = Math.sqrt(sd2(top) ** 2 / top.length + sd2(bot) ** 2 / bot.length);
    return { top: mean(top), bot: mean(bot), dm, t: dm / se2, n: top.length };
  };
  console.log("  " + pad("기간", 22) + padL("상위10%", 11) + padL("하위10%", 11) + padL("차이", 10) + padL("t", 8));
  for (const [label, rows] of [
    ["전체 " + rebal[0].slice(0, 7) + "~" + rebal[rebal.length - 1].slice(0, 7), scored],
    ["앞쪽 절반", scored.filter((s) => s.date < mid)],
    ["뒤쪽 절반", scored.filter((s) => s.date >= mid)],
  ]) {
    const r = spread(rows, 63);
    if (!r) { console.log("  " + pad(label, 22) + "표본 부족"); continue; }
    console.log(
      "  " + pad(label, 22) + padL(pc(r.top), 11) + padL(pc(r.bot), 11) +
        padL(pc(r.dm), 10) + padL(r.t.toFixed(2), 8),
    );
  }
  console.log("\n  ※ t 값은 관측치가 서로 겹쳐(같은 종목이 매달, 63일 구간이 포개짐)");
  console.log("     실제보다 부풀려져 있다. 두세 배 낮다고 보는 편이 안전하다.");
}

console.log("\n\n■ 이 검증에서 뺀 것");
console.log("  기관 보유비중 12점 — 과거 시계열이 없다 (야후는 현재 값만)");
console.log("  배당 3점        — 배점이 작아 이번엔 제외");
console.log("  재무는 연 1회(사업보고서) 갱신 · 공시일 기준으로만 사용");
