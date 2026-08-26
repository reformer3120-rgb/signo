// 편입 사유에서 군더더기를 걷어낸다.
//
// 사람이 적어 준 문장에 회사 이름이 되풀이되는 것이 많다.
//   "디젠스 — 자동차부품을 생산하는 디젠스다."
// 화면에는 이름이 바로 옆에 있으므로 문장 안에서는 필요 없다. 읽는 사람이
// 알고 싶은 것은 "무엇을 만들어 어디에 파는가" 하나다.
//
// 실행
//   node scripts/theme/tidy-why.mjs          몇 건이 걸리는지만 본다
//   node scripts/theme/tidy-why.mjs --write  실제로 고친다
import fs from "node:fs";
import path from "node:path";

const DIR = ".cache/theme";
const MAN = path.join(DIR, "manual.json");
const WRITE = process.argv.includes("--write");

const man = JSON.parse(fs.readFileSync(MAN, "utf8"));
const ov = JSON.parse(fs.readFileSync(path.join(DIR, "overview.json"), "utf8"));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 한글 한 글자에 받침이 있는가 — 종결어미를 "이다"로 할지 "다"로 할지 가른다 */
function 받침(ch) {
  if (!ch) return false;
  const c = ch.charCodeAt(0) - 0xac00;
  if (c < 0 || c >= 11172) return true; // 한글이 아니면(로마자·숫자) 받침 있는 쪽으로 읽는다
  return c % 28 !== 0;
}

/** 문장에서 회사 이름이 군더더기로 붙은 자리를 걷어낸다 */
function tidy(name, why) {
  if (!name || !why) return why;
  const n = esc(name);
  let s = why.trim();

  // "회사명 — 무엇을 한다" → "무엇을 한다"
  s = s.replace(new RegExp("^" + n + "\\s*[\u2014\u2013-]\\s*"), "");
  // "…하는 회사명이다." → "…한다."
  s = s.replace(new RegExp("하는\\s*" + n + "(이)?다\\.?$"), "한다.");
  s = s.replace(new RegExp("생산하는\\s*" + n + "(이)?다\\.?$"), "생산한다.");
  // "…이 회사명이다." 처럼 이름만 남는 꼬리.
  //
  // 이름을 떼면 앞말이 종결어미를 새로 받아야 한다. 받침이 있으면 "이다",
  // 없으면 "다" 다. 이걸 안 보고 늘 "다." 를 붙였더니
  //   "신기술사업금융업을 겸영하는 IT보안기업 SGA솔루션즈다."
  //   → "…IT보안기업다."   (기업이다 여야 한다)
  // 처럼 어색한 문장이 남았다.
  s = s.replace(new RegExp("\\s*" + n + "(이)?다\\.?$"), (_m, _g, i) => {
    const 앞 = s.slice(0, i).trimEnd();
    return 받침(앞[앞.length - 1]) ? "이다." : "다.";
  });
  // 문장 한가운데 이름이 또 나오는 경우는 건드리지 않는다 — 뜻이 달라질 수 있다
  s = s.replace(/\s{2,}/g, " ").trim();
  if (!/[.!?]$/.test(s)) s += ".";
  return s;
}

let changed = 0;
const sample = [];
for (const [code, why] of Object.entries(man.설명 ?? {})) {
  const name = ov[code]?.name;
  const t = tidy(name, why);
  if (t !== why) {
    changed++;
    if (sample.length < 8) sample.push([name, why, t]);
    man.설명[code] = t;
  }
}

console.log(`설명 ${Object.keys(man.설명 ?? {}).length}건 중 ${changed}건 다듬음`);
for (const [n, a, b] of sample) {
  console.log(`  ${n}`);
  console.log(`    전: ${a}`);
  console.log(`    후: ${b}`);
}
if (WRITE) {
  fs.writeFileSync(MAN, JSON.stringify(man));
  console.log("\nmanual.json 에 반영했다.");
} else {
  console.log("\n--write 를 붙이면 실제로 고친다.");
}
