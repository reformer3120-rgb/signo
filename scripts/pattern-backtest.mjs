// 차트 패턴의 '예측' 정확도 검증 (워크포워드).
//
// 모양을 제대로 알아보는가(= 인식 정확도)와, 그래서 값이 그 방향으로
// 갔는가(= 예측 정확도)는 전혀 다른 문제다. 이 스크립트는 뒤쪽을 잰다.
//
// 미래 훔쳐보기 방지
//   i 번째 봉까지만 잘라서(data.slice(0, i+1)) 감지한다. 감지 함수는
//   돌파를 data.length-1 까지 찾으므로, 자르지 않고 넘기면 아직 오지 않은
//   봉에서 돌파를 찾아낸다. 그러면 정확도가 통째로 거짓이 된다.
//
// 실행
//   npm run dev  (다른 창에서)
//   node --experimental-strip-types scripts/pattern-backtest.mjs
import { register } from "node:module";
register(
  "data:text/javascript,export async function resolve(s,c,n){if(s.startsWith('@/lib/'))return n(s.replace('@/lib/','file:///" +
    process.cwd().replace(/\\/g, "/") +
    "/src/lib/')+'.ts',c);return n(s,c)}",
  import.meta.url,
);
const { detectPattern, isNewReport, resetReports } = await import(
  `file:///${process.cwd().replace(/\\/g, "/")}/src/lib/chartPatterns.ts`
);

const BASE = process.env.BASE ?? "http://localhost:3000";
const HORIZONS = [5, 10, 20]; // 며칠 뒤를 볼 것인가
const WINDOW = 120; // 감지에 쓰는 화면 구간
const WARMUP = 60; // 이 봉 이후부터 평가

// 시총 상위 위주 40종목 — 특정 업종에 쏠리지 않게 섞었다
const UNIVERSE = [
  ["005930", "삼성전자"], ["000660", "SK하이닉스"], ["373220", "LG에너지솔루션"],
  ["207940", "삼성바이오로직스"], ["005380", "현대차"], ["000270", "기아"],
  ["005490", "POSCO홀딩스"], ["051910", "LG화학"], ["006400", "삼성SDI"],
  ["035420", "NAVER"], ["035720", "카카오"], ["068270", "셀트리온"],
  ["105560", "KB금융"], ["055550", "신한지주"], ["086790", "하나금융지주"],
  ["316140", "우리금융지주"], ["032830", "삼성생명"], ["028260", "삼성물산"],
  ["012330", "현대모비스"], ["009150", "삼성전기"], ["066570", "LG전자"],
  ["096770", "SK이노베이션"], ["034020", "두산에너빌리티"], ["012450", "한화에어로스페이스"],
  ["329180", "HD현대중공업"], ["010130", "고려아연"], ["003670", "포스코퓨처엠"],
  ["009830", "한화솔루션"], ["011200", "HMM"], ["097950", "CJ제일제당"],
  ["030200", "KT"], ["017670", "SK텔레콤"], ["015760", "한국전력"],
  ["033780", "KT&G"], ["018260", "삼성에스디에스"], ["010950", "S-Oil"],
  ["247540", "에코프로비엠"], ["086520", "에코프로"], ["196170", "알테오젠"],
  ["091990", "셀트리온헬스케어"],
];

const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - w(s)));
const padL = (s, n) => " ".repeat(Math.max(1, n - w(s))) + String(s);
const pct = (v) => (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";

async function load(code) {
  const r = await fetch(`${BASE}/api/ohlcv?code=${code}&interval=1D`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.data || []).map((x) => ({
    time: x.time, open: +x.open, high: +x.high, low: +x.low, close: +x.close, volume: +x.volume || 0,
  }));
}

const signals = [];
const baseline = { 5: [], 10: [], 20: [] };

let loaded = 0;
for (const [code, name] of UNIVERSE) {
  const d = await load(code);
  if (d.length < WARMUP + Math.max(...HORIZONS) + 10) continue;
  loaded++;
  resetReports();

  for (let i = WARMUP; i < d.length - Math.min(...HORIZONS); i++) {
    // 기준선 — 조건 없이 아무 날에나 샀을 때의 앞으로 수익률
    for (const h of HORIZONS) {
      if (i + h < d.length) baseline[h].push(d[i + h].close / d[i].close - 1);
    }

    // ★ 여기까지만 보여 준다. 자르지 않으면 미래에서 돌파를 찾는다
    const seen = d.slice(0, i + 1);
    const det = detectPattern(seen, Math.max(0, i - WINDOW + 1), i);
    if (!det) continue;
    // 같은 패턴이 며칠씩 다시 잡히는 것은 한 번의 신호로 센다
    if (!isNewReport(`${code}:1D`, det)) continue;

    const rep = det.report;
    const entry = d[i].close;
    const fwd = {};
    for (const h of HORIZONS) fwd[h] = i + h < d.length ? d[i + h].close / entry - 1 : null;

    // 목표가·반대 방향 최대 폭 (20봉 안)
    let mfe = 0, mae = 0, hitTarget = false;
    const end = Math.min(d.length - 1, i + 20);
    const up = rep.direction === "상승";
    for (let k = i + 1; k <= end; k++) {
      const gain = up ? d[k].high / entry - 1 : 1 - d[k].low / entry;
      const loss = up ? 1 - d[k].low / entry : d[k].high / entry - 1;
      if (gain > mfe) mfe = gain;
      if (loss > mae) mae = loss;
      if (det.render?.target != null) {
        if (up ? d[k].high >= det.render.target : d[k].low <= det.render.target) hitTarget = true;
      }
    }
    signals.push({
      code, name, i,
      pattern: rep.pattern,
      dir: rep.direction,
      conf: rep.confidence,
      status: rep.status.startsWith("완성") ? "완성" : "형성중",
      stale: rep.breakout_index != null ? i - rep.breakout_index : null,
      fwd, mfe, mae, hitTarget,
    });
  }
}

// ── 집계 ─────────────────────────────────────────────────────

/** 예측 방향으로 부호를 맞춘 수익률 */
const signed = (s, h) => (s.fwd[h] == null ? null : s.dir === "상승" ? s.fwd[h] : -s.fwd[h]);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

function summarize(rows, h) {
  const v = rows.map((s) => signed(s, h)).filter((x) => x != null);
  if (!v.length) return null;
  const hit = v.filter((x) => x > 0).length;
  return { n: v.length, hit, rate: hit / v.length, avg: mean(v) };
}

/** 이항분포 95% 신뢰구간 (정규근사) */
function ci(hit, n) {
  if (!n) return [NaN, NaN];
  const p = hit / n;
  const se = Math.sqrt((p * (1 - p)) / n);
  return [Math.max(0, p - 1.96 * se), Math.min(1, p + 1.96 * se)];
}

console.log(`\n종목 ${loaded}개 · 신호 ${signals.length}건 (중복 제거 후)\n`);

// 기준선 — 아무 날에나 샀을 때 오를 확률
console.log("■ 기준선 (조건 없이 아무 날) — 이걸 못 이기면 패턴은 정보가 없는 것이다");
console.log("  " + pad("기간", 8) + padL("표본", 8) + padL("상승", 8) + padL("평균", 10));
for (const h of HORIZONS) {
  const a = baseline[h];
  const up = a.filter((x) => x > 0).length;
  console.log("  " + pad(h + "봉", 8) + padL(a.length.toLocaleString(), 8) +
    padL((up / a.length * 100).toFixed(1) + "%", 8) + padL(pct(mean(a)), 10));
}

// 신호의 방향 구성에 맞춘 기준선.
// 상승 신호가 많으면 그냥 '오를 확률'과 견주면 되지만, 하락 신호가 섞이면
// 기준선도 같은 비율로 섞어야 공정한 비교가 된다.
function matchedBaseline(rows, h) {
  const a = baseline[h];
  const upRate = a.filter((x) => x > 0).length / a.length;
  const nUp = rows.filter((s) => s.dir === "상승").length;
  const nDn = rows.length - nUp;
  return (nUp * upRate + nDn * (1 - upRate)) / Math.max(1, rows.length);
}

console.log("\n■ 돌파 시점과 포착 시점의 시차");
{
  const st = signals.map((s) => s.stale).filter((x) => x != null).sort((a, b) => a - b);
  if (st.length) {
    const q = (p) => st[Math.floor((st.length - 1) * p)];
    console.log(`  표본 ${st.length}건 · 중앙값 ${q(0.5)}봉 · 하위25% ${q(0.25)}봉 · 상위25% ${q(0.75)}봉 · 최대 ${st[st.length - 1]}봉`);
    console.log(`  당일~2봉 이내(신선한 신호) ${st.filter((x) => x <= 2).length}건`);
  }
}

console.log("\n■ 패턴 신호 전체");
console.log("  " + pad("기간", 8) + padL("표본", 8) + padL("적중", 8) + padL("95% 구간", 16) + padL("평균(방향보정)", 16));
for (const h of HORIZONS) {
  const s = summarize(signals, h);
  if (!s) continue;
  const [lo, hi] = ci(s.hit, s.n);
  console.log("  " + pad(h + "봉", 8) + padL(s.n, 8) + padL((s.rate * 100).toFixed(1) + "%", 8) +
    padL(`${(lo * 100).toFixed(1)}~${(hi * 100).toFixed(1)}%`, 16) + padL(pct(s.avg), 16));
}

console.log("\n■ 신선한 신호만 — 돌파 2봉 이내에 잡힌 것");
{
  const fresh = signals.filter((s) => s.stale != null && s.stale <= 2);
  console.log("  " + pad("기간", 8) + padL("표본", 8) + padL("적중", 8) + padL("기준선", 10) + padL("차이", 10) + padL("평균", 12));
  for (const h of HORIZONS) {
    const s = summarize(fresh, h);
    if (!s) continue;
    const b = matchedBaseline(fresh, h);
    console.log("  " + pad(h + "봉", 8) + padL(s.n, 8) + padL((s.rate * 100).toFixed(1) + "%", 8) +
      padL((b * 100).toFixed(1) + "%", 10) + padL(((s.rate - b) * 100).toFixed(1) + "pp", 10) + padL(pct(s.avg), 12));
  }
}

console.log("\n■ 전체 신호 vs 방향구성을 맞춘 기준선");
console.log("  " + pad("기간", 8) + padL("적중", 8) + padL("기준선", 10) + padL("차이", 10));
for (const h of HORIZONS) {
  const s = summarize(signals, h);
  if (!s) continue;
  const b = matchedBaseline(signals, h);
  console.log("  " + pad(h + "봉", 8) + padL((s.rate * 100).toFixed(1) + "%", 8) +
    padL((b * 100).toFixed(1) + "%", 10) + padL(((s.rate - b) * 100).toFixed(1) + "pp", 10));
}

console.log("\n■ 상태별 (10봉)");
for (const st of ["완성", "형성중"]) {
  const rows = signals.filter((s) => s.status === st);
  const s = summarize(rows, 10);
  if (!s) { console.log("  " + pad(st, 10) + "표본 없음"); continue; }
  const [lo, hi] = ci(s.hit, s.n);
  console.log("  " + pad(st, 10) + padL(s.n, 6) + padL((s.rate * 100).toFixed(1) + "%", 8) +
    padL(`${(lo * 100).toFixed(1)}~${(hi * 100).toFixed(1)}%`, 16) + padL(pct(s.avg), 12));
}

console.log("\n■ 방향별 (10봉)");
for (const dir of ["상승", "하락"]) {
  const s = summarize(signals.filter((x) => x.dir === dir), 10);
  if (!s) { console.log("  " + pad(dir, 10) + "표본 없음"); continue; }
  console.log("  " + pad(dir, 10) + padL(s.n, 6) + padL((s.rate * 100).toFixed(1) + "%", 8) + padL(pct(s.avg), 12));
}

console.log("\n■ 패턴별 (10봉) — 표본이 적으면 숫자를 믿지 말 것");
const names = [...new Set(signals.map((s) => s.pattern))];
console.log("  " + pad("패턴", 18) + padL("표본", 6) + padL("적중", 8) + padL("평균", 12));
for (const nm of names.sort()) {
  const s = summarize(signals.filter((x) => x.pattern === nm), 10);
  if (!s) continue;
  console.log("  " + pad(nm, 18) + padL(s.n, 6) + padL((s.rate * 100).toFixed(1) + "%", 8) + padL(pct(s.avg), 12));
}

console.log("\n■ 확신도 구간별 (10봉) — 점수가 높을수록 더 맞아야 의미가 있다");
console.log("  " + pad("구간", 12) + padL("표본", 6) + padL("적중", 8) + padL("평균", 12));
for (const [lo2, hi2] of [[80, 85], [85, 90], [90, 95], [95, 101]]) {
  const s = summarize(signals.filter((x) => x.conf >= lo2 && x.conf < hi2), 10);
  if (!s) continue;
  console.log("  " + pad(`${lo2}~${hi2 - 1}점`, 12) + padL(s.n, 6) +
    padL((s.rate * 100).toFixed(1) + "%", 8) + padL(pct(s.avg), 12));
}

console.log("\n■ 목표가 도달 · 폭 (20봉 안)");
const th = signals.filter((s) => s.hitTarget).length;
console.log(`  목표가 도달        ${th}/${signals.length} (${(th / signals.length * 100).toFixed(1)}%)`);
console.log(`  예측방향 최대폭    ${pct(mean(signals.map((s) => s.mfe)))}`);
console.log(`  반대방향 최대폭    ${pct(mean(signals.map((s) => s.mae)))}`);
