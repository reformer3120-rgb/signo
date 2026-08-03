// 경제 캘린더 (finviz 경제지표 일정 API). 서버 전용.
// 시각은 미국 동부시간(ET) 기준으로 내려오므로 KST로 변환해 표시한다.

const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36",
  Referer: "https://finviz.com/calendar.ashx",
  Accept: "application/json",
};

export interface EconEvent {
  id: number;
  event: string;
  category: string;
  /** KST ISO 문자열 (YYYY-MM-DDTHH:mm) */
  kst: string;
  dateKst: string; // YYYY-MM-DD
  timeKst: string; // HH:mm ("종일"이면 빈 문자열)
  allDay: boolean;
  importance: number; // 1(낮음) ~ 3(높음)
  reference: string; // 대상 기간 (예: "Jul")
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  higherIsPositive: boolean;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * finviz는 시각을 미국 동부시간으로 준다(서머타임 포함).
 * ET 벽시계 문자열을 KST 벽시계로 변환.
 */
function etToKst(iso: string): Date {
  // "2026-08-03T10:00:00" 을 ET 벽시계로 해석
  const [datePart, timePart = "00:00:00"] = iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  // UTC로 가정한 시각에서 ET 오프셋을 역산
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offsetMin = etOffsetMinutes(new Date(asUtc));
  return new Date(asUtc - offsetMin * 60_000);
}

/** 해당 시점의 미국 동부시간 UTC 오프셋(분). EDT=-240, EST=-300 */
function etOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const m = tz.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!m) return -300;
  return Number(m[1]) * 60 + (Number(m[2] ?? 0) * Math.sign(Number(m[1])) || 0);
}

function kstParts(utc: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(utc);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const date = `${g("year")}-${g("month")}-${g("day")}`;
  const time = `${g("hour")}:${g("minute")}`;
  return { date, time };
}

interface RawEvent {
  calendarId: number;
  event: string;
  category: string;
  date: string;
  reference: string | null;
  actual: string | null;
  forecast: string | null;
  teforecast: string | null;
  previous: string | null;
  importance: number;
  isHigherPositive: number;
  allDay: boolean;
}

export async function economicCalendar(daysBack = 1, daysAhead = 10): Promise<EconEvent[]> {
  const from = ymd(new Date(Date.now() - daysBack * 86400_000));
  const to = ymd(new Date(Date.now() + daysAhead * 86400_000));
  const r = await fetch(
    `https://finviz.com/api/calendar/economic?dateFrom=${from}&dateTo=${to}`,
    { headers: H, cache: "no-store" },
  );
  if (!r.ok) throw new Error(`finviz ${r.status}`);
  const rows = (await r.json()) as RawEvent[];
  return rows
    .filter((x) => x?.date)
    .map((x) => {
      const utc = etToKst(x.date);
      const { date, time } = kstParts(utc);
      return {
        id: x.calendarId,
        event: x.event,
        category: x.category,
        kst: `${date}T${time}`,
        dateKst: date,
        timeKst: x.allDay ? "" : time,
        allDay: !!x.allDay,
        importance: Number(x.importance) || 1,
        reference: x.reference ?? "",
        actual: x.actual,
        forecast: x.forecast ?? x.teforecast,
        previous: x.previous,
        higherIsPositive: x.isHigherPositive === 1,
      };
    })
    .sort((a, b) => a.kst.localeCompare(b.kst));
}
