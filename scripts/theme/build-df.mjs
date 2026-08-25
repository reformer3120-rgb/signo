// 테마 낱말이 사업보고서에 얼마나 흔한지 잰다.
//
// 분류기가 낱말마다 무게를 달리 주려면 그 낱말이 시장 전체에서 얼마나 흔한지
// 알아야 한다. "시공" 은 3,982건 중 226건, "후보물질" 은 76건이다. 같은 3점을
// 줄 수 없다.
//
// 실행 (수집 뒤 한 번, 사전을 고쳤으면 다시)
//   node scripts/theme/build-df.mjs
// 결과 → .cache/theme/df.json  { 낱말: 나온 문서 수, __문서수: 전체 }
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "./dict.mjs";

const DIR = ".cache/theme";
const ov = JSON.parse(fs.readFileSync(path.join(DIR, "overview.json"), "utf8"));

// 분류기와 같은 정규화를 쓴다. 안 맞추면 빈도가 어긋난다.
const norm = (s) => s.replace(/이차전지/g, "2차전지").replace(/[ㆍ·]/g, "").replace(/\//g, " ");
const despace = (s) => s.replace(/\s+/g, "");

const docs = Object.values(ov)
  .map((x) => despace(norm(x.text ?? "")))
  .filter((d) => d.length > 50);

const words = new Set();
for (const t of THEMES) {
  for (const w of t.core ?? []) words.add(w);
  for (const w of t.sub ?? []) words.add(w);
  for (const w of t.also ?? []) words.add(w);
}

const df = { __문서수: docs.length };
for (const w of words) {
  const q = despace(norm(w));
  let n = 0;
  for (const d of docs) if (d.includes(q)) n++;
  df[w] = n;
}
fs.writeFileSync(path.join(DIR, "df.json"), JSON.stringify(df));

const rows = [...words].map((w) => [w, df[w]]).sort((a, b) => b[1] - a[1]);
const 흔함 = rows.filter(([, n]) => n / docs.length > 0.05);
const 보통 = rows.filter(([, n]) => n / docs.length > 0.02 && n / docs.length <= 0.05);
console.log(`문서 ${docs.length}건 · 낱말 ${words.size}개`);
console.log(`  흔한 낱말(1점) ${흔함.length} · 보통(2점) ${보통.length} · 드문 낱말(3점) ${words.size - 흔함.length - 보통.length}`);
console.log("\n가장 흔한 낱말");
for (const [w, n] of rows.slice(0, 10)) {
  console.log(`  ${w.padEnd(14)}${String(n).padStart(5)}  ${((n / docs.length) * 100).toFixed(1)}%`);
}
