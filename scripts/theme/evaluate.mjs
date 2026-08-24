// 자체 분류의 응집도를 재고, 에프앤가이드 기준선과 견준다.
//
// 잣대 — 진짜 테마라면 구성종목이 같이 움직인다. 테마 안 종목쌍의 일간
// 수익률 상관을 재고, 시장에서 아무렇게나 뽑은 묶음과 견준다.
//
// 기준선 (scripts/theme/cohesion.mjs 로 잰 값)
//   에프앤가이드 테마 평균  0.579
//   무작위 묶음 평균        0.385
//   무작위 상위 5% 경계     0.527
//
// 실행
//   node scripts/theme/evaluate.mjs
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "./dict.mjs";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" };
const DIR = ".cache/theme";
const BARS = 60;
const MIN_MEMBERS = 5; // 이보다 적으면 상관이 흔들려 의미가 없다
const CAP_MEMBERS = 15; // 점수 높은 순으로 이만큼만

const FN_BASE = { theme: 0.579, random: 0.385, p95: 0.527 };

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

// ── 우리 분류
const cls = JSON.parse(fs.readFileSync(path.join(DIR, "classified.json"), "utf8"));
const named = Object.fromEntries(THEMES.map((t) => [t.id, t.name]));
const groups = Object.entries(cls)
  .map(([id, list]) => ({
    id,
    name: named[id] ?? id,
    codes: list.slice(0, CAP_MEMBERS).map((x) => x.code),
  }))
  .filter((g) => g.codes.length >= MIN_MEMBERS);

if (!groups.length) {
  console.log(`구성종목 ${MIN_MEMBERS}개 이상인 테마가 없다. 수집을 더 해야 한다.`);
  process.exit(0);
}

// ── 대조군: 시장 전체 (개발 서버의 시총 상위)
const themeSet = new Set(groups.flatMap((g) => g.codes));
const market = [];
for (const m of ["KOSPI", "KOSDAQ"]) {
  try {
    const rows = (await (await fetch(`http://localhost:3000/api/marketcap?market=${m}&limit=100`)).json()).data;
    for (const r of rows ?? []) if (!themeSet.has(r.code)) market.push(r.code);
  } catch { /* 서버가 없으면 건너뛴다 */ }
}
if (market.length < 30) {
  console.log("대조군을 만들 수 없다 — 개발 서버(npm run dev)가 떠 있어야 한다.");
  process.exit(1);
}

const all = [...themeSet, ...market];
process.stdout.write(`테마 ${groups.length}개 · 종목 ${themeSet.size} · 대조군 ${market.length} · 일봉 수집…`);
const R = {};
for (let i = 0; i < all.length; i += 10) {
  await Promise.all(all.slice(i, i + 10).map(async (c) => {
    try { R[c] = await daily(c); } catch { R[c] = []; }
  }));
  await sleep(120);
}
console.log(" 완료\n");

console.log("■ 우리 분류의 응집도");
const vals = [];
for (const g of groups) {
  const v = cohesion(g.codes, R);
  if (v === null) continue;
  vals.push({ name: g.name, v, n: g.codes.length });
}
vals.sort((a, b) => b.v - a.v);
for (const x of vals) {
  const mark = x.v >= FN_BASE.p95 ? "★" : x.v >= FN_BASE.random ? "·" : " ";
  console.log("  " + mark + " " + x.name.padEnd(20) + x.v.toFixed(3) + "  (" + x.n + "종목)");
}
const ours = vals.reduce((s, x) => s + x.v, 0) / vals.length;

// 대조군 — 시장에서 같은 크기로 아무렇게나
let seed = 987654321;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const sizes = vals.map((x) => x.n);
const randVals = [];
for (let k = 0; k < 200; k++) {
  const n = sizes[k % sizes.length];
  const s = [...market].sort(() => rnd() - 0.5).slice(0, n);
  const v = cohesion(s, R);
  if (v !== null) randVals.push(v);
}
randVals.sort((a, b) => a - b);
const avgRand = randVals.reduce((s, v) => s + v, 0) / randVals.length;
const p95 = randVals[Math.floor(randVals.length * 0.95)];

console.log("\n■ 견줌");
console.log("  우리 분류 평균          " + ours.toFixed(3));
console.log("  무작위 묶음 평균        " + avgRand.toFixed(3) + `  (${randVals.length}회, 같은 크기)`);
console.log("  무작위 상위 5% 경계     " + p95.toFixed(3));
console.log("  차이                    +" + (ours - avgRand).toFixed(3));
console.log("  무작위 상위 5% 를 넘은 테마  " + vals.filter((x) => x.v > p95).length + "/" + vals.length);

console.log("\n■ 에프앤가이드 대비");
console.log("  에프앤가이드 평균       " + FN_BASE.theme.toFixed(3));
console.log("  우리 평균               " + ours.toFixed(3));
const ratio = (ours - avgRand) / (FN_BASE.theme - FN_BASE.random);
console.log(
  "  무작위 위로 올린 폭     우리 +" + (ours - avgRand).toFixed(3) +
    " vs 에프앤 +" + (FN_BASE.theme - FN_BASE.random).toFixed(3) +
    "  → " + (ratio * 100).toFixed(0) + "%",
);
