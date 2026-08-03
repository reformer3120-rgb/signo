// 미국 종목·지수 한글명. 사전에 없으면 영문명을 그대로 쓴다.

const NAMES: Record<string, string> = {
  // 지수 · ETF
  "^GSPC": "S&P 500", "^IXIC": "나스닥 종합", "^DJI": "다우존스", "^RUT": "러셀 2000",
  "^VIX": "VIX 변동성", "^MOVE": "MOVE 채권변동성",
  XLK: "기술 섹터", XLC: "커뮤니케이션 섹터", XLY: "임의소비재 섹터", XLP: "필수소비재 섹터",
  XLF: "금융 섹터", XLV: "헬스케어 섹터", XLI: "산업재 섹터", XLE: "에너지 섹터",
  XLU: "유틸리티 섹터", XLRE: "부동산 섹터", XLB: "소재 섹터",
  // 기술
  NVDA: "엔비디아", AAPL: "애플", MSFT: "마이크로소프트", AVGO: "브로드컴", ORCL: "오라클",
  CRM: "세일즈포스", AMD: "AMD", CSCO: "시스코", ACN: "액센츄어", TXN: "텍사스인스트루먼트",
  QCOM: "퀄컴", ADBE: "어도비", IBM: "IBM", NOW: "서비스나우", INTU: "인튜이트",
  MU: "마이크론", INTC: "인텔", AMAT: "어플라이드머티어리얼즈", LRCX: "램리서치", KLAC: "KLA",
  ADI: "아나로그디바이스", PANW: "팔로알토네트웍스", SNPS: "시놉시스", CDNS: "케이던스",
  ANET: "아리스타네트웍스", DELL: "델", HPQ: "HP", SMCI: "슈퍼마이크로", ARM: "ARM",
  PLTR: "팔란티어", CRWD: "크라우드스트라이크", SNOW: "스노우플레이크", MRVL: "마벨",
  // 커뮤니케이션
  GOOGL: "알파벳(구글)", GOOG: "알파벳(구글)", META: "메타", NFLX: "넷플릭스",
  TMUS: "T-모바일", DIS: "디즈니", CMCSA: "컴캐스트", VZ: "버라이즌", T: "AT&T",
  EA: "일렉트로닉아츠", WBD: "워너브라더스디스커버리", RBLX: "로블록스", SPOT: "스포티파이",
  // 임의소비재
  AMZN: "아마존", TSLA: "테슬라", HD: "홈디포", MCD: "맥도날드", BKNG: "부킹홀딩스",
  LOW: "로우스", NKE: "나이키", SBUX: "스타벅스", TJX: "TJX", GM: "제너럴모터스",
  F: "포드", ABNB: "에어비앤비", CMG: "치폴레", MAR: "메리어트", RCL: "로열캐리비안",
  // 필수소비재
  WMT: "월마트", COST: "코스트코", PG: "프록터앤갬블", KO: "코카콜라", PEP: "펩시코",
  PM: "필립모리스", MO: "알트리아", MDLZ: "몬델리즈", CL: "콜게이트", TGT: "타깃",
  KHC: "크래프트하인즈", GIS: "제너럴밀스", KMB: "킴벌리클라크",
  // 금융
  "BRK-B": "버크셔해서웨이", JPM: "JP모건", V: "비자", MA: "마스터카드", BAC: "뱅크오브아메리카",
  WFC: "웰스파고", GS: "골드만삭스", MS: "모건스탠리", AXP: "아메리칸익스프레스",
  SCHW: "찰스슈왑", BLK: "블랙록", C: "씨티그룹", SPGI: "S&P글로벌", PYPL: "페이팔",
  COIN: "코인베이스", HOOD: "로빈후드",
  // 헬스케어
  LLY: "일라이릴리", JNJ: "존슨앤드존슨", ABBV: "애브비", UNH: "유나이티드헬스", MRK: "머크",
  TMO: "써모피셔", ABT: "애보트", PFE: "화이자", AMGN: "암젠", ISRG: "인튜이티브서지컬",
  DHR: "다나허", BMY: "브리스톨마이어스", GILD: "길리어드", VRTX: "버텍스", CVS: "CVS헬스",
  MDT: "메드트로닉", SYK: "스트라이커", REGN: "리제네론", MRNA: "모더나",
  // 산업재
  GE: "GE에어로스페이스", CAT: "캐터필러", RTX: "RTX", HON: "허니웰", UNP: "유니온퍼시픽",
  BA: "보잉", DE: "디어", LMT: "록히드마틴", UPS: "UPS", ETN: "이튼",
  MMM: "쓰리엠", NOC: "노스럽그러먼", GD: "제너럴다이내믹스", FDX: "페덱스", CSX: "CSX",
  // 에너지
  XOM: "엑슨모빌", CVX: "셰브론", COP: "코노코필립스", EOG: "EOG리소시스", SLB: "슐럼버거",
  PSX: "필립스66", MPC: "마라톤페트롤리엄", WMB: "윌리엄스", OXY: "옥시덴탈", VLO: "발레로",
  // 유틸리티
  NEE: "넥스트에라에너지", SO: "서던컴퍼니", DUK: "듀크에너지", CEG: "컨스텔레이션에너지",
  AEP: "아메리칸일렉트릭", SRE: "셈프라", D: "도미니언에너지", EXC: "엑셀론",
  XEL: "엑셀에너지", ED: "콘에디슨", VST: "비스트라",
  // 부동산
  PLD: "프로로지스", AMT: "아메리칸타워", EQIX: "에퀴닉스", WELL: "웰타워", SPG: "사이먼프로퍼티",
  PSA: "퍼블릭스토리지", O: "리얼티인컴", CCI: "크라운캐슬", DLR: "디지털리얼티", CBRE: "CBRE",
  // 소재
  LIN: "린데", SHW: "셔윈윌리엄스", APD: "에어프로덕츠", ECL: "에코랩", FCX: "프리포트맥모란",
  NEM: "뉴몬트", DOW: "다우", NUE: "뉴코어", PPG: "PPG", VMC: "벌컨머티리얼즈",
};

/** 티커의 한글명 (없으면 undefined) */
export const koName = (symbol: string): string | undefined => NAMES[symbol];
