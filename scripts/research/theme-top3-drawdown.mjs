// 테마별 주요종목(시총 상위 3)의 고점 대비 하락률 · 최근 3개월 저점 대비 상승률.
//
//   node scripts/research/theme-top3-drawdown.mjs
//
// 값은 모두 직전 정규장 종가 기준이다(장중 미완성 봉은 버린다).
// 시세는 네이버 fchart 일봉, 시총은 .cache/theme/caps.json (억 원).
import fs from "node:fs";
import path from "node:path";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" };
const CACHE = ".cache/theme/ohlc.json";
const COUNT = 400;            // 여유 있게 1년 반. 52주 고점을 안전하게 덮는다.
const TOP_N = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 네이버 일봉 → [{d,o,h,l,c,v}] */
async function daily(code) {
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${COUNT}&requestType=0`;
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  if (!r.ok) return null;
  const xml = await r.text();
  const rows = [];
  for (const m of xml.matchAll(/<item data="([^"]+)"/g)) {
    const p = m[1].split("|");
    const [d, o, h, l, c, v] = p;
    if (!/^\d{8}$/.test(d)) continue;
    const n = [o, h, l, c].map(Number);
    if (!n.every((x) => Number.isFinite(x) && x > 0)) continue;
    rows.push({ d, o: n[0], h: n[1], l: n[2], c: n[3], v: Number(v) });
  }
  return rows.length ? rows : null;
}

const ymd = (dt) => dt.toISOString().slice(0, 10).replace(/-/g, "");
const fmtD = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;

async function main() {
  const src = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
  const caps = JSON.parse(fs.readFileSync(".cache/theme/caps.json", "utf8"));

  // 테마마다 시총 상위 3종목
  const picks = src.themes.map((t) => ({
    ...t,
    top: [...t.stocks]
      .map((s) => ({ ...s, cap: caps[s.code] ?? null }))
      .sort((a, b) => (b.cap ?? -1) - (a.cap ?? -1))
      .slice(0, TOP_N),
  }));

  const codes = [...new Set(picks.flatMap((p) => p.top.map((s) => s.code)))];
  console.log(`테마 ${picks.length}개 · 종목 ${codes.length}개`);

  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const bars = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const todo = codes.filter((c) => !bars[c]);
  for (let i = 0; i < todo.length; i += 8) {
    const chunk = todo.slice(i, i + 8);
    await Promise.all(chunk.map(async (c) => {
      try { bars[c] = await daily(c); } catch { bars[c] = null; }
    }));
    fs.writeFileSync(CACHE, JSON.stringify(bars));
    process.stdout.write(`\r시세 ${Math.min(i + 8, todo.length)}/${todo.length}`);
    await sleep(150);
  }
  if (todo.length) console.log("");
  fs.writeFileSync(CACHE, JSON.stringify(bars));

  // 장중 미완성 봉은 버린다 (평가 시점 = 직전 정규장 종가)
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  const today = ymd(kst);
  const closed = kst.getHours() > 15 || (kst.getHours() === 15 && kst.getMinutes() >= 40);

  const out = [];
  for (const t of picks) {
    for (const s of t.top) {
      const raw = bars[s.code];
      if (!raw || raw.length < 30) { out.push({ theme: t, s, err: "시세 없음" }); continue; }
      const rows = closed ? raw : raw.filter((r) => r.d !== today);
      const last = rows[rows.length - 1];

      // 52주(=최근 250거래일) 고점 — 장중 고가 기준
      const y1 = rows.slice(-250);
      let hi = y1[0], lo3 = null;
      for (const r of y1) if (r.h > hi.h) hi = r;
      // 최근 3개월(=최근 62거래일) 저점 — 장중 저가 기준
      const q = rows.slice(-62);
      for (const r of q) if (!lo3 || r.l < lo3.l) lo3 = r;

      out.push({
        theme: t, s,
        date: last.d, price: last.c,
        hiDate: hi.d, hi: hi.h, dd: (last.c / hi.h - 1) * 100,
        loDate: lo3.d, lo: lo3.l, up: (last.c / lo3.l - 1) * 100,
        span: rows.length,
      });
    }
  }
  fs.writeFileSync(".cache/theme/top3-metrics.json", JSON.stringify({ asOf: out.find((o) => o.date)?.date, rows: out.map((o) => ({ ...o, theme: { id: o.theme.id, name: o.theme.name, group: o.theme.group } })) }, null, 1));
  console.log("계산 완료:", out.length, "행 · 기준일", out.find((o) => o.date)?.date);
  console.log("샘플:", out.slice(0, 3).map((o) => `${o.s.name} ${o.dd?.toFixed(1)}% / +${o.up?.toFixed(1)}%`).join(" | "));
  console.log("결측:", out.filter((o) => o.err).length);
}
main();
