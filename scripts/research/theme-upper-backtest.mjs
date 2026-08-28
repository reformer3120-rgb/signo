// 윗층 테마판이 흔들리는가 — 갱신 주기를 정하려면 이걸 먼저 봐야 한다.
//
// 테마판을 매주 새로 뽑는다고 할 때, 순위가 주마다 통째로 뒤집히면 그건 테마가
// 아니라 잡음이다. 반대로 몇 달을 그대로면 굳이 수시로 갱신할 이유가 없다.
// 어느 쪽인지 재서 주기를 정한다.
//
// 재는 법 — 같은 계산(theme-upper-board.mjs)을 과거 시점마다 되풀이한다.
// 끝날을 5거래일씩 뒤로 물리며 창(61일)을 미끄러뜨리고, 이웃한 두 시점의
//   겹침    상위 20 가운데 몇 개가 그대로인가
//   순위상관 스피어만 — 순서까지 얼마나 같은가
// 를 잰다. 새 종목을 부르지 않는다 — 이미 받아 둔 일봉을 자른다.
//
// 실행
//   node scripts/research/theme-upper-backtest.mjs
import fs from "node:fs";
import path from "node:path";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0" };
const DIR = ".cache/theme/upper";
const LONG = 170;    // 창 61 + 되짚을 구간
const WINDOW = 61;
const RECENT = 10;
const TOP_N = 12;
const MIN_MEMBERS = 5;
const SIZE = [5, 40];
const STEP = 5;      // 한 주 (거래일)
const SNAPSHOTS = 10;
const TOP_K = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const corr = (a, b) => {
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < a.length; i++) { sxy += a[i] * b[i]; sxx += a[i] * a[i]; syy += b[i] * b[i]; }
  const d = Math.sqrt(sxx * syy);
  return d ? sxy / d : 0;
};

/** 긴 일봉을 받아 둔다 — 짧은 것만 있으면 다시 받는다 */
async function ensureLong(codes) {
  const cache = path.join(DIR, "ohlcv-long.json");
  const bars = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, "utf8")) : {};
  const todo = codes.filter((c) => !bars[c]);
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async (c) => {
      try {
        const xml = await (await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${c}&timeframe=day&count=${LONG}&requestType=0`, { headers: UA, cache: "no-store" })).text();
        const rows = [];
        for (const m of xml.matchAll(/<item data="([^"]+)"/g)) {
          const f = m[1].split("|"), close = +f[4], vol = +f[5];
          if (/^\d{8}$/.test(f[0]) && close > 0) rows.push([f[0], close, Number.isFinite(vol) ? vol : 0]);
        }
        bars[c] = rows;
      } catch { bars[c] = null; }
    }));
    if (i % 200 === 0) { fs.writeFileSync(cache, JSON.stringify(bars)); process.stdout.write(`\r  일봉 ${i}/${todo.length}`); }
    await sleep(120);
  }
  if (todo.length) console.log("");
  fs.writeFileSync(cache, JSON.stringify(bars));
  return bars;
}

/** 한 시점의 테마판 — end 는 격자 끝에서 몇 거래일 앞인가 */
function boardAt(bars, cand, top12, back) {
  const cnt = {};
  for (const v of Object.values(bars)) if (v) for (const [d] of v) cnt[d] = (cnt[d] || 0) + 1;
  const most = Math.max(...Object.values(cnt));
  const days = Object.keys(cnt).filter((d) => cnt[d] > most * 0.9).sort();
  const end = days.length - back;
  const grid = days.slice(Math.max(0, end - WINDOW), end);
  if (grid.length < WINDOW) return null;

  const ret = {}, val = {};
  for (const [c, v] of Object.entries(bars)) {
    if (!v) continue;
    const m = new Map(v.map((r) => [r[0], r]));
    if (!grid.every((d) => m.has(d))) continue;
    const r = [];
    for (let i = 1; i < grid.length; i++) r.push(Math.log(m.get(grid[i])[1] / m.get(grid[i - 1])[1]));
    ret[c] = r;
    val[c] = grid.map((d) => m.get(d)[1] * m.get(d)[2]);
  }
  const T = grid.length - 1;
  const mkt = Array.from({ length: T }, (_, i) => { let s = 0, n = 0; for (const r of Object.values(ret)) { s += r[i]; n++; } return s / n; });
  const mm = mkt.reduce((a, b) => a + b, 0) / T;
  let mv = 0; for (const x of mkt) mv += (x - mm) ** 2;
  const res = {};
  for (const [c, r] of Object.entries(ret)) {
    const rm = r.reduce((a, b) => a + b, 0) / T;
    let cov = 0; for (let i = 0; i < T; i++) cov += (r[i] - rm) * (mkt[i] - mm);
    const beta = mv ? cov / mv : 0;
    res[c] = r.map((x, i) => x - rm - beta * (mkt[i] - mm));
  }
  const raw = (c) => {
    const v = val[c]; if (!v) return null;
    const a = v.slice(-RECENT), b = v.slice(0, -RECENT);
    const ra = a.reduce((x, y) => x + y, 0) / a.length, rb = b.reduce((x, y) => x + y, 0) / b.length;
    return rb > 0 ? ra / rb : null;
  };
  const mktSurge = median(Object.keys(val).map(raw).filter((x) => x != null));
  const W = (codes) => {
    const cs = codes.filter((c) => res[c]);
    if (cs.length < MIN_MEMBERS) return null;
    let s = 0, n = 0;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { s += corr(res[cs[i]], res[cs[j]]); n++; }
    return n ? s / n : null;
  };
  const surge = (cs) => median(cs.map(raw).filter((x) => x != null).map((x) => x / mktSurge));

  // 무작위 기준선
  const all = Object.keys(res);
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rnd = [];
  for (let k = 0; k < 1500; k++) {
    const pick = new Set(); while (pick.size < TOP_N) pick.add(all[Math.floor(rand() * all.length)]);
    const w = W([...pick]); if (w != null) rnd.push(w);
  }
  rnd.sort((a, b) => a - b);
  const P95 = rnd[Math.floor(rnd.length * 0.95)];

  const rows = [];
  for (const c of cand) {
    const top = top12(c.stocks), w = W(top), su = surge(top);
    if (w == null || su == null) continue;
    rows.push({ name: c.name, src: c.src, set: new Set(c.stocks.map((s) => s.code)), n: c.stocks.length, w, su, score: w * su });
  }
  const pass = rows.filter((r) => r.w > P95 && r.n >= SIZE[0] && r.n <= SIZE[1] && r.su >= 1).sort((a, b) => b.score - a.score);
  const overlap = (a, b) => { let i = 0; for (const c of a) if (b.has(c)) i++; return i / Math.min(a.size, b.size); };
  const board = [];
  for (const r of pass) { if (board.some((f) => overlap(r.set, f.set) > 0.6)) continue; board.push(r); }
  return { asOf: grid.at(-1), board, p95: P95 };
}

/** 스피어만 — 두 시점에 다 든 테마의 순위 상관 */
function spearman(a, b) {
  const ra = new Map(a.map((r, i) => [r.name, i]));
  const rb = new Map(b.map((r, i) => [r.name, i]));
  const both = [...ra.keys()].filter((k) => rb.has(k));
  if (both.length < 5) return null;
  const x = both.map((k) => ra.get(k)), y = both.map((k) => rb.get(k));
  const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
  return corr(x.map((v) => v - mx), y.map((v) => v - my));
}

async function main() {
  const naver = JSON.parse(fs.readFileSync(path.join(DIR, "naver.json"), "utf8"));
  const ours = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8")).themes;
  const caps = { ...JSON.parse(fs.readFileSync(".cache/theme/caps.json", "utf8")),
                 ...JSON.parse(fs.readFileSync(path.join(DIR, "caps.json"), "utf8")) };
  const cand = [
    ...naver.map((t) => ({ src: "네이버", name: t.name, stocks: t.stocks })),
    ...ours.map((t) => ({ src: "SIGNO", name: t.name, stocks: t.stocks })),
  ];
  const top12 = (st) => [...st].map((s) => ({ ...s, cap: caps[s.code] ?? -1 }))
    .sort((a, b) => b.cap - a.cap).slice(0, TOP_N).filter((s) => s.cap > 0).map((s) => s.code);
  const bars = await ensureLong([...new Set(cand.flatMap((c) => top12(c.stocks)))]);

  const snaps = [];
  for (let k = 0; k < SNAPSHOTS; k++) {
    const b = boardAt(bars, cand, top12, k * STEP);
    if (b) snaps.push(b);
  }
  snaps.reverse(); // 옛날 → 최근
  console.log(`시점 ${snaps.length}개 (${STEP}거래일 간격) · ${snaps[0].asOf} ~ ${snaps.at(-1).asOf}\n`);
  console.log("기준일        판크기  상위20 유지   순위상관   새로 든 것");
  console.log("-".repeat(88));
  const keeps = [], rhos = [];
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i];
    if (i === 0) { console.log(`${s.asOf}    ${String(s.board.length).padStart(3)}        —          —`); continue; }
    const prev = new Set(snaps[i - 1].board.slice(0, TOP_K).map((r) => r.name));
    const now = s.board.slice(0, TOP_K).map((r) => r.name);
    const kept = now.filter((n) => prev.has(n)).length;
    const rho = spearman(snaps[i - 1].board, s.board);
    keeps.push(kept); if (rho != null) rhos.push(rho);
    const fresh = now.filter((n) => !prev.has(n)).slice(0, 3);
    console.log(`${s.asOf}    ${String(s.board.length).padStart(3)}     ${String(kept).padStart(2)}/${TOP_K} (${String(Math.round(kept / TOP_K * 100)).padStart(3)}%)   ${(rho ?? 0).toFixed(3).padStart(7)}   ${fresh.join(", ").slice(0, 34)}`);
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`\n주 단위(5거래일) 평균 — 상위 20 유지 ${avg(keeps).toFixed(1)}/${TOP_K} (${Math.round(avg(keeps) / TOP_K * 100)}%) · 순위상관 ${avg(rhos).toFixed(3)}`);

  // 한 달(20거래일) 간격도 본다
  const monthly = [];
  for (let i = 4; i < snaps.length; i += 4) {
    const prev = new Set(snaps[i - 4].board.slice(0, TOP_K).map((r) => r.name));
    monthly.push(snaps[i].board.slice(0, TOP_K).filter((r) => prev.has(r.name)).length);
  }
  if (monthly.length) console.log(`한 달(20거래일) 간격 — 상위 20 유지 ${avg(monthly).toFixed(1)}/${TOP_K} (${Math.round(avg(monthly) / TOP_K * 100)}%)`);

  // 계속 붙어 있는 것 / 스쳐 간 것
  const seen = {};
  for (const s of snaps) s.board.slice(0, TOP_K).forEach((r) => (seen[r.name] = (seen[r.name] || 0) + 1));
  const rank = Object.entries(seen).sort((a, b) => b[1] - a[1]);
  console.log(`\n상위 20 에 든 적 있는 테마 ${rank.length}개 (시점 ${snaps.length}개)`);
  console.log("  붙박이 12:", rank.filter(([, v]) => v >= snaps.length - 1).slice(0, 12).map(([k, v]) => `${k}(${v})`).join(", "));
  console.log("  한 번뿐 :", rank.filter(([, v]) => v === 1).length + "개 —", rank.filter(([, v]) => v === 1).slice(0, 8).map(([k]) => k).join(", "));
}

main();
