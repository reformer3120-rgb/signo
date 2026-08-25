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
export const SELF = /(생산|제조|개발|공급|판매|영위|납품|양산|제작|주력|주요 제품|당사(는|의|가)|연결회사|자사|수주|매출(을|이|은|의)|사업(을|은|부문|에)|진출|제공하|보유하|운영하|서비스하|출시)/;

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
  // 어디에 파는지는 자기 업종이 아니다. 하림(닭고기)이 "이마트와 같은 대형마트를
  // 주요 목표시장으로" 라고 적어 유통업에 잡혔다.
  /(와|과) 같은|판로(를|가)|주요 목표시장|판매 ?채널|납품처|유통망(을|이)|입점/,
  // "X 를 운영하는 창업자·기업이 우리 고객" — 남이 운영하는 것이다.
  // 카페24(쇼핑몰 솔루션)가 "온라인 쇼핑몰을 운영하는 1인 창업자 … 가 이용" 으로
  // 다시 유통업에 잡혔다. 앞의 '고객입니다' 규칙으로는 이 문장이 안 걸린다.
  /(운영|사용|이용|구매)하는 .{0,25}(창업자|기업|업체|사업자|고객|이용자|소비자|회원)/,
  // "당사 제품은 반도체, 디스플레이, 로봇, 자동차 등에 적용됩니다" —
  // 어디에 쓰이는지 나열한 것이지 그 업종을 하는 것이 아니다. 사업보고서에
  // 매우 흔하다. 로봇 테마에 정밀부품사 열 곳이 들어온 이유가 이것이었다.
  /에 (적용|사용|공급|투입)되|다양한 (산업|분야|영역)|등 (다양한|여러|폭넓은)|분야에 (적용|쓰|활용)|적용 ?분야/,
  // "미국, 일본, 독일에서 완성차를 생산함으로 인하여 우리 부품이 수출된다" —
  // 만드는 주체가 남이다. 동일금속(주물)이 완성차로 잡혔다.
  /(에서|에게|측이) .{0,25}(생산|제조|개발)(함|하기|하므로|하고 있어)/,
  // 부정문 — 카카오뱅크가 "오프라인 점포를 운영하지 않음으로써" 라고 적어
  // 유통업으로 잡혔다. 안 한다는 말이 한다는 말로 읽혔다.
  /(하지|되지) 않|않음으로|없이 운영|미보유|보유하고 있지/,
  // 업계를 나열하는 문장 — DH오토리드(부품)가 "국내에서 승용차를 생산하고 있는
  // 업체는 현대자동차, 기아자동차 …" 라고 적어 완성차로 잡혔다.
  /(하고 있는|주요|국내) 업체(는|로는|가 있|로서)|업체(는|로는) .{0,40}(등이|등의|등 )/,
  // 표를 문장인 척 늘어놓은 줄. 사업보고서에 아주 흔하다.
  // 한전기술의 "구분 사업유형 사업내용 원자력 설계 ○ … 태양광 …" 이 태양광으로
  // 잡혔다. 동그라미가 셋 이상이거나 표 머리글 꼴이면 표로 본다.
  /[○●◇◆▷▶□■]\s*[\s\S]{0,60}[○●◇◆▷▶□■]\s*[\s\S]{0,60}[○●◇◆▷▶□■]/,
  /구분\s+(사업|분류|품목|내용|주요)|사업부문\s+주요\s?제품|주요\s?제품\s+주요\s?계열/,
  // 계열사 목록 표. 지주사·금융지주 보고서에 꼭 있고, 계열사 이름이 죽 붙어
  // 나오는 통에 온갖 낱말이 걸린다. 현대차증권이 태양광·풍력·수소·공작기계·
  // 자동차부품·여행 일곱 테마에 들어갔던 이유다.
  /업\s?종\s+회사수|상\s?장\s+비\s?상\s?장|계열회사(의|는)?\s*(현황|명세)|소속\s?회사\s?수/,
  // 고객이 무엇을 만드는지는 우리 업종이 아니다.
  // DB하이텍(파운드리)이 "디스플레이 구동IC … OLED 관련 제품" 으로 OLED 에 잡혔다.
  /(용|향)\s?(제품|부품|소재|칩|IC)|에 (적용|탑재)되는|관련 제품(을|은|에)/,
];

// 낱말이 더 큰 말 안에 박혀 뜻이 달라지는 자리 — 세기 전에 지운다.
// 예: 전"방산"업 · 후"방산"업 → 방위산업이 아니다
const TRAPS = [
  "전방산업", "후방산업", "전방 산업", "후방 산업",
  "일반산업", "산업용",
  // 투자"은행업"(IB) 은 은행업이 아니다. 교보증권·SK증권이 은행으로 잡혔다.
  "투자은행", "투자은행업",
];

/** 개요를 문장으로 쪼갠다 */
function sentences(text) {
  return text
    .split(/(?<=[다요음]\.)\s+|(?<=\.)\s+(?=[가-힣A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

/** 자사 이야기로 볼 수 있는 문장만 남긴다 */
export function ourSentences(text) {
  return sentences(text).filter((s) => !NOT_OURS.some((re) => re.test(s)));
}

/**
 * 표기를 고른다. 같은 뜻인데 회사마다 다르게 적어 그냥은 안 걸린다.
 *
 *   삼성SDI  "리튬이온 2차전지를 생산"      낱말은 "이차전지를 생산"
 *   삼성SDI  "중ㆍ대형전지"                낱말은 "중대형 전지"
 *   흔한 꼴  "생산/판매하는"                 SELF 가 '생산' 을 못 찾는다
 *
 * 이차↔2차를 하나로 맞추고, 가운뎃점을 지우고, 빗금을 띄어쓰기로 바꾼다.
 * 낱말을 견줄 때는 양쪽 띄어쓰기를 아예 없앤다 — 한국어 사업보고서는
 * 띄어쓰기가 제각각이라 그대로 두면 낱말을 수십 개로 늘려야 한다.
 */
function norm(s) {
  return s.replace(/이차전지/g, "2차전지").replace(/[ㆍ·]/g, "").replace(/\//g, " ");
}
const despace = (s) => s.replace(/\s+/g, "");

/**
 * 한 문장에서 낱말이 자사 행위와 함께 나오는가.
 * 덫이 되는 큰 말은 먼저 지운 뒤에 센다.
 */
function inSentence(sent, word) {
  let s = norm(sent);
  for (const t of TRAPS) if (t.includes(word) && t !== word) s = s.split(t).join(" ");
  if (!despace(s).includes(despace(norm(word)))) return false;
  return SELF.test(s);
}

/**
 * 낱말마다 무게가 다르다.
 *
 * "시공" 은 사업보고서 3,982건 중 226건에 나온다. 생산라인을 들이는 회사면
 * 어디든 적는 말이라 이것 하나로 건설사라고 할 수 없다. 반대로 "후보물질" 은
 * 76건에만 나오고, 그 76건은 거의 다 신약 회사다.
 *
 * 그래서 흔한 낱말일수록 점수를 깎는다. 문턱이 3 이므로
 *   드문 낱말(2% 미만)   3점 → 하나만 나와도 편입
 *   보통(2~5%)          2점 → 하나 더 있어야 편입
 *   흔한 낱말(5% 넘음)   1점 → 셋은 모여야 편입
 *
 * 빈도는 build-df.mjs 가 재어 df.json 에 넣어 둔다. 없으면 예전처럼 3점씩 준다.
 */
const DF = (() => {
  const p = path.join(DIR, "df.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
})();
const 전체문서 = DF?.["__문서수"] ?? 0;

function 무게(w) {
  if (!DF || !전체문서) return 3;
  const n = DF[w];
  if (n == null) return 3;
  const p = n / 전체문서;
  return p > 0.05 ? 1 : p > 0.02 ? 2 : 3;
}

export function scoreOne(text, rule) {
  let sents = ourSentences(text);
  if (!sents.length) return { score: 0, why: [] };

  // 뜻이 여러 분야에 걸치는 낱말이 있다. CDMO 는 바이오에도 로봇에도 쓰이고
  // (대성하이텍 "로봇 CDMO 사업"), 패키징은 반도체에도 포장에도, 전구체는
  // 전지에도 반도체에도 쓰인다. 그런 테마는 같은 문장에 분야 말이 있어야 센다.
  if (rule.ctx) sents = sents.filter((s) => rule.ctx.test(norm(s)));
  if (!sents.length) return { score: 0, why: [] };

  // veto 는 문서 전체에서 본다 — 있으면 그 테마가 아니다
  for (const w of rule.veto ?? []) if (text.includes(w)) return { score: 0, why: [] };

  // notWith 는 문장 단위다. 소재를 '만드는' 회사와 그 소재의 '제조설비를 대는'
  // 회사를 가르는 데 쓴다. 강원에너지가 "양극재의 전체 제조공정 핵심설비에 대하여
  // 엔지니어링 설계, 제작, 납품" 이라고 적어 양극재 회사로 잡혔다. 설비 회사다.
  if (rule.notWith) sents = sents.filter((s) => !rule.notWith.test(norm(s)));
  if (!sents.length) return { score: 0, why: [] };

  let score = 0;
  const why = [];
  for (const w of rule.core) {
    const n = sents.filter((s) => inSentence(s, w)).length;
    if (n) {
      score += 무게(w) + Math.min(2, n - 1); // 여러 문장에 걸치면 조금 더
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

// 문턱을 4 로 올렸다가 되돌렸다. "당사는 2차전지 전해액을 생산하여 배터리
// 제조사에 공급합니다" 처럼 한 문장으로 분명히 밝힌 회사가 걸러졌기 때문이다.
// 시황 문장 걸러내기 · 문맥 조건 · 덫 제거를 다 통과한 근거 문장 하나면 근거로 본다.
export const MIN_SCORE = 3;

// 직접 실행할 때만 분류를 돈다 (test-classify.mjs 가 판정 함수만 가져다 쓴다)
// -e 로 부르면 argv[1] 이 없다 — 그때는 본체를 돌리지 않는다
if (process.argv[1] && import.meta.url === `file:///${process.argv[1].split("\\").join("/")}`) {
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
}
