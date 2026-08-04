// 주요 기업 실적발표 일정 (야후). 서버 전용.
// 전 종목이 아니라 "시장을 움직이는" 종목만 — 시가총액 최상위와 섹터 대표주.
import { quoteAll } from "./yahoo";
import type { EconEvent, EconCountry } from "./calendar";

/**
 * 감시 대상. [야후 티커, 표기명, 중요도]
 * 중요도 3 = 지수를 움직이는 초대형주 / 2 = 섹터 대표주
 * 한국은 .KS(코스피) · .KQ(코스닥) 접미사를 붙여야 야후가 인식한다.
 */
const KR: [string, string, number][] = [
  // 시총 최상위
  ["005930.KS", "삼성전자", 3],
  ["000660.KS", "SK하이닉스", 3],
  ["373220.KS", "LG에너지솔루션", 3],
  ["207940.KS", "삼성바이오로직스", 3],
  ["005380.KS", "현대차", 3],
  ["000270.KS", "기아", 3],
  // 섹터 대표주
  ["009150.KS", "삼성전기", 2],
  ["012330.KS", "현대모비스", 2],
  ["105560.KS", "KB금융", 2],
  ["055550.KS", "신한지주", 2],
  ["086790.KS", "하나금융지주", 2],
  ["316140.KS", "우리금융지주", 2],
  ["032830.KS", "삼성생명", 2],
  ["028260.KS", "삼성물산", 2],
  ["051910.KS", "LG화학", 2],
  ["006400.KS", "삼성SDI", 2],
  ["096770.KS", "SK이노베이션", 2],
  ["034020.KS", "두산에너빌리티", 2],
  ["012450.KS", "한화에어로스페이스", 2],
  ["329180.KS", "HD현대중공업", 2],
  ["010130.KS", "고려아연", 2],
  ["005490.KS", "POSCO홀딩스", 2],
  ["035420.KS", "NAVER", 2],
  ["035720.KS", "카카오", 2],
  ["030200.KS", "KT", 2],
  ["017670.KS", "SK텔레콤", 2],
  ["068270.KS", "셀트리온", 2],
  ["003670.KS", "포스코퓨처엠", 2],
  ["009830.KS", "한화솔루션", 2],
  ["011200.KS", "HMM", 2],
  ["097950.KS", "CJ제일제당", 2],
  ["282330.KS", "BGF리테일", 2],
  ["196170.KQ", "알테오젠", 2],
  ["247540.KQ", "에코프로비엠", 2],
  ["086520.KQ", "에코프로", 2],
  ["277810.KQ", "레인보우로보틱스", 2],
];

const US: [string, string, number][] = [
  // 지수를 움직이는 초대형주
  ["NVDA", "엔비디아", 3],
  ["AAPL", "애플", 3],
  ["MSFT", "마이크로소프트", 3],
  ["GOOGL", "알파벳(구글)", 3],
  ["AMZN", "아마존", 3],
  ["META", "메타", 3],
  ["TSLA", "테슬라", 3],
  ["AVGO", "브로드컴", 3],
  ["BRK-B", "버크셔해서웨이", 3],
  ["LLY", "일라이릴리", 3],
  ["JPM", "JP모건", 3],
  ["TSM", "TSMC", 3],
  // 섹터 대표주
  ["ORCL", "오라클", 2],
  ["AMD", "AMD", 2],
  ["MU", "마이크론", 2],
  ["INTC", "인텔", 2],
  ["QCOM", "퀄컴", 2],
  ["TXN", "텍사스인스트루먼트", 2],
  ["AMAT", "어플라이드머티어리얼즈", 2],
  ["ASML", "ASML", 2],
  ["CRM", "세일즈포스", 2],
  ["ADBE", "어도비", 2],
  ["NFLX", "넷플릭스", 2],
  ["DIS", "디즈니", 2],
  ["V", "비자", 2],
  ["MA", "마스터카드", 2],
  ["BAC", "뱅크오브아메리카", 2],
  ["GS", "골드만삭스", 2],
  ["WMT", "월마트", 2],
  ["COST", "코스트코", 2],
  ["HD", "홈디포", 2],
  ["PG", "프록터앤갬블", 2],
  ["KO", "코카콜라", 2],
  ["MCD", "맥도날드", 2],
  ["JNJ", "존슨앤드존슨", 2],
  ["UNH", "유나이티드헬스", 2],
  ["MRK", "머크", 2],
  ["PFE", "화이자", 2],
  ["XOM", "엑슨모빌", 2],
  ["CVX", "쉐브론", 2],
  ["CAT", "캐터필러", 2],
  ["BA", "보잉", 2],
  ["GE", "GE에어로스페이스", 2],
  ["UBER", "우버", 2],
  ["PLTR", "팔란티어", 2],
  ["SMCI", "슈퍼마이크로", 2],
  ["ARM", "ARM", 2],
];

const KST = "Asia/Seoul";
const NY = "America/New_York";

const partsIn = (d: Date, tz: string) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    date: `${g("year")}-${g("month")}-${g("day")}`,
    time: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`,
  };
};

/**
 * 미국 기업은 발표 시각이 장전(개장 전)이냐 장후(마감 후)냐가 중요하다.
 * 뉴욕 현지 시각으로 판단해 표기한다.
 */
function usSlot(d: Date): string {
  const { time } = partsIn(d, NY);
  if (time < "09:30") return "장전";
  if (time >= "16:00") return "장후";
  return "장중";
}

/**
 * 감시 대상 중 지정한 기간 안에 실적을 발표하는 기업을 캘린더 항목으로 돌려준다.
 * @param days 오늘부터 며칠 뒤까지
 */
export async function earningsCalendar(days = 7): Promise<EconEvent[]> {
  const defs = [...KR.map((x) => ["KR", ...x] as const), ...US.map((x) => ["US", ...x] as const)];
  const rows = await quoteAll(defs.map(([, sym]) => sym));
  const bySymbol = new Map(rows.map((r) => [String(r.symbol), r]));

  const now = Date.now();
  const until = now + days * 86400_000;
  const out: EconEvent[] = [];
  let id = 900_000; // 경제지표 id와 겹치지 않게

  for (const [country, symbol, name, importance] of defs) {
    const q = bySymbol.get(symbol);
    if (!q) continue;
    // earningsTimestamp 는 '직전 발표'라 과거일 수 있다. 다음 예정일은 Start/End.
    // 야후 라이브러리는 이 값을 Date 로 넘겨준다 (초 단위 아님)
    const ms = (v: unknown) => {
      const t = v instanceof Date ? v.getTime() : Number(v);
      return Number.isFinite(t) && t > 0 ? t : 0;
    };
    const startMs = ms(q.earningsTimestampStart);
    const endMs = ms(q.earningsTimestampEnd) || startMs;
    if (!startMs || startMs < now - 86400_000 || startMs > until) continue;
    const d = new Date(startMs);
    const { date, time } = partsIn(d, KST);
    // 날짜가 확정되지 않으면 야후가 범위로 준다 → 그때는 시각을 신뢰하지 않는다
    const dateFixed = Math.abs(endMs - startMs) < 3600_000;
    // 한국 기업은 야후가 실제 발표 시각을 모르면서 장 마감 시각으로 채워 넣는다.
    // 없는 정보를 있는 것처럼 보이지 않도록 날짜만 쓴다.
    const confirmed = dateFixed && country === "US";
    const slot = country === "US" ? usSlot(d) : "";
    out.push({
      id: id++,
      country: country as EconCountry,
      event: `${name} 실적발표`,
      category: "실적",
      kst: `${date}T${time}`,
      dateKst: date,
      timeKst: confirmed ? time : "",
      allDay: !confirmed,
      importance,
      reference: confirmed ? slot : dateFixed ? "시간 미정" : "예정일 미확정",
      actual: null,
      forecast: null,
      previous: null,
      higherIsPositive: true,
    });
  }
  return out.sort((a, b) => a.kst.localeCompare(b.kst));
}
