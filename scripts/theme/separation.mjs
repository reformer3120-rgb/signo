// 테마끼리 갈라지는가 — 응집도가 못 재는 나머지 절반.
//
// 왜 필요한가 — evaluate.mjs 의 응집도는 "테마 안이 뭉치는가" 만 본다.
// 좋은 분류는 안이 뭉치는 동시에 밖과 갈라져야 한다. 2차전지 양극재 0.80 ·
// 음극재 0.76 은 각각 훌륭하지만 둘 사이 상관도 0.77 이라면 둘로 나눈
// 값어치가 없다. 쪼개기만 하면 응집도는 저절로 오르므로, 이 잣대가 없으면
// 분류를 잘게 썰수록 성적이 좋아 보이는 함정에 빠진다.
//
// ── 시장 공통분을 걷어낸다 (이걸 안 하면 잴 수가 없다) ─────────
// 처음에 생 상관으로 쟀더니 90개 테마 가운데 81개의 "가장 가까운 이웃" 이
// 2차전지 양극재·음극재로 찍혔다. 시멘트·건자재의 이웃이 양극재일 리 없다.
// 생 상관에는 시장이 통째로 오르내린 몫이 들어 있어, 고베타 묶음이 모든
// 테마와 붙어 보인 것이다.
//
// 그래서 날마다 전 종목 수익률의 평균을 시장 몫으로 놓고, 종목마다 그것에
// 회귀시켜 남은 잔차로 다시 잰다. 잔차 상관은 "시장이 움직인 것 말고 이
// 종목들끼리만 같이 움직인 몫" 이다. 테마가 실재하면 여기서도 양수로 남고,
// 이름만 붙은 묶음은 0 으로 내려앉는다.
//
// 어떻게 재나 (아래 값은 모두 잔차 기준)
//   안(W)    테마 안 종목쌍 상관의 평균
//   밖(C)    두 테마의 종목을 가로질러 맺은 쌍의 상관 평균
//   겹침도   C / W_A  이웃이 제 안만큼 붙어 있으면 1 — 나눌 값어치가 없다는 뜻
//   분리도   W_A − max_B C(A,B)  제 안이 가장 가까운 이웃보다 얼마나 더 뭉치나
//
// ── 날짜를 맞춘다 ─────────────────────────────────────────
// evaluate.mjs 는 길이가 다른 두 계열을 꼬리에서 잘라 맞춘다. 거래정지나
// 신규상장으로 봉 수가 다르면 날짜가 어긋난 채 상관을 재게 된다. 여기서는
// 날짜를 격자로 놓고 격자를 다 채우지 못한 종목은 뺀다. 그래서 이 파일의
// 생 상관 안(W) 은 report-doc.txt 의 응집도와 소수점 아래가 조금 다를 수 있다.
//
// 실행
//   node scripts/theme/separation.mjs [테마id 또는 대분류 ...]
import fs from "node:fs";
import path from "node:path";
import { ensureCaps } from "./caps.mjs";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0" };
const DIR = ".cache/theme";
const BARS = 60;
const TOP_N = 12; // evaluate.mjs 와 같은 크기 — 소형주끼리 견주는 셈이 되지 않도록
const MIN_MEMBERS = 5;
const OUT = path.join(DIR, "report-separation.txt");
const BARS_CACHE = path.join(DIR, "bars.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

/** 일봉 — 날짜와 종가를 같이 들고 온다 */
async function daily(code) {
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${BARS + 5}&requestType=0`;
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  const xml = await r.text();
  const rows = [];
  for (const m of xml.matchAll(/<item data="([^"]+)"/g)) {
    const f = m[1].split("|");
    const c = Number(f[4]);
    if (/^\d{8}$/.test(f[0]) && Number.isFinite(c) && c > 0) rows.push([f[0], c]);
  }
  return rows;
}

// ── 테마와 구성종목 ────────────────────────────────────────
const data = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const only = process.argv.slice(2);
const allCodes = [...new Set(data.themes.flatMap((t) => t.stocks.map((s) => s.code)))];
const caps = await ensureCaps(allCodes, console.log);

const groups = data.themes
  .map((t) => ({
    id: t.id,
    name: t.name,
    group: t.group,
    total: t.stocks.length,
    codes: [...t.stocks]
      .sort((a, b) => (caps[b.code] ?? 0) - (caps[a.code] ?? 0))
      .slice(0, TOP_N)
      .map((s) => s.code),
  }))
  .filter((g) => g.codes.length >= MIN_MEMBERS);

// ── 일봉 (같은 날 받아 둔 것은 다시 받지 않는다) ───────────────
let cache = {};
try {
  const c = JSON.parse(fs.readFileSync(BARS_CACHE, "utf8"));
  if (c.날짜 === today) cache = c.bars ?? {};
} catch { /* 없으면 새로 받는다 */ }

const need = [...new Set(groups.flatMap((g) => g.codes))];
const todo = need.filter((c) => !cache[c]);
if (todo.length) {
  process.stdout.write(`일봉 ${todo.length}종목 수집`);
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map(async (c) => {
      try { cache[c] = await daily(c); } catch { cache[c] = []; }
    }));
    if (i % 100 === 0) process.stdout.write(".");
    await sleep(120);
  }
  fs.writeFileSync(BARS_CACHE, JSON.stringify({ 날짜: today, bars: cache }));
  console.log(" 끝");
} else {
  console.log(`일봉 ${need.length}종목 — 오늘 받아 둔 것을 쓴다`);
}

// ── 날짜 격자 ──────────────────────────────────────────────
const freq = {};
for (const c of need) for (const [d] of cache[c] ?? []) freq[d] = (freq[d] ?? 0) + 1;
const grid = Object.entries(freq)
  .filter(([, n]) => n >= need.length * 0.9) // 거의 모든 종목에 있는 날만
  .map(([d]) => d)
  .sort()
  .slice(-(BARS + 1));

/** 격자 위 z점수 수익률 — 격자를 다 못 채운 종목은 뺀다 */
const Z = {};
for (const c of need) {
  const m = new Map(cache[c] ?? []);
  const px = grid.map((d) => m.get(d));
  if (px.some((v) => !Number.isFinite(v))) continue;
  const r = [];
  for (let i = 1; i < px.length; i++) r.push(Math.log(px[i] / px[i - 1]));
  const mu = r.reduce((s, v) => s + v, 0) / r.length;
  const sd = Math.sqrt(r.reduce((s, v) => s + (v - mu) ** 2, 0) / r.length);
  if (!sd) continue;
  Z[c] = r.map((v) => (v - mu) / sd);
}
const N = grid.length - 1;
const codes = Object.keys(Z);

for (const g of groups) g.codes = g.codes.filter((c) => Z[c]);
const live = groups.filter((g) => g.codes.length >= MIN_MEMBERS);
console.log(`테마 ${live.length}개 · 종목 ${new Set(live.flatMap((g) => g.codes)).size} · 거래일 ${N}일 (${grid[0]}~${grid.at(-1)})`);

// ── 시장 몫을 걷어낸다 ─────────────────────────────────────
// 날마다 전 종목 z수익률의 평균이 시장 몫이다. 종목마다 여기에 회귀시켜
// 잔차를 남기고, 다시 z점수로 만들어 상관을 바로 내적으로 잰다.
const M = new Array(N).fill(0);
for (const c of codes) for (let i = 0; i < N; i++) M[i] += Z[c][i] / codes.length;
const mVar = M.reduce((s, v) => s + v * v, 0) / N;
const E = {};
for (const c of codes) {
  const beta = Z[c].reduce((s, v, i) => s + v * M[i], 0) / N / mVar;
  const e = Z[c].map((v, i) => v - beta * M[i]);
  const sd = Math.sqrt(e.reduce((s, v) => s + v * v, 0) / N);
  E[c] = e.map((v) => v / sd);
}
const 시장설명력 = codes.reduce((s, c) => {
  const b = Z[c].reduce((t, v, i) => t + v * M[i], 0) / N / mVar;
  return s + (b * b * mVar);
}, 0) / codes.length;

// ── 안(W) 과 밖(C) — 생 상관과 잔차 상관 두 벌 ────────────────
function measure(S) {
  const corr = (a, b) => { let s = 0; for (let i = 0; i < N; i++) s += S[a][i] * S[b][i]; return s / N; };
  const W = {};
  for (const g of live) {
    const v = [];
    for (let i = 0; i < g.codes.length; i++)
      for (let j = i + 1; j < g.codes.length; j++) v.push(corr(g.codes[i], g.codes[j]));
    W[g.id] = v.reduce((s, x) => s + x, 0) / v.length;
  }
  const C = {};
  const pairs = [];
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const A = live[i], B = live[j];
      const shared = A.codes.filter((c) => B.codes.includes(c)).length;
      let s = 0, n = 0;
      for (const a of A.codes) for (const b of B.codes) { if (a === b) continue; s += corr(a, b); n++; }
      const c = s / n;
      C[`${A.id}|${B.id}`] = c;
      C[`${B.id}|${A.id}`] = c;
      pairs.push({ A, B, c, ov: c / Math.max(W[A.id], W[B.id]), shared });
    }
  const near = {};
  for (const g of live) {
    let best = null;
    for (const h of live) if (h !== g) {
      const c = C[`${g.id}|${h.id}`];
      if (!best || c > best.c) best = { id: h.id, name: h.name, c };
    }
    near[g.id] = best;
  }
  const avgW = live.reduce((s, g) => s + W[g.id], 0) / live.length;
  const avgC = pairs.reduce((s, p) => s + p.c, 0) / pairs.length;
  return { corr, W, C, pairs, near, avgW, avgC };
}

const RAW = measure(Z);
const RES = measure(E);

// ── 보고서 ─────────────────────────────────────────────────
const wide = (s) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
const pad = (s, n) => s + " ".repeat(Math.max(1, n - wide(s)));
const sign = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
const L = [];

L.push(`■ 시장 몫  전 종목 수익률 변동의 ${(시장설명력 * 100).toFixed(0)}% 가 시장 공통분이다.`);
L.push("   아래 값은 그것을 걷어낸 잔차로 잰 것이다 (생 상관은 맨 끝에).");
L.push("");

L.push("■ 겹치는 테마 20쌍 — 밖(잔차)이 큰 순서");
for (const p of [...RES.pairs].sort((a, b) => b.c - a.c).slice(0, 20))
  L.push(`  ${pad(p.A.name, 20)}${pad(p.B.name, 20)}안 ${RES.W[p.A.id].toFixed(3)}·${RES.W[p.B.id].toFixed(3)}  밖 ${p.c.toFixed(3)}  겹침 ${p.ov.toFixed(2)}${p.shared ? `  (공통 ${p.shared}종목)` : ""}`);

const sep = live
  .map((g) => ({ g, w: RES.W[g.id], n: RES.near[g.id], d: RES.W[g.id] - RES.near[g.id].c }))
  .sort((a, b) => a.d - b.d);
const row = (s) => `  ${pad(s.g.name, 20)}안 ${s.w.toFixed(3)}  이웃 ${pad(s.n.name, 20)}${s.n.c.toFixed(3)}  분리 ${sign(s.d)}`;

L.push("");
L.push("■ 분리도 — 제 안이 가장 가까운 이웃보다 얼마나 더 뭉치나");
L.push("  ▼ 낮은 쪽 12개 — 이웃과 구별되지 않는다");
for (const s of sep.slice(0, 12)) L.push(row(s));
L.push("  ▲ 높은 쪽 12개 — 저만의 동인이 있다");
for (const s of sep.slice(-12).reverse()) L.push(row(s));

L.push("");
L.push("■ 테마 전체 — 잔차 안(W) 순 (참고: 생 상관 안 = report-doc.txt 의 응집도)");
for (const s of [...sep].sort((a, b) => b.w - a.w))
  L.push(`  ${pad(s.g.name, 20)}잔차 ${s.w.toFixed(3)}  생 ${RAW.W[s.g.id].toFixed(3)}  분리 ${sign(s.d)}  이웃 ${s.n.name}`);

L.push("");
L.push("■ 대분류 안 — 쪼갠 자리가 정말 갈라지는가 (잔차)");
const byG = {};
for (const p of RES.pairs) if (p.A.group === p.B.group) (byG[p.A.group] ??= []).push(p);
for (const [g, ps] of Object.entries(byG).sort((a, b) => b[1].length - a[1].length)) {
  const n = new Set(ps.flatMap((p) => [p.A.id, p.B.id])).size;
  const inW = [...new Set(ps.flatMap((p) => [p.A.id, p.B.id]))].reduce((s, id) => s + RES.W[id], 0) / n;
  const avgC = ps.reduce((s, p) => s + p.c, 0) / ps.length;
  const worst = ps.reduce((a, b) => (b.c > a.c ? b : a));
  L.push(`  ${pad(g, 14)}테마 ${pad(String(n), 4)}안 ${inW.toFixed(3)}  밖 ${avgC.toFixed(3)}  겹침 ${(avgC / inW).toFixed(2)}  가장 붙은 쌍 ${worst.A.name}↔${worst.B.name} ${worst.c.toFixed(3)}`);
}

if (only.length) {
  const pick = live.filter((g) => only.includes(g.id) || only.includes(g.group));
  if (pick.length) {
    L.push("");
    L.push(`■ 지정한 테마끼리 — 잔차 상관 (${only.join(" ")})`);
    L.push("  " + pad("", 20) + pick.map((g) => pad(g.name.slice(0, 7), 9)).join(""));
    for (const a of pick)
      L.push("  " + pad(a.name, 20) + pick.map((b) => pad(a === b ? `[${RES.W[a.id].toFixed(2)}]` : RES.C[`${a.id}|${b.id}`].toFixed(2), 9)).join(""));
    L.push("  대각선 [ ] 은 제 안, 나머지는 교차 상관이다.");
  }
}

const badR = sep.filter((s) => s.d <= 0).length;
const badRaw = live.filter((g) => RAW.W[g.id] - RAW.near[g.id].c <= 0).length;
L.push("");
L.push("■ 요약");
L.push(`                        잔차      생 상관`);
L.push(`  안(W) 평균            ${RES.avgW.toFixed(3)}     ${RAW.avgW.toFixed(3)}`);
L.push(`  밖(C) 평균            ${RES.avgC.toFixed(3)}     ${RAW.avgC.toFixed(3)}   (전 ${RES.pairs.length}쌍)`);
L.push(`  안 − 밖               ${sign(RES.avgW - RES.avgC)}    ${sign(RAW.avgW - RAW.avgC)}`);
L.push(`  겹침도 평균            ${(RES.avgC / RES.avgW).toFixed(2)}      ${(RAW.avgC / RAW.avgW).toFixed(2)}`);
L.push(`  이웃보다 못 뭉치는 테마  ${badR}/${live.length}     ${badRaw}/${live.length}`);
L.push("");
L.push("  생 상관 쪽 숫자는 시장이 통째로 움직인 몫이 섞여 있어 테마를 가릴 수 없다.");
L.push("  판단은 잔차 열로 한다.");

const text = L.join("\n");
console.log("\n" + text);
fs.writeFileSync(OUT, text);
console.log(`\n→ ${OUT}`);
