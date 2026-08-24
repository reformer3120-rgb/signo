// 에프앤가이드 테마 분류의 응집도 — 자체 분류가 겨눌 기준선.
//
// 왜 필요한가 — 자체 테마 분류를 만들면 "잘 만들었는지" 를 잴 방법이 없다.
// 에프앤가이드 분류와 겹치는 비율로 재는 것은 안 된다. 그 자체가 남의
// 분류를 참조해 쓰는 것이라, 라이선스를 피하려고 만든 물건을 검증하는 데
// 라이선스 대상을 쓰는 꼴이 된다.
//
// 대신 성질로 잰다. 진짜 테마라면 구성종목이 같이 움직인다. 그래서
// 테마 안 종목쌍의 일간 수익률 상관을 재고, 시장에서 아무렇게나 뽑은
// 묶음과 견준다.
//
// 대조군을 테마 종목 안에서 뽑으면 안 된다. 그것들은 이미 서로 겹치므로
// 기준선이 부풀어 테마 효과가 사라져 보인다 (처음에 이렇게 재서 차이가
// 0.071 로 나왔다. 시장에서 뽑으니 0.194 였다).
//
// 처음에는 테마 6개로만 쟀다. 비교 대상으로 삼기에 얇아서, 종목 수가
// 넉넉한 테마를 폭넓게 뽑아 다시 잰다.
//
// 실행 — 개발 서버가 떠 있어야 한다
//   node scripts/theme/cohesion.mjs [테마수]
import fs from "node:fs";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" };
const BARS = 60;
const TOP_N = 12;
const N_THEMES = Number(process.argv[2]) || 30;
const OUT = ".cache/theme/baseline.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function daily(code) {
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${BARS}&requestType=0`;
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  const xml = await r.text();
  const cs = [];
  for (const m of xml.matchAll(/<item data="([^"]+)"/g)) {
    const c = Number(m[1].split("|")[4]);
    if (Number.isFinite(c) && c > 0) cs.push(c);
  }
  const out = [];
  for (let i = 1; i < cs.length; i++) out.push(Math.log(cs[i] / cs[i - 1]));
  return out;
}

function corr(a, b) {
  if (!a || !b) return null;
  const n = Math.min(a.length, b.length);
  if (n < 20) return null;
  const x = a.slice(-n), y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const den = Math.sqrt(sxx * syy);
  return den ? sxy / den : null;
}

function cohesion(codes, R) {
  const v = [];
  for (let i = 0; i < codes.length; i++)
    for (let j = i + 1; j < codes.length; j++) {
      const c = corr(R[codes[i]], R[codes[j]]);
      if (c !== null) v.push(c);
    }
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

const j = async (u) => (await (await fetch(u)).json()).data;

// 종목 수가 넉넉한 테마를 고루 뽑는다. 너무 큰 테마(지주사·밸류업 등)는
// 사실상 시장 전체라 기준선을 흐리므로 뺀다.
const list = await j("http://localhost:3000/api/themes");
const cands = list
  .map((t) => ({ no: t.no, name: t.name, n: t.up + t.flat + t.down }))
  .filter((t) => t.n >= TOP_N && t.n <= 60)
  .sort((a, b) => b.n - a.n);

// 고루 흩어 뽑는다 (큰 테마만 몰리지 않게)
const step = Math.max(1, Math.floor(cands.length / N_THEMES));
const picked = [];
for (let i = 0; i < cands.length && picked.length < N_THEMES; i += step) picked.push(cands[i]);
console.log(`후보 ${cands.length}개 중 ${picked.length}개 선정 (구성종목 ${TOP_N}~60)`);

const themes = [];
for (const p of picked) {
  try {
    const d = await j(`http://localhost:3000/api/themes/${p.no}`);
    if (!d?.stocks?.length) continue;
    themes.push({
      name: d.name || p.name,
      codes: [...d.stocks].sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0)).slice(0, TOP_N).map((s) => s.code),
    });
  } catch { /* 건너뛴다 */ }
  await sleep(150);
}

const themeSet = new Set(themes.flatMap((t) => t.codes));
const market = [];
for (const m of ["KOSPI", "KOSDAQ"]) {
  const rows = await j(`http://localhost:3000/api/marketcap?market=${m}&limit=100`);
  for (const r of rows ?? []) if (!themeSet.has(r.code)) market.push(r.code);
}

const all = [...themeSet, ...market];
process.stdout.write(`테마 ${themes.length} · 종목 ${themeSet.size} · 대조군 ${market.length} · 일봉 수집…`);
const R = {};
for (let i = 0; i < all.length; i += 10) {
  await Promise.all(all.slice(i, i + 10).map(async (c) => {
    try { R[c] = await daily(c); } catch { R[c] = []; }
  }));
  await sleep(120);
}
console.log(" 완료\n");

const vals = [];
for (const t of themes) {
  const v = cohesion(t.codes, R);
  if (v !== null) vals.push({ name: t.name, v });
}
vals.sort((a, b) => b.v - a.v);
console.log(`■ 에프앤가이드 테마 응집도 (시총 상위 ${TOP_N}, 최근 ${BARS}거래일)`);
for (const x of vals) console.log("  " + x.name.padEnd(30) + x.v.toFixed(3));
const avg = vals.reduce((s, x) => s + x.v, 0) / vals.length;
const med = [...vals].sort((a, b) => a.v - b.v)[Math.floor(vals.length / 2)].v;

let seed = 20260825;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const randVals = [];
for (let k = 0; k < 300; k++) {
  const s = [...market].sort(() => rnd() - 0.5).slice(0, TOP_N);
  const v = cohesion(s, R);
  if (v !== null) randVals.push(v);
}
randVals.sort((a, b) => a - b);
const avgRand = randVals.reduce((s, v) => s + v, 0) / randVals.length;
const p95 = randVals[Math.floor(randVals.length * 0.95)];

console.log("\n■ 기준선");
console.log(`  테마 평균          ${avg.toFixed(3)}  (중앙값 ${med.toFixed(3)}, ${vals.length}개)`);
console.log(`  무작위 평균        ${avgRand.toFixed(3)}  (${randVals.length}회)`);
console.log(`  무작위 상위 5%     ${p95.toFixed(3)}`);
console.log(`  올린 폭            +${(avg - avgRand).toFixed(3)}`);
console.log(`  무작위 상위 5% 를 넘은 테마  ${vals.filter((x) => x.v > p95).length}/${vals.length}`);

fs.writeFileSync(OUT, JSON.stringify({ theme: avg, median: med, random: avgRand, p95, n: vals.length, vals }, null, 1));
console.log(`\n→ ${OUT}`);
