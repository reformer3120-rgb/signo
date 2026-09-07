// 시장 PER·PBR 을 셀 재료를 화면용으로 굳힌다.
//
// 종목마다 순이익·자본총계·시장구분 셋뿐이다. 시가총액은 여기 없다 —
// 매일 바뀌므로 굳히면 낡는다. 화면이 지표 크론이 Redis 에 넣어 둔 시총과
// 합쳐 그때그때 센다.
//
// 실행
//   node scripts/theme/build-valuation.mjs   → src/data/valuation.json
import fs from "node:fs";
import path from "node:path";

const IN = ".cache/theme/valuation.json";
const OUT = "src/data/valuation.json";

if (!fs.existsSync(IN)) {
  console.error(`${IN} 이 없다 — scripts/theme/collect-valuation.mjs 를 먼저 돌릴 것.`);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(IN, "utf8"));

const out = {};
let 뺀것 = 0;
for (const [code, v] of Object.entries(raw)) {
  if (!v || v.순이익 == null || v.자본 == null) { 뺀것++; continue; }
  // 코넥스(N)·기타(E)는 코스피·코스닥 어느 쪽도 아니다
  if (v.시장 !== "Y" && v.시장 !== "K") { 뺀것++; continue; }
  // 자본이 0 이하면 자본잠식이다. PBR 이 뜻을 잃으므로 뺀다.
  if (v.자본 <= 0) { 뺀것++; continue; }
  out[code] = { 순: v.순이익, 자: v.자본, 시: v.시장, 해: v.해 };
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const 셈 = { Y: 0, K: 0 };
let 적자 = 0;
for (const v of Object.values(out)) { 셈[v.시]++; if (v.순 <= 0) 적자++; }
console.log(`종목 ${Object.keys(out).length} (뺀 것 ${뺀것})`);
console.log(`  코스피 ${셈.Y} · 코스닥 ${셈.K} · 그중 적자 ${적자}`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
