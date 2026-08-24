// 사업의 개요 → 테마 배정.
//
// 규칙 기반이다. LLM 없이 어디까지 가는지 먼저 재고, 모자라면 그때 붙인다.
// 응집도라는 잣대가 있으니 "모자라다" 를 느낌이 아니라 숫자로 말할 수 있다.
//
// ── 낱말만 세면 안 되는 이유 ────────────────────────────────
// 사업보고서에는 자기 사업이 아닌 문장이 많다.
//
//   에코프로비엠  "2차전지 산업의 성장세가 둔화되고 있으나…"   ← 시황
//   솔브레인      "당사가 속해 있는 반도체 … 전방산업은"        ← 전방산업
//   아무개        "고객사는 2차전지 제조업체이며"               ← 고객 이야기
//
// 낱말만 세면 셋 다 걸린다. 앞서 네이버 테마 설명에서 "니켈 함량 80% 이상" 을
// 등락률 80% 로 잘못 읽었던 것과 같은 함정이다.
//
// 그래서 두 가지를 본다.
//   1) 낱말이 '자사 행위' 문맥에 있는가 — 생산·제조·개발·공급·영위 …
//   2) '남의 이야기' 문맥에 있지 않은가 — 전방산업·고객사·시황·경쟁사 …
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

/**
 * 테마별 판정 낱말.
 * core = 이게 자사 행위 문맥에 있으면 편입
 * sub  = 혼자서는 부족하고 core 를 거들 때만 점수
 * veto = 있으면 그 테마가 아니다
 */
const RULES = {
  "batt-cathode": {
    core: ["양극재", "양극활물질", "양극 활물질", "NCM", "NCA", "LFP 양극", "하이니켈"],
    sub: ["전구체", "리튬이온전지", "이차전지 소재"],
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
    veto: [],
  },
  "semi-pkg": {
    core: ["패키징", "OSAT", "웨이퍼 테스트", "반도체 후공정", "FC-BGA", "플립칩", "반도체 기판", "리드프레임", "본딩 와이어"],
    sub: ["테스트 소켓", "프로브카드"],
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

// 자사 행위를 뜻하는 말 — 이 근처에 있어야 편입으로 본다
const SELF = /(생산|제조|개발|공급|판매|영위|사업을|제품은|주력|납품|서비스를|보유|양산|수행)/;
// 남의 이야기 — 이 근처면 뺀다
const OTHER = /(전방산업|후방산업|고객사|수요처|시황|업황|경쟁사|시장 규모|산업의 성장|성장세가|전망됩니다|예상됩니다|관련 산업)/;

const WINDOW = 60; // 낱말 앞뒤로 볼 글자 수

/** 낱말이 자사 행위 문맥에 몇 번 나오는가 */
function hits(text, word) {
  let self = 0, other = 0;
  let i = 0;
  while ((i = text.indexOf(word, i)) >= 0) {
    const around = text.slice(Math.max(0, i - WINDOW), i + word.length + WINDOW);
    if (OTHER.test(around)) other++;
    else if (SELF.test(around)) self++;
    i += word.length;
  }
  return { self, other };
}

function scoreOne(text, rule) {
  let score = 0;
  const why = [];
  for (const w of rule.veto ?? []) if (text.includes(w)) return { score: 0, why: [] };
  for (const w of rule.core) {
    const h = hits(text, w);
    if (h.self) {
      score += 3 + Math.min(2, h.self - 1);
      why.push(w);
    } else if (h.other) {
      score -= 1; // 남의 이야기로만 나오면 오히려 감점
    }
  }
  if (score > 0) {
    for (const w of rule.sub ?? []) {
      const h = hits(text, w);
      if (h.self) { score += 1; why.push(w); }
    }
  }
  return { score, why };
}

const MIN_SCORE = 3;

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
