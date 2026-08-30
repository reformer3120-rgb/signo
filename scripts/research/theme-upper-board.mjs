// 윗층 테마판 프로토타입 — "돈이 들어온 것이 테마다".
//
// 아래층(src/data/themes.json)은 사업보고서로 판정하는 사업 분류다. 분기에 한 번
// 굳고, 한 종목이 한 칸에 든다. 이 파일은 그 위에 얹을 윗층을 시험한다.
//
// 윗층은 문서로 판정하지 않는다. 판정 기준이 둘뿐이다.
//   실재하는가  잔차 상관 W — 시장 공통분을 걷어낸 뒤에도 저희끼리 같이 움직이는가
//   돈이 왔는가 상대 거래대금 — 최근 10일/직전 50일 배수를, 시장 전체 배수로 나눈 값
//
// 왜 잔차·상대값이냐 — 생 상관으로는 못 잰다. 수익률 변동의 42% 가 시장 공통분이라
// 고베타 묶음이 모든 테마의 이웃으로 찍힌다(separation.mjs 머리말). 거래대금도 같다.
// 이 구간의 시장 전체 거래대금 배수가 0.61 이라, 안 나누면 살아 있는 테마까지
// 전부 ×0.3~0.7 로 찍혀 아무것도 안 걸린다.
//
// 후보 목록은 네이버 테마(267개) + 우리 아래층(91개)을 함께 쓴다. 베끼는 것이
// 아니다 — 목록은 후보일 뿐이고 판정은 우리가 한다. 실제로 네이버 것 중 초전도체
// ·희토류·콜드체인·CCUS·신규상장 따위는 무작위 수준이라 떨어진다.
//
// 실행
//   node scripts/research/theme-upper-board.mjs
// 결과 → .cache/theme/upper/board.json · SIGNO-윗층-테마판.md
import fs from "node:fs";
import path from "node:path";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0" };
const DIR = ".cache/theme/upper";
const BARS = 70;          // 격자 61일 + 여유
const WINDOW = 61;        // 거래일 격자
const RECENT = 10;        // 거래대금 최근 구간
const TOP_N = 12;         // 테마당 시총 상위 몇으로 재나 (separation.mjs 와 같게)
const MIN_MEMBERS = 5;
const SIZE = [5, 40];     // 종목 수 — 40 넘으면 테마가 아니라 업종이다
const RANDOM_TRIALS = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = new TextDecoder("euc-kr");

const load = (p, d) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : d);
const save = (p, v) => fs.writeFileSync(p, JSON.stringify(v));

/** 네이버 테마 목록과 구성종목 — 후보 풀 */
async function naverThemes() {
  const cache = path.join(DIR, "naver.json");
  const have = load(cache, null);
  if (have) return have;
  const get = async (u) => dec.decode(await (await fetch(u, { headers: UA, cache: "no-store" })).arrayBuffer());
  const list = [];
  for (let p = 1; p <= 7; p++) {
    const h = await get(`https://finance.naver.com/sise/theme.naver?&page=${p}`);
    for (const m of h.matchAll(/sise_group_detail\.naver\?type=theme&no=(\d+)">([^<]+)</g))
      list.push({ no: m[1], name: m[2].trim() });
    await sleep(120);
  }
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(async (t) => {
      const h = await get(`https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${t.no}`);
      const seen = new Map();
      for (const m of h.matchAll(/\/item\/main\.naver\?code=(\d{6})">([^<]+)</g)) seen.set(m[1], m[2].trim());
      t.stocks = [...seen].map(([code, name]) => ({ code, name }));
    }));
    process.stdout.write(`\r  네이버 ${Math.min(i + 6, list.length)}/${list.length}`);
    await sleep(120);
  }
  console.log("");
  save(cache, list);
  return list;
}

/** 시총 — .cache/theme/caps.json 을 쓰고 모자란 것만 채운다 */
async function ensureCaps(codes) {
  const caps = { ...load(".cache/theme/caps.json", {}), ...load(path.join(DIR, "caps.json"), {}) };
  const todo = codes.filter((c) => caps[c] === undefined);
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async (c) => {
      try {
        const j = await (await fetch(`https://m.stock.naver.com/api/stock/${c}/integration`, { headers: UA, cache: "no-store" })).json();
        const s = String((j.totalInfos ?? []).find((t) => t.code === "marketValue")?.value ?? "").replace(/,/g, "");
        const jo = /(\d+)\s*조/.exec(s), eok = /(\d+)\s*억/.exec(s);
        caps[c] = jo || eok ? (jo ? +jo[1] * 10000 : 0) + (eok ? +eok[1] : 0) : null;
      } catch { caps[c] = null; }
    }));
    await sleep(100);
  }
  if (todo.length) save(path.join(DIR, "caps.json"), caps);
  return caps;
}

/** 일봉 — 종가와 거래대금을 같이 쓴다 */
async function ensureBars(codes) {
  const cache = path.join(DIR, "ohlcv.json");
  const bars = load(cache, {});
  const todo = codes.filter((c) => !bars[c]);
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async (c) => {
      try {
        const xml = await (await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${c}&timeframe=day&count=${BARS}&requestType=0`, { headers: UA, cache: "no-store" })).text();
        const rows = [];
        for (const m of xml.matchAll(/<item data="([^"]+)"/g)) {
          const f = m[1].split("|"), close = +f[4], vol = +f[5];
          if (/^\d{8}$/.test(f[0]) && close > 0) rows.push([f[0], close, Number.isFinite(vol) ? vol : 0]);
        }
        bars[c] = rows;
      } catch { bars[c] = null; }
    }));
    if (i % 200 === 0) { save(cache, bars); process.stdout.write(`\r  일봉 ${i}/${todo.length}`); }
    await sleep(120);
  }
  if (todo.length) console.log("");
  save(cache, bars);
  return bars;
}

const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

const corr = (a, b) => {
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < a.length; i++) { sxy += a[i] * b[i]; sxx += a[i] * a[i]; syy += b[i] * b[i]; }
  const d = Math.sqrt(sxx * syy);
  return d ? sxy / d : 0;
};

/** 날짜 격자 · 잔차 · 상대 거래대금 */
function metrics(bars) {
  // 거래정지나 신규상장으로 봉 수가 다르면 날짜가 어긋난 채 재게 된다.
  // 격자를 놓고 다 채우지 못한 종목은 뺀다 (separation.mjs 와 같은 처리).
  const cnt = {};
  for (const v of Object.values(bars)) if (v) for (const [d] of v) cnt[d] = (cnt[d] || 0) + 1;
  const most = Math.max(...Object.values(cnt));
  const grid = Object.keys(cnt).filter((d) => cnt[d] > most * 0.9).sort().slice(-WINDOW);

  const ret = {}, val = {};
  for (const [c, v] of Object.entries(bars)) {
    if (!v) continue;
    const m = new Map(v.map((r) => [r[0], r]));
    if (!grid.every((d) => m.has(d))) continue;
    const r = [];
    for (let i = 1; i < grid.length; i++) r.push(Math.log(m.get(grid[i])[1] / m.get(grid[i - 1])[1]));
    ret[c] = r;
    val[c] = grid.map((d) => m.get(d)[1] * m.get(d)[2]); // 거래대금 = 종가 × 거래량
  }

  // 시장 몫을 회귀로 걷어낸 잔차
  const T = grid.length - 1;
  const mkt = Array.from({ length: T }, (_, i) => {
    let s = 0, n = 0;
    for (const r of Object.values(ret)) { s += r[i]; n++; }
    return s / n;
  });
  const mm = mkt.reduce((a, b) => a + b, 0) / T;
  let mv = 0;
  for (const x of mkt) mv += (x - mm) ** 2;
  const res = {};
  for (const [c, r] of Object.entries(ret)) {
    const rm = r.reduce((a, b) => a + b, 0) / T;
    let cov = 0;
    for (let i = 0; i < T; i++) cov += (r[i] - rm) * (mkt[i] - mm);
    const beta = mv ? cov / mv : 0;
    res[c] = r.map((x, i) => x - rm - beta * (mkt[i] - mm));
  }

  const raw = (c) => {
    const v = val[c];
    if (!v) return null;
    const a = v.slice(-RECENT), b = v.slice(0, -RECENT);
    const ra = a.reduce((x, y) => x + y, 0) / a.length;
    const rb = b.reduce((x, y) => x + y, 0) / b.length;
    return rb > 0 ? ra / rb : null;
  };
  const mktSurge = median(Object.keys(val).map(raw).filter((x) => x != null));
  return { grid, res, raw, mktSurge };
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const naver = await naverThemes();
  const ours = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8")).themes;
  const cand = [
    ...naver.map((t) => ({ src: "네이버", name: t.name, stocks: t.stocks })),
    ...ours.map((t) => ({ src: "SIGNO", name: t.name, stocks: t.stocks })),
  ];
  const caps = await ensureCaps([...new Set(cand.flatMap((c) => c.stocks.map((s) => s.code)))]);
  const top12 = (st) => [...st].map((s) => ({ ...s, cap: caps[s.code] ?? -1 }))
    .sort((a, b) => b.cap - a.cap).slice(0, TOP_N).filter((s) => s.cap > 0).map((s) => s.code);
  const bars = await ensureBars([...new Set(cand.flatMap((c) => top12(c.stocks)))]);
  const { grid, res, raw, mktSurge } = metrics(bars);

  const W = (codes) => {
    const cs = codes.filter((c) => res[c]);
    if (cs.length < MIN_MEMBERS) return null;
    let s = 0, n = 0;
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) { s += corr(res[cs[i]], res[cs[j]]); n++; }
    return n ? s / n : null;
  };
  const surge = (cs) => median(cs.map(raw).filter((x) => x != null).map((x) => x / mktSurge));

  // 무작위 기준선 — 아무 12종목이나 묶어도 이만큼은 나온다
  const all = Object.keys(res);
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rnd = [];
  for (let k = 0; k < RANDOM_TRIALS; k++) {
    const pick = new Set();
    while (pick.size < TOP_N) pick.add(all[Math.floor(rand() * all.length)]);
    const w = W([...pick]);
    if (w != null) rnd.push(w);
  }
  rnd.sort((a, b) => a - b);
  const P95 = rnd[Math.floor(rnd.length * 0.95)];

  const names = new Map(cand.flatMap((c) => c.stocks).map((s) => [s.code, s.name]));
  const rows = [];
  for (const c of cand) {
    const top = top12(c.stocks), w = W(top), su = surge(top);
    if (w == null || su == null) continue;
    rows.push({ src: c.src, name: c.name, n: c.stocks.length, set: new Set(c.stocks.map((s) => s.code)), top, w, su, score: w * su });
  }
  const pass = rows
    .filter((r) => r.w > P95 && r.n >= SIZE[0] && r.n <= SIZE[1] && r.su >= 1)
    .sort((a, b) => b.score - a.score);

  // ── 중복 떼기 두 번 ────────────────────────────────────────
  // (1) 종목이 겹치는 것. 자카드로는 못 뗀다 — 전력기기·전선(37종목)과
  //     전선(8종목)은 사실상 같은 것인데 크기가 달라 자카드가 낮게 나온다.
  //     |A∩B| / min(|A|,|B|) 로 봐야 잡힌다.
  // (2) 종목은 안 겹치는데 같이 움직이는 것. 네이버 "겨울"(22종목)은 구성이
  //     제약주 위주라 잔차 0.307 로 멀쩡히 통과하는데, 백신 테마와 이름만
  //     다르다. 종목 겹침으로는 안 떼진다. separation.mjs 의 분리도를 판 안에
  //     그대로 쓴다 — 겹침도(밖/안)가 1 을 넘으면, 곧 이웃이 제 안보다 더
  //     붙어 있으면 따로 세울 값어치가 없다.
  //
  //     경계를 1.0 으로 둔 것은 실측이다. 재 보면 두 무리로 깨끗이 갈린다.
  //       중복  전력기기·전선↔전선 1.17 · PCB↔반도체 기판 1.15 · mRNA↔모더나 1.05
  //       별개  겨울↔바이오시밀러 0.89 · LPG↔해운 0.83 · 환율하락↔해운 0.69
  const overlap = (a, b) => { let i = 0; for (const c of a) if (b.has(c)) i++; return i / Math.min(a.size, b.size); };
  const cross = (a, b) => {
    const x = a.filter((c) => res[c]), y = b.filter((c) => res[c]);
    if (!x.length || !y.length) return 0;
    let s = 0, n = 0;
    for (const p of x) for (const q of y) { if (p === q) continue; s += corr(res[p], res[q]); n++; }
    return n ? s / n : 0;
  };
  const board = [], dropped = [];
  for (const r of pass) {
    const twinBy = board.find((f) => overlap(r.set, f.set) > 0.6);
    if (twinBy) { dropped.push({ ...r, why: `종목 겹침 — ${twinBy.name}` }); continue; }
    const near = board.find((f) => cross(r.top, f.top) >= r.w);
    if (near) { dropped.push({ ...r, why: `같이 움직임 — ${near.name} (겹침도 ${(cross(r.top, near.top) / r.w).toFixed(2)})` }); continue; }
    board.push(r);
  }
  const cooled = rows
    .filter((r) => r.w > 0.3 && r.su < 0.95 && r.n >= SIZE[0] && r.n <= SIZE[1])
    .sort((a, b) => a.su - b.su);

  const d = grid.at(-1);
  const asOf = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  save(path.join(DIR, "board.json"), {
    asOf, p95: P95, mktSurge,
    board: board.map((r) => ({
      src: r.src, name: r.name, n: r.n, w: +r.w.toFixed(3), su: +r.su.toFixed(2), score: +r.score.toFixed(3),
      top: r.top.map((c) => ({ code: c, name: names.get(c) })),
      // 화면이 구성종목을 다 그려야 하므로 전부 남긴다. 위의 top 은 재는 데
      // 쓴 시총 상위 12종목이라 그것만으로는 목록을 못 만든다.
      codes: [...r.set],
    })),
  });

  const L = [];
  L.push(`# 윗층 테마판 시험 (${asOf} 기준)`);
  L.push("");
  L.push(`후보 ${rows.length}개(네이버 ${naver.length} + 아래층 ${ours.length}) → 조건 통과 ${pass.length} → 중복 정리 **${board.length}개**`);
  L.push("");
  L.push("| 잣대 | 뜻 | 경계 |");
  L.push("|---|---|---|");
  L.push(`| 잔차 W | 시장 공통분을 걷어낸 뒤 남는 종목끼리의 상관 | 무작위 12종목의 상위 5% = **${P95.toFixed(3)}** |`);
  L.push(`| 거래대금 | 최근 ${RECENT}일 / 직전 ${grid.length - 1 - RECENT}일 배수를 시장 배수(${mktSurge.toFixed(2)})로 나눈 값 | **×1.00 초과** |`);
  L.push(`| 규모 | 종목 수 | ${SIZE[0]}~${SIZE[1]} — 넘으면 테마가 아니라 업종 |`);
  L.push("");
  L.push("본 자료의 지표는 투자 참고용이며, 투자의 최종 책임은 투자자 본인에게 있습니다.");
  L.push("");
  L.push("## 지금 살아 있는 테마 30");
  L.push("");
  L.push("| # | 테마 | 종목 | 잔차 | 거래대금 | 점수 | 출처 | 대표종목 |");
  L.push("|--:|---|--:|--:|--:|--:|---|---|");
  board.slice(0, 30).forEach((r, i) =>
    L.push(`| ${i + 1} | ${r.name} | ${r.n} | ${r.w.toFixed(3)} | ×${r.su.toFixed(2)} | ${r.score.toFixed(3)} | ${r.src} | ${r.top.slice(0, 3).map((c) => names.get(c)).join(", ")} |`));
  L.push("");
  L.push("## 식은 테마 — 뭉치기는 하는데 돈이 빠졌다 (내려갈 자리)");
  L.push("");
  L.push("| 테마 | 잔차 | 거래대금 | 출처 |");
  L.push("|---|--:|--:|---|");
  cooled.slice(0, 10).forEach((r) => L.push(`| ${r.name} | ${r.w.toFixed(3)} | ×${r.su.toFixed(2)} | ${r.src} |`));
  L.push("");
  L.push("## 이름만 다른 것으로 보고 뗀 것");
  L.push("");
  L.push("| 테마 | 잔차 | 뗀 까닭 |");
  L.push("|---|--:|---|");
  dropped.slice(0, 20).forEach((r) => L.push(`| ${r.name} | ${r.w.toFixed(3)} | ${r.why} |`));
  L.push("");
  fs.writeFileSync("SIGNO-윗층-테마판.md", L.join("\n"));
  console.log(`후보 ${rows.length} → 통과 ${pass.length} → 정리 ${board.length} · 무작위 경계 ${P95.toFixed(3)} · 시장 거래대금 ×${mktSurge.toFixed(2)}`);
  console.log("→ SIGNO-윗층-테마판.md · .cache/theme/upper/board.json");
}

main();
