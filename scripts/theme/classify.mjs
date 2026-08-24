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

const RULES = {
  "batt-cathode": {
    core: ["양극재", "양극활물질", "양극 활물질", "NCM", "NCA", "LFP 양극", "하이니켈"],
    sub: ["전구체", "리튬이온전지", "이차전지 소재"],
    ctx: /전지|배터리|리튬|양극/,
    veto: [],
  },
  "batt-anode": {
    core: ["음극재", "음극활물질", "음극 활물질", "인조흑연", "실리콘 음극"],
    sub: ["천연흑연"],
    veto: [],
  },
  "batt-parts": {
    core: ["분리막", "전해액", "전해질", "동박", "일렉포일", "양극집전체", "전지박", "파우치 필름"],
    sub: ["이차전지 소재", "2차전지 소재", "배터리 케이스"],
    ctx: /전지|배터리|리튬/,
    veto: [],
  },
  "batt-cell": {
    core: ["전지 셀", "배터리 셀", "셀 제조", "배터리 팩", "전지 모듈", "이차전지를 생산", "배터리를 생산"],
    sub: ["중대형 전지", "소형 전지", "ESS 용 전지"],
    veto: [],
  },
  "batt-equip": {
    core: ["이차전지 장비", "2차전지 장비", "전극 공정 장비", "조립 공정 장비", "화성 공정", "노칭", "스태킹", "전지 검사 장비"],
    sub: ["배터리 제조 설비", "이차전지 설비"],
    veto: [],
  },
  "batt-recycle": {
    core: ["폐배터리", "사용후 배터리", "사용후 전지", "폐전지", "배터리 재활용", "블랙파우더"],
    sub: ["리사이클링"],
    veto: [],
  },
  "semi-memory": {
    core: ["DRAM", "D램", "NAND", "낸드", "메모리 반도체를 생산", "메모리 반도체 제조"],
    sub: ["메모리 반도체"],
    veto: ["장비", "소재를 공급"],
  },
  "semi-fabless": {
    core: ["팹리스", "반도체를 설계", "시스템 반도체를 설계", "SoC 를 개발", "디스플레이 구동칩", "DDI", "이미지센서를 설계"],
    sub: ["시스템 반도체", "파운드리에 위탁"],
    veto: [],
  },
  "semi-equip": {
    core: ["반도체 장비", "증착 장비", "식각 장비", "세정 장비", "노광", "CMP 장비", "이온주입", "반도체 검사 장비", "웨이퍼 이송"],
    sub: ["전공정 장비", "반도체 제조용 설비"],
    veto: [],
  },
  "semi-material": {
    core: ["포토레지스트", "식각액", "에천트", "CMP 슬러리", "전구체", "특수가스", "반도체 공정용 화학", "반도체용 소재", "블랭크마스크", "포토마스크"],
    sub: ["반도체 소재"],
    ctx: /반도체|웨이퍼|디스플레이 ?공정|식각|증착/,
    veto: [],
  },
  "semi-pkg": {
    core: ["패키징", "OSAT", "웨이퍼 테스트", "반도체 후공정", "FC-BGA", "플립칩", "반도체 기판", "리드프레임", "본딩 와이어"],
    sub: ["테스트 소켓", "프로브카드"],
    ctx: /반도체|웨이퍼|칩|다이|기판/,
    veto: [],
  },
  "semi-hbm": {
    core: ["HBM", "고대역폭 메모리", "TSV", "하이브리드 본딩", "인터포저"],
    sub: ["2.5D 패키징", "실리콘 관통전극"],
    veto: [],
  },
  "bio-cdmo": {
    core: ["CDMO", "CMO", "위탁개발생산", "위탁생산", "수탁 생산"],
    sub: ["바이오의약품 생산"],
    ctx: /의약품|바이오|항체|백신|세포|원료|제약/,
    veto: [],
  },
  "bio-biosimilar": {
    core: ["바이오시밀러", "동등생물의약품"],
    sub: ["항체의약품"],
    veto: [],
  },
  "bio-diagnostic": {
    core: ["체외진단", "진단키트", "분자진단", "면역진단", "현장진단", "POCT", "진단시약"],
    sub: ["진단 장비"],
    veto: [],
  },
  "bio-obesity": {
    core: ["비만치료제", "비만 치료제", "GLP-1", "당뇨병 치료제", "세마글루타이드", "삭센다"],
    sub: ["대사질환"],
    veto: [],
  },
  "bio-cnsgene": {
    core: ["세포치료제", "유전자치료제", "CAR-T", "유전자 편집", "크리스퍼", "mRNA", "줄기세포치료"],
    sub: ["플라스미드", "바이럴 벡터"],
    veto: [],
  },
  "ship-build": {
    core: ["선박을 건조", "조선 사업", "선박 건조", "선박용 기자재", "조선기자재", "선박 엔진", "LNG 운반선을 건조"],
    sub: ["해양플랜트"],
    veto: [],
  },
  "ship-marine": {
    core: ["해상 운송", "해운업", "컨테이너 운송", "벌크선", "탱커", "선박을 운항"],
    sub: ["정기선", "부정기선"],
    veto: ["선박을 건조"],
  },
  "def-defense": {
    core: ["방위산업", "방산", "무기체계", "유도무기", "군용", "방위사업청"],
    sub: ["항공기 부품"],
    veto: [],
  },
  "pwr-nuclear": {
    core: ["원자력", "원전", "SMR", "소형모듈원자로", "핵연료"],
    sub: ["방사선"],
    veto: [],
  },
  "pwr-solar": {
    core: ["태양광", "폴리실리콘", "태양전지", "태양광 모듈", "잉곳", "웨이퍼를 생산"],
    sub: ["신재생에너지"],
    veto: [],
  },
  "pwr-hydrogen": {
    core: ["수소", "연료전지", "수전해", "SOFC", "PEMFC"],
    sub: ["암모니아"],
    ctx: /수소|연료전지|수전해/,
    veto: [],
  },
  "grid-power": {
    core: ["변압기", "개폐기", "배전반", "전력케이블", "송배전", "차단기", "전력기기"],
    sub: ["초고압"],
    veto: [],
  },
  "it-ai": {
    core: ["인공지능", "AI 솔루션", "머신러닝", "딥러닝", "AI 반도체", "생성형 AI", "LLM"],
    sub: ["빅데이터 분석"],
    ctx: /솔루션|플랫폼|엔진|모델|서비스|반도체/,
    veto: [],
  },
  "it-security": {
    core: ["정보보안", "보안 솔루션", "보안관제", "암호화", "방화벽", "인증 솔루션"],
    sub: ["보안 서비스"],
    veto: [],
  },
  "it-game": {
    core: ["게임을 개발", "게임 개발", "게임 퍼블리싱", "모바일 게임", "온라인 게임", "게임 서비스"],
    sub: ["게임 콘텐츠"],
    veto: [],
  },
  "it-content": {
    core: ["드라마 제작", "영화 제작", "웹툰", "음반", "아티스트 매니지먼트", "콘텐츠 제작", "매니지먼트 사업"],
    sub: ["영상 콘텐츠"],
    veto: [],
  },
  "csm-cosmetic": {
    core: ["화장품"],
    sub: ["ODM", "OEM", "기초화장품", "색조"],
    ctx: /화장품|코스메틱|뷰티/,
    veto: [],
  },
  "csm-food": {
    core: ["식품 제조", "가공식품", "음료를 생산", "주류", "식음료", "제과", "라면", "유가공"],
    sub: ["식품 사업"],
    veto: [],
  },
  "csm-beauty-dev": {
    core: ["미용 의료기기", "미용의료기기", "레이저 의료기기", "고강도 집속 초음파", "HIFU", "피부 미용"],
    sub: ["에스테틱"],
    veto: [],
  },
};

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
    const rule = RULES[t.id];
    if (!rule) continue;
    const { score, why } = scoreOne(r.text, rule);
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
