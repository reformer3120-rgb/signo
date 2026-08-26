// 자체 분류의 응집도를 재고, 에프앤가이드 기준선과 견준다.
//
// 잣대 — 진짜 테마라면 구성종목이 같이 움직인다. 테마 안 종목쌍의 일간
// 수익률 상관을 재고, 시장에서 아무렇게나 뽑은 묶음과 견준다.
//
// ── 공정하게 견주려면 ──────────────────────────────────────
// 기준선은 에프앤가이드 테마의 "시총 상위 12종목" 으로 쟀다. 우리 쪽을
// 점수 상위로 뽑으면 소형주끼리 견주는 셈이라 불리하다. 그래서 여기서도
// 시총 순으로 뽑는다 (scripts/theme/caps.mjs).
//
// 기준선 값 자체도 한 번 틀렸다. 처음에 테마 6개로 재서 0.579 라고 알았는데,
// 30개로 넓히니 0.508 이었다. 강세 테마만 골라 재면 부풀려진다.
//
// 대조군도 마찬가지다. 테마 종목 안에서 뽑으면 이미 서로 겹치므로
// 기준선이 부풀어 테마 효과가 사라져 보인다 (처음에 그렇게 재서 차이가
// 0.071 로 나왔다. 시장에서 뽑으니 0.194 였다).
//
// 실행
//   node scripts/theme/evaluate.mjs
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "./dict.mjs";
import { ensureCaps } from "./caps.mjs";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0" };
const DIR = ".cache/theme";
const BARS = 60;
const MIN_MEMBERS = 5;
const TOP_N = 12; // 기준선과 같은 크기

// 기준선은 cohesion.mjs 가 실제로 잰 값을 쓴다.
// 처음에는 0.579 로 알고 있었는데 테마 6개로만 잰 값이었다.
// 30개로 넓히니 0.508 이었다 — 강세 테마만 골라 재면 부풀려진다.
const FN_BASE = (() => {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(DIR, "baseline.json"), "utf8"));
    return { theme: b.theme, random: b.random, p95: b.p95, n: b.n };
  } catch {
    return { theme: 0.508, random: 0.366, p95: 0.486, n: 30 };
  }
})();

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

export async function evaluate(log = console.log) {
  const cls = JSON.parse(fs.readFileSync(path.join(DIR, "classified.json"), "utf8"));
  const named = Object.fromEntries(THEMES.map((t) => [t.id, t.name]));

  // 시총을 채우고, 테마마다 시총 상위 TOP_N 을 고른다
  const allCodes = [...new Set(Object.values(cls).flat().map((x) => x.code))];
  const caps = await ensureCaps(allCodes, log);

  const groups = Object.entries(cls)
    .map(([id, list]) => ({
      id,
      name: named[id] ?? id,
      total: list.length,
      codes: [...list]
        .sort((a, b) => (caps[b.code] ?? 0) - (caps[a.code] ?? 0))
        .slice(0, TOP_N)
        .map((x) => x.code),
    }))
    .filter((g) => g.codes.length >= MIN_MEMBERS);

  if (!groups.length) {
    log(`구성종목 ${MIN_MEMBERS}개 이상인 테마가 없다.`);
    return null;
  }

  // 대조군 — 기준선을 잴 때 쓴 것을 그대로 쓴다.
  //
  // 여기서 새로 뽑으면 "테마에 안 든 종목" 중에서 뽑게 되는데, 분류가 넓어질수록
  // 그 풀이 작고 별난 종목만 남아 무작위 응집도가 내려간다. 그러면 우리 쪽
  // 올린 폭만 저절로 커진다. 실제로 분류를 1,633 → 1,737 종목으로 넓혔더니
  // 무작위가 0.356 → 0.327 로 내려가 122% 라는 숫자가 나왔다. 기준이 흔들린 것이다.
  const themeSet = new Set(groups.flatMap((g) => g.codes));
  let market = [];
  try {
    const b = JSON.parse(fs.readFileSync(path.join(DIR, "baseline.json"), "utf8"));
    if (Array.isArray(b.market) && b.market.length >= 30) market = b.market;
  } catch { /* 없으면 아래에서 새로 뽑는다 */ }
  if (!market.length) {
    for (const m of ["KOSPI", "KOSDAQ"]) {
      try {
        const rows = (await (await fetch(`http://localhost:3000/api/marketcap?market=${m}&limit=100`)).json()).data;
        for (const r of rows ?? []) if (!themeSet.has(r.code)) market.push(r.code);
      } catch { /* 서버가 없으면 건너뛴다 */ }
    }
  }
  if (market.length < 30) {
    log("대조군을 만들 수 없다 — 개발 서버(npm run dev)가 떠 있어야 한다.");
    return null;
  }

  const all = [...themeSet, ...market];
  log(`테마 ${groups.length}개 · 종목 ${themeSet.size} · 대조군 ${market.length} · 일봉 수집…`);
  const R = {};
  for (let i = 0; i < all.length; i += 10) {
    await Promise.all(all.slice(i, i + 10).map(async (c) => {
      try { R[c] = await daily(c); } catch { R[c] = []; }
    }));
    await sleep(120);
  }

  const vals = [];
  for (const g of groups) {
    const v = cohesion(g.codes, R);
    if (v !== null) vals.push({ name: g.name, v, n: g.codes.length, total: g.total });
  }
  vals.sort((a, b) => b.v - a.v);
  const ours = vals.reduce((s, x) => s + x.v, 0) / vals.length;

  let seed = 987654321;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const sizes = vals.map((x) => x.n);
  const randVals = [];
  for (let k = 0; k < 300; k++) {
    const n = sizes[k % sizes.length];
    const s = [...market].sort(() => rnd() - 0.5).slice(0, n);
    const v = cohesion(s, R);
    if (v !== null) randVals.push(v);
  }
  randVals.sort((a, b) => a - b);
  const avgRand = randVals.reduce((s, v) => s + v, 0) / randVals.length;
  const p95 = randVals[Math.floor(randVals.length * 0.95)];

  const lines = [];
  lines.push(`■ 우리 분류의 응집도 (시총 상위 ${TOP_N}, 최근 ${BARS}거래일)`);
  for (const x of vals) {
    const mark = x.v >= p95 ? "★" : x.v >= avgRand ? "·" : " ";
    lines.push(`  ${mark} ${x.name.padEnd(20)}${x.v.toFixed(3)}  (${x.n}/${x.total}종목)`);
  }
  lines.push("");
  lines.push("■ 견줌");
  lines.push(`  우리 분류 평균          ${ours.toFixed(3)}`);
  lines.push(`  무작위 묶음 평균        ${avgRand.toFixed(3)}  (${randVals.length}회, 같은 크기)`);
  lines.push(`  무작위 상위 5% 경계     ${p95.toFixed(3)}`);
  lines.push(`  차이                    ${ours - avgRand >= 0 ? "+" : ""}${(ours - avgRand).toFixed(3)}`);
  lines.push(`  무작위 상위 5% 를 넘은 테마  ${vals.filter((x) => x.v > p95).length}/${vals.length}`);
  lines.push("");
  const lift = ours - avgRand;
  const fnLift = FN_BASE.theme - FN_BASE.random;
  lines.push("■ 에프앤가이드 대비");
  lines.push(`  에프앤가이드 평균       ${FN_BASE.theme.toFixed(3)} (테마 ${FN_BASE.n}개 · 무작위 ${FN_BASE.random.toFixed(3)} · 올린 폭 +${fnLift.toFixed(3)})`);
  lines.push(`  우리 평균               ${ours.toFixed(3)} (무작위 ${avgRand.toFixed(3)}, 올린 폭 ${lift >= 0 ? "+" : ""}${lift.toFixed(3)})`);
  lines.push(`  → 올린 폭 기준 ${((lift / fnLift) * 100).toFixed(0)}%`);
  lines.push(`  → 응집도 자체로는 ${((ours / FN_BASE.theme) * 100).toFixed(0)}%  (${ours.toFixed(3)} 대 ${FN_BASE.theme.toFixed(3)})`);
  lines.push("");
  lines.push("  같은 조건(시총 상위 12 · 최근 60거래일 · 같은 대조군)에서 잰 값이다.");

  const text = lines.join("\n");
  log(text);
  return { ours, avgRand, p95, lift, ratio: lift / fnLift, vals, text };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const r = await evaluate();
  // 기준서 PDF(doc-data.mjs)가 이 파일에서 테마별 응집도를 긁어 간다.
  // 여기서 안 남기면 지난번 측정값이 그대로 인쇄된다 — 테마를 90개에서
  // 91개로 늘린 날에도 기준서는 "60개 테마" 라고 적혀 있었다.
  fs.writeFileSync(path.join(DIR, "report-doc.txt"), r.text + "\n");
  console.log(`\n→ ${path.join(DIR, "report-doc.txt")}`);
}
