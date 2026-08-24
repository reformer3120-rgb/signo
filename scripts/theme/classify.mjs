// 사업의 개요 → 테마 배정.
//
// 규칙 기반이다. 돈이 들지 않는다. 응집도라는 잣대가 있으니 "모자라다" 를
// 느낌이 아니라 숫자로 말할 수 있고, 모자라면 그때 LLM 을 붙이면 된다.
//
// ── 글자 창으로 세다가 두 번 데었다 ────────────────────────
// 처음에는 낱말 앞뒤 60자를 보고 자사 이야기인지 판정했다. 두 가지가 샜다.
//
//   1) 부분 문자열
//      대성하이텍 "정밀 부품 사업의 전방산업을 방산, 로봇 …"
//      전"방산"업 안에 방산이 들어 있어 방위산업으로 잡혔다. 점수 16.
//      한국어는 띄어쓰기로 낱말 경계를 못 잡으므로 창 방식이 위험하다.
//
//   2) 시황 문장
//      잘만테크 "온라인 게임 산업은 … 지속적으로 성장하고 있습니다"
//      PC 쿨러 회사가 게임사로 잡혔다.
//
// 그래서 문장 단위로 바꿨다.
//   · 개요를 문장으로 쪼갠다
//   · 시황·전방산업·고객사 이야기인 문장은 통째로 버린다
//   · 남은 문장 안에서, 낱말과 자사 행위 동사가 같은 문장에 있을 때만 센다
//   · 부분 문자열 덫은 따로 적어 두고 먼저 지운다
//
// 사업보고서에는 자기 사업이 아닌 문장이 많다. 앞서 네이버 테마 설명에서
// "니켈 함량 80% 이상" 을 등락률 80% 로 잘못 읽었던 것과 같은 함정이다.
//
// 실행
//   node scripts/theme/classify.mjs
// 결과 → .cache/theme/classified.json  { themeId: [{code,name,score,why}] }
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "./dict.mjs";

const DIR = ".cache/theme";
const IN = path.join(DIR, "overview.json");
const OUT = path.join(DIR, "classified.json");


// 판정 규칙은 dict.mjs 의 테마 정의 안에 있다. 따로 두었더니 테마를 고칠 때
// 한쪽만 고쳐 어긋났다.

// 자사가 무엇을 한다는 말 — 낱말과 같은 문장에 있어야 편입으로 본다
const SELF = /(생산|제조|개발|공급|판매|영위|납품|양산|제작|주력|주요 제품|당사(는|의|가)|연결회사|자사)/;

// 자기 사업이 아닌 문장 — 통째로 버린다.
// 사업보고서는 자기 이야기보다 산업·시장 이야기가 더 길 때가 많다.
const NOT_OURS = [
  /전방산업|후방산업/,
  /고객사|수요처|전방 ?업체|매출처(는|가)/,
  /시장 ?규모|시장은|시장이|업황|시황/,
  /산업은|산업이|산업의 (성장|특성|규모|동향)/,
  /성장(세|률|할 것|하고 있)|전망(됩니다|이다|된다)|예상(됩니다|된다)/,
  /경쟁사|경쟁업체|점유율은/,
  /향후|중장기적으로|계획(입니다|이다)|추진할 예정/,
  // 원재료를 사 오는 이야기는 자기가 만드는 것이 아니다.
  // 코메론(줄자)이 "제강회사의 후판을 줄자소재로 … 구매하여야 합니다" 라고
  // 적어 철강 17점을 받았다. 사는 쪽인데 만드는 쪽으로 잡혔다.
  /원재료를 (구매|매입|조달)|원재료로 (사용|쓰)|자원조달|조달이 어렵|매입처/,
  // "저희 고객은 판매자입니다" — 남이 무엇을 하는지에 대한 문장.
  // 카페24(쇼핑몰 솔루션)가 유통업으로 잡혔다.
  /(가|이|은|는) 고객(입니다|이다)|고객으로 (합니다|한다)/,
];

// 낱말이 더 큰 말 안에 박혀 뜻이 달라지는 자리 — 세기 전에 지운다.
// 예: 전"방산"업 · 후"방산"업 → 방위산업이 아니다
const TRAPS = [
  "전방산업", "후방산업", "전방 산업", "후방 산업",
  "일반산업", "산업용",
];

/** 개요를 문장으로 쪼갠다 */
function sentences(text) {
  return text
    .split(/(?<=[다요음]\.)\s+|(?<=\.)\s+(?=[가-힣A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

/** 자사 이야기로 볼 수 있는 문장만 남긴다 */
function ourSentences(text) {
  return sentences(text).filter((s) => !NOT_OURS.some((re) => re.test(s)));
}

/**
 * 한 문장에서 낱말이 자사 행위와 함께 나오는가.
 * 덫이 되는 큰 말은 먼저 지운 뒤에 센다.
 */
function inSentence(sent, word) {
  let s = sent;
  for (const t of TRAPS) if (t.includes(word) && t !== word) s = s.split(t).join(" ");
  if (!s.includes(word)) return false;
  return SELF.test(s);
}

function scoreOne(text, rule) {
  let sents = ourSentences(text);
  if (!sents.length) return { score: 0, why: [] };

  // 뜻이 여러 분야에 걸치는 낱말이 있다. CDMO 는 바이오에도 로봇에도 쓰이고
  // (대성하이텍 "로봇 CDMO 사업"), 패키징은 반도체에도 포장에도, 전구체는
  // 전지에도 반도체에도 쓰인다. 그런 테마는 같은 문장에 분야 말이 있어야 센다.
  if (rule.ctx) sents = sents.filter((s) => rule.ctx.test(s));
  if (!sents.length) return { score: 0, why: [] };

  // veto 는 문서 전체에서 본다 — 있으면 그 테마가 아니다
  for (const w of rule.veto ?? []) if (text.includes(w)) return { score: 0, why: [] };

  let score = 0;
  const why = [];
  for (const w of rule.core) {
    const n = sents.filter((s) => inSentence(s, w)).length;
    if (n) {
      score += 3 + Math.min(2, n - 1); // 여러 문장에 걸치면 조금 더
      why.push(w);
    }
  }
  // 뒷받침 낱말은 core 가 이미 잡혔을 때만 센다
  if (score > 0) {
    for (const w of rule.sub ?? []) {
      if (sents.some((s) => inSentence(s, w))) { score += 1; why.push(w); }
    }
  }
  return { score, why };
}

// 문장 단위로 바꾸면서 잡음이 줄었으므로 문턱을 올린다.
// 근거 문장 하나(3점)로는 부족하고, 여러 문장이거나 뒷받침이 있어야 한다.
const MIN_SCORE = 4;

const data = JSON.parse(fs.readFileSync(IN, "utf8"));
const rows = Object.values(data).filter((r) => r.text);
console.log(`개요 확보 ${rows.length}종목 · 테마 ${THEMES.length}개\n`);

const out = {};
for (const t of THEMES) out[t.id] = [];
let tagged = 0;
for (const r of rows) {
  let any = false;
  for (const t of THEMES) {
    const { score, why } = scoreOne(r.text, t);
    if (score >= MIN_SCORE) {
      out[t.id].push({ code: r.code, name: r.name, score, why: [...new Set(why)].slice(0, 4) });
      any = true;
    }
  }
  if (any) tagged++;
}

for (const id of Object.keys(out)) out[id].sort((a, b) => b.score - a.score);
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

const named = Object.fromEntries(THEMES.map((t) => [t.id, t.name]));
const sorted = Object.entries(out).sort((a, b) => b[1].length - a[1].length);
console.log("테마별 편입 종목 수");
for (const [id, list] of sorted) {
  const head = list.slice(0, 4).map((x) => x.name).join(", ");
  console.log("  " + named[id].padEnd(18) + String(list.length).padStart(4) + "  " + head);
}
const empty = sorted.filter(([, l]) => !l.length).length;
console.log(`\n분류된 종목 ${tagged}/${rows.length} · 빈 테마 ${empty}개`);
console.log(`→ ${OUT}`);
