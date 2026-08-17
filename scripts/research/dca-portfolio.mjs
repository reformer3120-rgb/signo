// 분할매수 + 섹터 분산 + 리밸런싱 — 무엇이 실제로 도움이 되는가.
//
// 앞선 dca.mjs 는 '전 종목 균등' 하나만 봤다. 여기서는 세 가지를 더 본다.
//   1) 섹터를 고르게 나누면 나아지는가 (전 종목 균등 vs 섹터 균등)
//   2) 리밸런싱을 언제 하는가 (안 함 / 신규자금으로만 / 정기 / 편차 발생 시)
//   3) 시장 상황에 따라 비중을 바꾸면 나아지는가 (200일선 아래면 방어 섹터로)
//
// 계산을 섹터 지수 11개로 줄인다
//   종목 489개를 그대로 굴리면 시작일마다 수백만 번 계산해야 한다. 섹터별
//   균등 지수를 먼저 만들고 그 11개로 굴리면 결과는 같으면서 훨씬 빠르다.
//   ('전 종목 균등' 은 섹터 지수를 종목 수로 가중한 것과 같다)
//
// 시작일 운을 빼려고 가능한 모든 시작일을 돌린다.
//
// 실행
//   EDGAR_UA="이름 메일주소" node scripts/research/dca-portfolio.mjs
import { loadStocks, pad, padL, pc, mean } from "./engine.mjs";

const YEARS = 20; // 2008 금융위기를 포함시킨다
const COST = 0.0005; // 한 방향 0.05%
const HORIZONS = [
  [252, "1년"],
  [504, "2년"],
  [756, "3년"],
];
const MA = 200; // 시장 상황 판단용 이동평균

// 200일선 아래일 때 비중을 실어 줄 방어 섹터
const DEFENSIVE = new Set(["Consumer Staples", "Health Care", "Utilities"]);

// ── 자료 ─────────────────────────────────────────────────────

/** 따옴표 안의 쉼표를 지키는 최소 CSV 파서 (회사명에 쉼표가 들어 있다) */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

console.log("S&P 500 명단·섹터 조회…");
const csv = await fetch(
  "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
).then((r) => r.text());
const sectorOf = {};
for (const line of csv.trim().split("\n").slice(1)) {
  const c = parseCsvLine(line);
  const t = c[0].trim().replace(/\./g, "-");
  if (/^[A-Z-]{1,6}$/.test(t)) sectorOf[t] = c[2].trim();
}
{
  const cnt = {};
  for (const s of Object.values(sectorOf)) cnt[s] = (cnt[s] || 0) + 1;
  console.log(`  ${Object.keys(sectorOf).length}종목 · 섹터 ${Object.keys(cnt).length}개`);
}

console.log("\n자료 수집 중…");
const { stock } = await loadStocks(Object.keys(sectorOf), YEARS, (n, t) => {
  if (n % 100 === 0) process.stdout.write(`  ${n}/${t}\r`);
});
console.log(`  ${Object.keys(stock).length}종목 확보          `);

// ── 섹터 지수 ────────────────────────────────────────────────

const seen = new Set();
for (const s of Object.values(stock)) for (const p of s.px) seen.add(p.d);
const dates = [...seen].sort();

const SECTORS = [...new Set(Object.values(sectorOf))].sort();
const K = SECTORS.length;

// ret[k][i] = i번째 날 k섹터의 일간 수익률 · cnt[k][i] = 그날 편입 종목 수
const ret = SECTORS.map(() => new Float64Array(dates.length));
const cnt = SECTORS.map(() => new Int32Array(dates.length));
for (const [sym, s] of Object.entries(stock)) {
  const k = SECTORS.indexOf(sectorOf[sym]);
  if (k < 0) continue;
  for (let i = 1; i < dates.length; i++) {
    const a = s.idx[dates[i - 1]];
    const b = s.idx[dates[i]];
    if (a == null || b == null) continue;
    ret[k][i] += s.px[b].c / s.px[a].c - 1;
    cnt[k][i]++;
  }
}
for (let k = 0; k < K; k++) {
  for (let i = 0; i < dates.length; i++) if (cnt[k][i]) ret[k][i] /= cnt[k][i];
}

console.log("\n  섹터별 종목 수 (최근)");
for (let k = 0; k < K; k++) {
  const n = cnt[k][dates.length - 1];
  console.log(`    ${pad(SECTORS[k], 26)}${padL(n, 4)}종목${DEFENSIVE.has(SECTORS[k]) ? "   (방어)" : ""}`);
}

/** 전 종목 균등 = 섹터를 종목 수로 가중한 것과 같다 */
const W_ALL = (() => {
  const last = dates.length - 1;
  const total = SECTORS.reduce((a, _, k) => a + cnt[k][last], 0);
  return SECTORS.map((_, k) => cnt[k][last] / total);
})();
/** 섹터 균등 */
const W_SECTOR = SECTORS.map(() => 1 / K);
/** 하락장용 — 방어 3섹터에 60%, 나머지에 40% */
const W_DEFENSE = (() => {
  const d = SECTORS.filter((s) => DEFENSIVE.has(s)).length;
  const o = K - d;
  return SECTORS.map((s) => (DEFENSIVE.has(s) ? 0.6 / d : 0.4 / o));
})();

// 시장 상황 — 전 종목 균등 지수의 200일선
const mktLevel = new Float64Array(dates.length);
mktLevel[0] = 100;
for (let i = 1; i < dates.length; i++) {
  const r = SECTORS.reduce((a, _, k) => a + W_ALL[k] * ret[k][i], 0);
  mktLevel[i] = mktLevel[i - 1] * (1 + r);
}
const aboveMA = new Uint8Array(dates.length);
{
  let sum = 0;
  for (let i = 0; i < dates.length; i++) {
    sum += mktLevel[i];
    if (i >= MA) sum -= mktLevel[i - MA];
    // ★ 어제까지의 평균과 어제 종가를 본다 — 오늘 값을 쓰면 미래를 훔친다
    aboveMA[i] = i > MA && mktLevel[i - 1] > (sum - mktLevel[i]) / MA ? 1 : 0;
  }
}
console.log(`\n  200일선 위에 있던 날 ${((aboveMA.reduce((a, b) => a + b, 0) / dates.length) * 100).toFixed(1)}%`);

// ── 모의 ─────────────────────────────────────────────────────

/**
 * 매일 1원씩 넣는 분할매수를 하루씩 따라간다.
 *
 * @param target  목표 비중 (regime 이면 무시하고 시장 상황으로 정한다)
 * @param policy  "none"   목표 비중대로 사기만 하고 기존 보유는 그대로
 *                "flow"   신규 자금을 모자란 섹터에 몰아준다 (파는 게 없어 비용 없음)
 *                "p:N"    N거래일마다 목표 비중으로 되돌린다 (매도·매수 비용 발생)
 *                "band:X" 어느 섹터든 목표에서 X 이상 벗어나면 되돌린다
 * @param regime  true 면 200일선 아래일 때 방어 비중으로 바꾼다
 */
function simulate(start, H, { target, policy, regime = false }) {
  const v = new Float64Array(K); // 섹터별 평가액
  let invested = 0;
  let peak = 0;
  let mdd = 0;
  let costPaid = 0;
  let switches = 0;
  let prevDefense = false;

  for (let j = start; j < start + H; j++) {
    // 1) 하루 수익 반영
    for (let k = 0; k < K; k++) v[k] *= 1 + ret[k][j];

    const w = regime && !aboveMA[j] ? W_DEFENSE : target;
    if (regime) {
      const nowDefense = !aboveMA[j];
      if (nowDefense !== prevDefense) switches++;
      prevDefense = nowDefense;
    }

    let total = 0;
    for (let k = 0; k < K; k++) total += v[k];

    // 2) 리밸런싱
    let doRebal = false;
    if (policy.startsWith("p:")) doRebal = total > 0 && (j - start) % Number(policy.slice(2)) === 0;
    else if (policy.startsWith("band:")) {
      const band = Number(policy.slice(5));
      if (total > 0) for (let k = 0; k < K; k++) if (Math.abs(v[k] / total - w[k]) > band) { doRebal = true; break; }
    }
    // 시장 상황이 바뀐 날은 비중을 갈아야 하므로 무조건 리밸런싱
    if (regime && switches && total > 0 && prevDefense !== undefined) {
      const need = SECTORS.some((_, k) => Math.abs(v[k] / total - w[k]) > 0.05);
      if (need) doRebal = true;
    }
    if (doRebal) {
      let turn = 0;
      for (let k = 0; k < K; k++) turn += Math.abs(w[k] * total - v[k]);
      const c = (turn / 2) * COST * 2; // 판 만큼 사므로 양쪽에 비용
      costPaid += c;
      total -= c;
      for (let k = 0; k < K; k++) v[k] = w[k] * total;
    }

    // 3) 오늘 1원 넣기
    if (policy === "flow" && total > 0) {
      // 모자란 섹터부터 채운다 — 팔지 않으므로 비용이 안 든다
      let need = 0;
      const gap = new Float64Array(K);
      for (let k = 0; k < K; k++) {
        gap[k] = Math.max(0, w[k] * (total + 1) - v[k]);
        need += gap[k];
      }
      if (need > 0) for (let k = 0; k < K; k++) v[k] += gap[k] / need;
      else for (let k = 0; k < K; k++) v[k] += w[k];
    } else {
      for (let k = 0; k < K; k++) v[k] += w[k];
    }
    invested += 1;

    let now = 0;
    for (let k = 0; k < K; k++) now += v[k];
    // 낙폭은 '넣은 돈 대비 평가액' 기준
    const ratio = now / invested;
    peak = Math.max(peak, ratio);
    if (peak > 0) mdd = Math.min(mdd, ratio / peak - 1);
  }
  let end = 0;
  for (let k = 0; k < K; k++) end += v[k];
  return { ret: end / invested - 1, mdd, cost: costPaid / invested, switches };
}

function runAll(H, opts) {
  const rets = [];
  const mdds = [];
  const costs = [];
  for (let s = MA + 1; s + H <= dates.length; s++) {
    const r = simulate(s, H, opts);
    rets.push(r.ret);
    mdds.push(r.mdd);
    costs.push(r.cost);
  }
  const sorted = [...rets].sort((a, b) => a - b);
  const q = (p) => sorted[Math.floor((sorted.length - 1) * p)];
  return {
    n: rets.length,
    win: rets.filter((x) => x > 0).length / rets.length,
    med: q(0.5),
    p10: q(0.1),
    worst: sorted[0],
    mdd: mean(mdds),
    cost: mean(costs),
  };
}

const HEAD =
  "  " + pad("방식", 30) + padL("승산", 8) + padL("중앙값", 10) + padL("하위10%", 10) +
  padL("최악", 10) + padL("평균낙폭", 10) + padL("비용", 8);

function row(label, r) {
  console.log(
    "  " + pad(label, 30) + padL((r.win * 100).toFixed(1) + "%", 8) + padL(pc(r.med), 10) +
      padL(pc(r.p10), 10) + padL(pc(r.worst), 10) + padL(pc(r.mdd), 10) + padL(pc(r.cost), 8),
  );
}

// ── 1) 섹터 분산 ────────────────────────────────────────────

console.log("\n\n■ 섹터를 고르게 나누면 나아지는가 (리밸런싱 없음)");
for (const [H, label] of HORIZONS) {
  console.log(`\n  ── ${label} 적립 ──`);
  console.log(HEAD);
  row("전 종목 균등 (기존)", runAll(H, { target: W_ALL, policy: "none" }));
  row("섹터 균등 (11개 동일)", runAll(H, { target: W_SECTOR, policy: "none" }));
}

// ── 2) 리밸런싱 ─────────────────────────────────────────────

console.log("\n\n■ 리밸런싱을 언제 할 것인가 (섹터 균등, 2년 적립)");
console.log(HEAD);
row("안 함", runAll(504, { target: W_SECTOR, policy: "none" }));
row("신규 자금으로만 (안 팜)", runAll(504, { target: W_SECTOR, policy: "flow" }));
row("월 1회", runAll(504, { target: W_SECTOR, policy: "p:21" }));
row("분기 1회", runAll(504, { target: W_SECTOR, policy: "p:63" }));
row("반기 1회", runAll(504, { target: W_SECTOR, policy: "p:126" }));
row("연 1회", runAll(504, { target: W_SECTOR, policy: "p:252" }));
row("편차 5% 넘으면", runAll(504, { target: W_SECTOR, policy: "band:0.05" }));
row("편차 10% 넘으면", runAll(504, { target: W_SECTOR, policy: "band:0.10" }));

// ── 3) 시장 상황 ────────────────────────────────────────────

console.log("\n\n■ 시장 상황에 따라 비중을 바꾸면 (200일선 아래면 방어 섹터 60%)");
console.log("  방어 = 필수소비재 · 헬스케어 · 유틸리티");
for (const [H, label] of HORIZONS) {
  console.log(`\n  ── ${label} 적립 ──`);
  console.log(HEAD);
  row("섹터 균등 고정", runAll(H, { target: W_SECTOR, policy: "flow" }));
  row("200일선 아래면 방어로", runAll(H, { target: W_SECTOR, policy: "flow", regime: true }));
}

console.log("\n■ 읽을 때");
console.log("  · 200일선 판정은 어제까지의 값만 쓴다. 오늘 종가를 쓰면 미래를 훔치는 것이다.");
console.log("  · '평균낙폭' 은 넣은 돈 대비 평가액이 고점에서 얼마나 빠졌는지의 평균이다.");
console.log("  · 섹터 분류는 현재 기준이다. 과거에 다른 섹터였던 회사는 반영되지 않는다.");
console.log("  · 현재 S&P500 편입 명단이라 그동안 빠진 회사는 없다 (생존 편향).");
