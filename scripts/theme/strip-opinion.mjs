// 편입 사유에서 투자 평가를 걷어낸다.
//
// ── 왜 ─────────────────────────────────────────────────────
// 화면 아래에 "특정 종목의 매매를 권유하지 않습니다" 라고 적어 두었는데,
// 본문이 "수혜주로 부각됐다", "저평가 매력이 있다" 처럼 읽히면 그 고지와
// 어긋난다. 사실을 적는 것과 값을 매기는 것은 다르다.
//
//   남긴다  "다국적 제약사와의 대규모 기술수출 계약 이력이 많다"   ← 사실
//   버린다  "비만치료제 붐의 수혜주로 부각됐다"                  ← 평가
//
// ── 어떻게 ─────────────────────────────────────────────────
// 문장을 통째로 버리면 안 된다. 평가가 문장 뒤에 절로 붙어 있는 경우가 많아
// 앞의 사실까지 같이 날아간다 (88건 중 49건이 그랬다).
//
//   "…개발하는 바이오텍으로, 비만치료제 붐의 수혜주로 부각됐다."
//    → 통째로 버리면 남는 게 없다
//    → 절만 떼면 "…개발하는 바이오텍이다." 가 남는다
//
// 그래서 평가가 시작되는 쉼표에서 끊고, 앞의 연결어미를 종결어미로 바꾼다.
//
// 실행
//   node scripts/theme/strip-opinion.mjs          몇 건인지만 본다
//   node scripts/theme/strip-opinion.mjs --write  실제로 고친다
import fs from "node:fs";
import path from "node:path";

const MAN = path.join(".cache/theme", "manual.json");
const WRITE = process.argv.includes("--write");

/** 값을 매기는 말 — 사실이 아니라 판단이다 */
const OP =
  /부각|주목받|주목되|기대감|전망이|전망된|모멘텀|수혜|성장세가|호실적|저평가|매력|유망|안정적 배당|눈에 띈|긍정적|밸류에이션|투자포인트|관심이 쏠|주가 흐름|사이클과 연동|주가가 (오르|내리)/;

/** 연결어미 → 종결어미. 절을 떼고 나면 문장을 닫아 줘야 한다. */
const CLOSE = [
  [/(기업|회사|계열사|브랜드|업체|바이오텍|제조사|전문기업|지주회사|사업자)으?로$/, "$1이다"],
  [/([가-힣]+)으로$/, "$1이다"],
  [/([가-힣]+)이며$/, "$1이다"],
  [/([가-힣]+)하며$/, "$1한다"],
  [/([가-힣]+)하고$/, "$1한다"],
  [/([가-힣]+)하여$/, "$1한다"],
  [/([가-힣]+)면서$/, "$1한다"],
  [/([가-힣]+)지만$/, "$1하다"],
];

/** 받침이 있으면 "이다", 없으면 "다" — 기업이다 / 계열사다 */
function 이다(h) {
  const c = h.charCodeAt(h.length - 1) - 0xac00;
  const 받침 = c >= 0 && c < 11172 && c % 28 !== 0;
  return h + (받침 ? "이다" : "다");
}

/**
 * "…을 이루며" 처럼 연결어미 -며 로 끝나면 종결형으로 돌린다.
 * 어간에 받침이 있으면 -는다, 없으면 어간에 ㄴ 을 얹는다.
 *   이루며 → 이룬다 · 먹으며 → 먹는다
 */
function 며를닫기(h) {
  const stem = h.replace(/(으)?며$/, "");
  const last = stem.charCodeAt(stem.length - 1) - 0xac00;
  if (last < 0 || last >= 11172) return null;
  if (last % 28 !== 0) return stem + "는다";                    // 받침 있음
  return stem.slice(0, -1) + String.fromCharCode(0xac00 + last + 4) + "다"; // ㄴ 받침(4)
}

function closeClause(head) {
  let h = head.trim().replace(/[,·]$/, "").trim();
  for (const [re, to] of CLOSE) {
    if (!re.test(h)) continue;
    const t = h.replace(re, to);
    // "…이다" 로 끝나는 규칙은 받침을 보고 다시 맞춘다
    return (t.endsWith("이다") ? 이다(t.slice(0, -2)) : t) + ".";
  }
  if (/며$/.test(h)) { const t = 며를닫기(h); if (t) return t + "."; }
  if (/(다|음|함)$/.test(h)) return h + ".";
  return 이다(h) + ".";
}

/**
 * 문장 가운데 끼어 명사를 꾸미는 평가절. 쉼표가 없어 끊을 수 없는 자리다.
 *   "중전기기를 생산해 미국 전력망 확충 수요의 수혜를 받는 HD현대그룹 계열사다"
 *    →                 ────────────────────────────  이 부분만 뗀다
 */
// 앞쪽 낱말을 긁어 올 때 서술어(생산해·개발하여)는 넘지 않는다. 넘으면
// "중전기기를 생산해" 까지 같이 지워져 문장이 무너진다.
const MOD =
  /(?:(?!\S*(?:해|하여|하며|하고|하는)\s)[^\s,]+\s+){0,5}(?:수혜를 받는|수혜를 받고 있는|수혜주로 (?:꼽히는|부각되는|평가되는)|주목받는|부각되는|기대되는)\s+/g;

/** 한 문장에서 평가를 떼어 낸다. 뗄 수 없으면 null */
function stripSentence(s) {
  if (!OP.test(s)) return s;

  // 1) 평가가 시작되기 전 마지막 쉼표에서 끊는다
  const at = s.search(OP);
  const cut = s.lastIndexOf(",", at);
  if (cut > 8) return closeClause(s.slice(0, cut));

  // 2) 쉼표가 없으면 명사를 꾸미는 평가절만 떼어 본다
  let t = s.replace(MOD, "");
  if (t !== s) {
    // "생산해 HD현대그룹 계열사다" 처럼 어색해지므로 연결어미를 관형형으로
    t = t.replace(/([가-힣]+)해\s+(?=\S)/, "$1하는 ").replace(/\s{2,}/g, " ").trim();
    if (!OP.test(t)) return t;
  }
  return null; // 문장 전체가 평가다
}

export function strip(text) {
  const sents = text.trim().split(/(?<=다\.)\s*/).filter(Boolean);
  const kept = sents.map(stripSentence).filter(Boolean);
  return kept.length ? kept.join(" ").replace(/\s{2,}/g, " ").trim() : null;
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].split("\\").join("/")}`) {
  const man = JSON.parse(fs.readFileSync(MAN, "utf8"));
  let n = 0, lost = 0;
  const sample = [];
  for (const [code, why] of Object.entries(man.설명 ?? {})) {
    if (!OP.test(why)) continue;
    n++;
    const t = strip(why);
    if (!t) { lost++; continue; }
    if (sample.length < 8) sample.push([code, why, t]);
    man.설명[code] = t;
  }
  console.log(`평가가 섞인 설명 ${n}건 · 걷어내도 남는 게 없는 것 ${lost}건 (그건 그대로 둔다)`);
  for (const [c, a, b] of sample) {
    console.log(`\n  ${c}`);
    console.log(`    전: ${a}`);
    console.log(`    후: ${b}`);
  }
  if (WRITE) {
    fs.writeFileSync(MAN, JSON.stringify(man));
    console.log("\nmanual.json 에 반영했다.");
  } else {
    console.log("\n--write 를 붙이면 실제로 고친다.");
  }
}
