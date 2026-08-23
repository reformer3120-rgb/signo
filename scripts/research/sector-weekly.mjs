// 섹터 강약 — 일별 말고 주간(그리고 임의 기간) 시계열을 만든다.
//
// 왜 직접 계산하나
//   네이버 업종 API 는 '당일 등락률' 하나만 준다. 과거 시계열이 없다.
//   네이버 지수 차트는 업종 코드를 받지 않고(빈 배열), KRX 정보데이터시스템은
//   세션을 요구한다(400 LOGOUT). 직접 계산이 유일한 길이다.
//
// 어떻게
//   화면의 업종 등락률은 시가총액 가중 평균이다 (앞서 반도체 -7.53% 가
//   시총가중과 정확히 일치함을 확인했다). 같은 방식으로 기간만 늘린다.
//     업종 수익률 = Σ(종목 시총비중 × 종목 기간수익률)
//
//   구성종목 전체를 다 받으면 4,400종목이라 너무 무겁다. 시총 상위 N개만
//   써도 되는지를 '당일 값이 네이버와 맞는가' 로 검증한 뒤 정한다.
//
// 실행
//   node --experimental-strip-types scripts/research/sector-weekly.mjs
import { register } from "node:module";
const CWD = process.cwd().split(String.fromCharCode(92)).join("/");
// TS 파일을 그대로 불러오기 위한 경로 해석
//   @/lib/x  → src/lib/x.ts        (프로젝트 별칭)
//   ./x      → ./x.ts              (naverApi 가 내부에서 ./naver 를 부른다)
const HOOK =
  "export async function resolve(s,c,n){" +
  "if(s.startsWith('@/lib/'))return n(s.replace('@/lib/','file:///" + CWD + "/src/lib/')+'.ts',c);" +
  "if((s.startsWith('./')||s.startsWith('../'))&&!/[.][a-z]+$/.test(s))return n(s+'.ts',c);" +
  "return n(s,c)}";
register("data:text/javascript," + encodeURIComponent(HOOK), import.meta.url);
const { sectors, sectorStocks } = await import(`file:///${CWD}/src/lib/naverApi.ts`);
const { bars } = await import(`file:///${CWD}/src/lib/naver.ts`);

const wid = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - wid(s)));
const padL = (s, n) => " ".repeat(Math.max(1, n - wid(s))) + String(s);
const pct = (v) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) + "%" : "—");

/** 몇 개씩 동시에 — 네이버에 몰아치지 않도록 */
async function pool(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

const barsCache = new Map();
async function dailyBars(code, count) {
  if (barsCache.has(code)) return barsCache.get(code);
  let v = [];
  try {
    v = await bars(code, "day", count);
  } catch {
    /* 상장폐지·거래정지 등 */
  }
  barsCache.set(code, v);
  return v;
}

/** 구성종목의 시총가중 기간수익률. days=1 이면 당일 */
function weighted(rows, days) {
  let wsum = 0;
  let acc = 0;
  for (const r of rows) {
    const b = r.px;
    if (!b || b.length < days + 1 || !(r.cap > 0)) continue;
    const now = b[b.length - 1].close;
    const then = b[b.length - 1 - days].close;
    if (!(then > 0)) continue;
    acc += r.cap * (now / then - 1);
    wsum += r.cap;
  }
  return wsum > 0 ? (acc / wsum) * 100 : NaN;
}

const TOP_N = Number(process.env.TOP_N ?? 20);
const list = await sectors();
console.log(`업종 ${list.length}개 · 각 시총 상위 ${TOP_N}종목으로 계산\n`);

// 구성종목
const secs = await pool(list, 6, async (s) => ({
  ...s,
  rows: (await sectorStocks(s.code, TOP_N)).map((x) => ({ ...x })),
}));

// 일봉 (중복 제거)
const codes = [...new Set(secs.flatMap((s) => s.rows.map((r) => r.code)))];
console.log(`구성종목 ${codes.length}개 일봉 수집 중…`);
let done = 0;
await pool(codes, 8, async (c) => {
  await dailyBars(c, 30);
  if (++done % 100 === 0) process.stdout.write(`  ${done}/${codes.length}\r`);
});
for (const s of secs) for (const r of s.rows) r.px = barsCache.get(r.code);
console.log(`  완료 ${codes.length}개          \n`);

// 검증 — 당일 계산값이 네이버가 준 값과 맞는가.
// 상위 몇 종목까지 넣어야 하는지도 같이 본다 (자료는 한 번만 받고 잘라 쓴다).
console.log("■ 검증 — 당일 등락률: 네이버 공식값 vs 시총가중 직접계산");
console.log("  " + pad("쓰는 종목", 14) + padL("오차 중앙값", 13) + padL("0.3%p 이내", 12) + padL("최대 오차", 11));
let bestN = TOP_N;
for (const n of [3, 5, 10, 20].filter((x) => x <= TOP_N)) {
  const ds = [];
  for (const sec of secs) {
    const mine = weighted(sec.rows.slice(0, n), 1);
    if (Number.isFinite(mine)) ds.push({ name: sec.name, d: Math.abs(mine - sec.changeRate) });
  }
  if (!ds.length) continue;
  ds.sort((a, b) => a.d - b.d);
  const median = ds[Math.floor(ds.length / 2)].d;
  const within = ds.filter((x) => x.d <= 0.3).length;
  console.log(
    "  " + pad(`상위 ${n}개`, 14) + padL(median.toFixed(3) + "%p", 13) +
      padL(`${within}/${ds.length}`, 12) + padL(ds[ds.length - 1].d.toFixed(2) + "%p", 11),
  );
}
{
  const ds = secs
    .map((sec) => ({ name: sec.name, naver: sec.changeRate, mine: weighted(sec.rows, 1) }))
    .filter((x) => Number.isFinite(x.mine))
    .map((x) => ({ ...x, d: Math.abs(x.mine - x.naver) }))
    .sort((a, b) => b.d - a.d);
  console.log(`  가장 어긋난 3개: ` + ds.slice(0, 3).map((x) => `${x.name} ${pct(x.naver)}→${pct(x.mine)}`).join(" · "));
  console.log("  (구성종목 전체가 아니라 상위 N개만 쓰므로 잔여 종목만큼 어긋난다)");
}

// 결과 — 기간별 섹터 강약
const PERIODS = [[1, "1일"], [5, "1주"], [20, "1개월"]];
for (const s of secs) {
  s.ret = {};
  for (const [d, k] of PERIODS) s.ret[k] = weighted(s.rows, d);
}
const ranked = secs.filter((s) => Number.isFinite(s.ret["1주"])).sort((a, b) => b.ret["1주"] - a.ret["1주"]);

console.log(`\n■ 주간 기준 강한 섹터 8`);
console.log("  " + pad("업종", 26) + padL("1일", 9) + padL("1주", 9) + padL("1개월", 9));
for (const s of ranked.slice(0, 8)) {
  console.log("  " + pad(s.name, 26) + padL(pct(s.ret["1일"]), 9) + padL(pct(s.ret["1주"]), 9) + padL(pct(s.ret["1개월"]), 9));
}
console.log(`\n■ 주간 기준 약한 섹터 8`);
console.log("  " + pad("업종", 26) + padL("1일", 9) + padL("1주", 9) + padL("1개월", 9));
for (const s of ranked.slice(-8).reverse()) {
  console.log("  " + pad(s.name, 26) + padL(pct(s.ret["1일"]), 9) + padL(pct(s.ret["1주"]), 9) + padL(pct(s.ret["1개월"]), 9));
}

// 일별과 주간이 실제로 다른 정보를 주는가.
// 겹치는 개수만 세면 "5/8" 같은 애매한 숫자가 나온다. 순위 상관과
// 실제로 갈린 업종을 함께 봐야 판단이 선다.
{
  const byDay = [...ranked].sort((a, b) => b.ret["1일"] - a.ret["1일"]);
  const rankOf = (arr) => Object.fromEntries(arr.map((s, i) => [s.name, i]));
  const rd = rankOf(byDay);
  const rw = rankOf(ranked);
  const names = ranked.map((s) => s.name);
  const n = names.length;
  // 스피어만 순위상관
  const dsum = names.reduce((a, nm) => a + (rd[nm] - rw[nm]) ** 2, 0);
  const rho = 1 - (6 * dsum) / (n * (n * n - 1));
  const dayTop = new Set(byDay.slice(0, 8).map((s) => s.name));
  const weekTop = ranked.slice(0, 8).map((s) => s.name);
  const onlyWeek = weekTop.filter((nm) => !dayTop.has(nm));

  console.log(`
■ 일별과 주간이 다른 정보를 주는가`);
  console.log(`  순위 상관 ${rho.toFixed(2)} (1 이면 완전히 같은 순서, 0 이면 무관)`);
  console.log(`  주간 상위8 중 일별 상위8 에 없는 업종 ${onlyWeek.length}개: ${onlyWeek.join(", ") || "없음"}`);
  for (const nm of onlyWeek) {
    const s2 = ranked.find((x) => x.name === nm);
    console.log(`    ${pad(nm, 24)} 1일 ${pct(s2.ret["1일"])} → 1주 ${pct(s2.ret["1주"])} (일별 ${rd[nm] + 1}위)`);
  }
  console.log(`  하루 등락에 안 잡히는 흐름이 주간에는 잡힌다. 그만큼이 추가되는 정보다.`);
}
