// 경제지표명 한글 변환.
// 지표명은 "본체 + 기간표기(MoM/YoY/…) + 발표차수(Prel/Final/Adv)" 구조라
// 접미사를 먼저 떼어내고 본체를 사전에서 찾은 뒤 다시 붙인다.

/** 발표 차수 */
const STAGE: [RegExp, string][] = [
  [/\s+Prel(iminary)?$/i, " 잠정"],
  [/\s+Adv(ance)?$/i, " 속보"],
  [/\s+Final$/i, " 확정"],
  [/\s+Rev(ised)?$/i, " 수정"],
];

/** 비교 기간 (finviz는 MoM/YoY, ForexFactory는 m/m·y/y 표기) */
const PERIOD: [RegExp, string][] = [
  [/\s+(MoM|m\/m)$/i, " (전월대비)"],
  [/\s+(YoY|y\/y)$/i, " (전년대비)"],
  [/\s+(QoQ|q\/q)$/i, " (전분기대비)"],
  [/\s+(WoW|w\/w)$/i, " (전주대비)"],
];

/** 국가 접두어 (ForexFactory 유럽 지표) */
const PREFIX: [RegExp, string][] = [
  [/^German\s+/i, "독일 "],
  [/^French\s+/i, "프랑스 "],
  [/^Italian\s+/i, "이탈리아 "],
  [/^Spanish\s+/i, "스페인 "],
  [/^Belgian\s+/i, "벨기에 "],
];

/** 지표 본체 사전 (긴 이름이 먼저 매칭되도록 정렬해서 사용) */
const DICT: Record<string, string> = {
  // 고용
  "Non Farm Payrolls": "비농업 고용",
  "Nonfarm Payrolls Private": "민간 비농업 고용",
  "Manufacturing Payrolls": "제조업 고용",
  "Government Payrolls": "정부부문 고용",
  "Unemployment Rate": "실업률",
  "U-6 Unemployment Rate": "U-6 실업률(광의)",
  "Participation Rate": "경제활동참가율",
  "Average Hourly Earnings": "시간당 평균임금",
  "Average Weekly Hours": "주당 평균 노동시간",
  "Initial Jobless Claims": "신규 실업수당 청구",
  "Continuing Jobless Claims": "연속 실업수당 청구",
  "Jobless Claims 4-week Average": "실업수당 청구 4주 평균",
  "ADP Employment Change": "ADP 민간고용",
  "ADP Employment Change Weekly": "ADP 민간고용(주간)",
  "Challenger Job Cuts": "챌린저 감원 발표",
  "JOLTs Job Openings": "JOLTS 구인건수",
  "JOLTs Job Quits": "JOLTS 자발적 퇴직",
  // 물가
  "Core PCE Price Index": "근원 PCE 물가지수",
  "PCE Price Index": "PCE 물가지수",
  "Core PCE Prices": "근원 PCE 물가",
  "PCE Prices": "PCE 물가",
  "Core Inflation Rate": "근원 소비자물가",
  "Inflation Rate": "소비자물가",
  "CPI": "소비자물가지수",
  "Core CPI": "근원 소비자물가지수",
  "PPI": "생산자물가지수",
  "Consumer Inflation Expectations": "소비자 기대인플레이션",
  "Used Car Prices": "중고차 가격",
  // 경기·심리
  "ISM Manufacturing PMI": "ISM 제조업 PMI",
  "ISM Manufacturing Employment": "ISM 제조업 고용지수",
  "ISM Manufacturing New Orders": "ISM 제조업 신규주문",
  "ISM Manufacturing Prices": "ISM 제조업 가격지수",
  "ISM Services PMI": "ISM 서비스업 PMI",
  "ISM Services Business Activity": "ISM 서비스업 기업활동",
  "ISM Services Employment": "ISM 서비스업 고용지수",
  "ISM Services New Orders": "ISM 서비스업 신규주문",
  "ISM Services Prices": "ISM 서비스업 가격지수",
  "CB Consumer Confidence": "CB 소비자신뢰지수",
  "Michigan Consumer Sentiment": "미시간대 소비자심리지수",
  "Michigan Consumer Expectations": "미시간대 소비자기대지수",
  "Michigan Current Conditions": "미시간대 현재여건지수",
  "Michigan Inflation Expectations": "미시간대 기대인플레이션",
  "Michigan 5 Year Inflation Expectations": "미시간대 5년 기대인플레이션",
  "RCM/TIPP Economic Optimism Index": "RCM/TIPP 경기낙관지수",
  "LMI Logistics Managers Index": "LMI 물류관리자지수",
  "Chicago PMI": "시카고 PMI",
  "Dallas Fed Manufacturing Index": "댈러스 연은 제조업지수",
  "Dallas Fed Services Index": "댈러스 연은 서비스업지수",
  "Dallas Fed Services Revenues Index": "댈러스 연은 서비스 매출지수",
  "Richmond Fed Manufacturing Index": "리치먼드 연은 제조업지수",
  "Richmond Fed Manufacturing Shipments Index": "리치먼드 연은 제조 출하지수",
  "Richmond Fed Services Revenues Index": "리치먼드 연은 서비스 매출지수",
  // 생산·소비·주문
  "GDP Growth Rate": "GDP 성장률",
  "GDP Price Index": "GDP 물가지수",
  "GDP Sales": "GDP 최종판매",
  "Real Consumer Spending": "실질 소비지출",
  "Real Personal Spending": "실질 개인소비",
  "Personal Spending": "개인소비",
  "Personal Income": "개인소득",
  "Retail Sales": "소매판매",
  "Factory Orders": "공장주문",
  "Factory Orders ex Transportation": "공장주문(운송 제외)",
  "Durable Goods Orders": "내구재 주문",
  "Durable Goods Orders Ex Transp": "내구재 주문(운송 제외)",
  "Durable Goods Orders ex Defense": "내구재 주문(국방 제외)",
  "Non Defense Goods Orders Ex Air": "핵심 자본재 주문",
  "Construction Spending": "건설지출",
  "Wholesale Inventories": "도매재고",
  "Retail Inventories Ex Autos": "소매재고(자동차 제외)",
  "Total Vehicle Sales": "총 자동차 판매",
  "Nonfarm Productivity": "비농업 생산성",
  "Unit Labour Costs": "단위노동비용",
  "Consumer Credit Change": "소비자신용 변화",
  "Redbook": "레드북 소매판매",
  // 무역
  "Balance of Trade": "무역수지",
  "Goods Trade Balance": "상품 무역수지",
  "Exports": "수출",
  "Imports": "수입",
  // 주택·모기지
  "House Price Index": "주택가격지수",
  "S&P/Case-Shiller Home Price": "케이스-실러 주택가격",
  "MBA Mortgage Applications": "MBA 모기지 신청건수",
  "MBA Mortgage Market Index": "MBA 모기지 시장지수",
  "MBA Mortgage Refinance Index": "MBA 모기지 리파이낸스지수",
  "MBA Purchase Index": "MBA 주택구매지수",
  "MBA 30-Year Mortgage Rate": "MBA 30년 모기지 금리",
  "15-Year Mortgage Rate": "15년 모기지 금리",
  "30-Year Mortgage Rate": "30년 모기지 금리",
  // 에너지·원자재
  "EIA Crude Oil Stocks Change": "EIA 원유 재고",
  "EIA Crude Oil Imports Change": "EIA 원유 수입",
  "EIA Cushing Crude Oil Stocks Change": "EIA 쿠싱 원유 재고",
  "EIA Gasoline Stocks Change": "EIA 휘발유 재고",
  "EIA Gasoline Production Change": "EIA 휘발유 생산",
  "EIA Distillate Stocks Change": "EIA 정제유 재고",
  "EIA Distillate Fuel Production Change": "EIA 정제유 생산",
  "EIA Heating Oil Stocks Change": "EIA 난방유 재고",
  "EIA Refinery Crude Runs Change": "EIA 정유 가동량",
  "EIA Natural Gas Stocks Change": "EIA 천연가스 재고",
  "API Crude Oil Stock Change": "API 원유 재고",
  "Baker Hughes Oil Rig Count": "베이커휴즈 원유 시추기 수",
  "Baker Hughes Total Rigs Count": "베이커휴즈 총 시추기 수",
  // 연준·국채
  "Fed Interest Rate Decision": "FOMC 기준금리 결정",
  "Fed Press Conference": "FOMC 기자회견",
  "FOMC Minutes": "FOMC 의사록",
  "Fed Balance Sheet": "연준 대차대조표",
  "Loan Officer Survey": "연준 대출담당자 서베이",
  "Money Supply": "통화공급(M2)",
  "Treasury Refunding Announcement": "재무부 국채발행 계획",
  "Treasury Refunding Financing Estimates": "재무부 자금조달 추정",
  "2-Year FRN Auction": "2년 변동금리채 입찰",
  // 일본·유럽 (ForexFactory 표기)
  "Final Manufacturing PMI": "제조업 PMI 확정",
  "Final Services PMI": "서비스업 PMI 확정",
  "Flash Manufacturing PMI": "제조업 PMI 속보",
  "Flash Services PMI": "서비스업 PMI 속보",
  "Manufacturing PMI": "제조업 PMI",
  "Services PMI": "서비스업 PMI",
  "Final Composite PMI": "종합 PMI 확정",
  "Bank Holiday": "휴장일",
  "Industrial Production": "산업생산",
  "Trade Balance": "무역수지",
  "Current Account": "경상수지",
  "Main Refinancing Rate": "ECB 기준금리",
  "ECB Press Conference": "ECB 기자회견",
  "Monetary Policy Statement": "통화정책 성명",
  "BOJ Policy Rate": "일본은행 기준금리",
  "BOJ Press Conference": "일본은행 기자회견",
  "BOJ Summary of Opinions": "일본은행 의견 요약",
  "Household Spending": "가계지출",
  "Average Cash Earnings": "평균 현금소득",
  "Leading Indicators": "경기선행지수",
  "Consumer Confidence": "소비자신뢰지수",
  "Economic Sentiment": "경제심리지수",
  "Sentix Investor Confidence": "센틱스 투자자신뢰지수",
  "German Buba": "분데스방크",
  "Prelim Flash GDP": "GDP 속보 잠정",
  "Prelim GDP": "GDP 잠정",
  "Final GDP": "GDP 확정",
  "Monetary Base": "본원통화",
  "Retail Sales m/m": "소매판매",
  "Unemployment Claims": "실업수당 청구",
  "Consumer Spending": "소비지출",
  "Employment Change": "고용 변화",
  "Producer Prices": "생산자물가",
  "Core Retail Sales": "근원 소매판매",
  "Household Confidence": "가계신뢰지수",
  "Machinery Orders": "기계수주",
  "Tankan Manufacturing Index": "단칸 제조업지수",
  "Tankan Non-Manufacturing Index": "단칸 비제조업지수",
  "10-y Bond Auction": "10년 국채 입찰",
  "30-y Bond Auction": "30년 국채 입찰",
};

/** 연준 인사 이름 */
const FED_NAMES: Record<string, string> = {
  Powell: "파월",
  Williams: "윌리엄스",
  Jefferson: "제퍼슨",
  Barr: "바",
  Bowman: "보먼",
  Cook: "쿡",
  Waller: "월러",
  Kugler: "쿠글러",
  Barkin: "바킨",
  Bostic: "보스틱",
  Musalem: "무살렘",
  Goolsbee: "굴스비",
  Logan: "로건",
  Kashkari: "카시카리",
  Daly: "데일리",
  Schmid: "슈미드",
  Hammack: "해맥",
  Collins: "콜린스",
  Harker: "하커",
  Mester: "메스터",
  Miran: "미란",
};
const koName = (n: string) => FED_NAMES[n] ?? n;

/** 연설/입찰 등 패턴 규칙 */
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Fed\s+(.+?)\s+Speech$/i, (m) => `연준 ${koName(m[1])} 연설`],
  [/^(\d+)-Year Note Auction$/i, (m) => `${m[1]}년 국채 입찰`],
  [/^(\d+)-Year Bond Auction$/i, (m) => `${m[1]}년 국채 입찰`],
  [/^(\d+)-(Week|Month) Bill Auction$/i, (m) => `${m[1]}${m[2].toLowerCase() === "week" ? "주" : "개월"} 단기국채 입찰`],
  [/^NY Fed Bill Purchases (.+)$/i, (m) => `뉴욕 연은 단기국채 매입 (${m[1]})`],
  // ForexFactory 표기: "10-y Bond Auction", "30-y Bond Auction"
  [/^(\d+)-y Bond Auction$/i, (m) => `${m[1]}년 국채 입찰`],
  [/^(\d+)-y Note Auction$/i, (m) => `${m[1]}년 국채 입찰`],
];

/** 영문 지표명을 한글로. 사전에 없으면 원문 유지 */
export function koEvent(name: string): string {
  let rest = name.trim();
  let suffix = "";
  let prefix = "";

  for (const [re, ko] of PREFIX) {
    if (re.test(rest)) {
      prefix = ko;
      rest = rest.replace(re, "");
      break;
    }
  }

  for (const [re, ko] of STAGE) {
    if (re.test(rest)) {
      suffix = ko + suffix;
      rest = rest.replace(re, "");
    }
  }
  for (const [re, ko] of PERIOD) {
    if (re.test(rest)) {
      suffix = ko + suffix;
      rest = rest.replace(re, "");
    }
  }

  for (const [re, fn] of PATTERNS) {
    const m = rest.match(re);
    if (m) return prefix + fn(m) + suffix;
  }

  const hit = DICT[rest];
  if (hit) return prefix + hit + suffix;

  // 부분 일치(가장 긴 키 우선)
  const keys = Object.keys(DICT).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (rest.startsWith(k)) return prefix + DICT[k] + rest.slice(k.length) + suffix;
  }
  return prefix + rest + suffix;
}
