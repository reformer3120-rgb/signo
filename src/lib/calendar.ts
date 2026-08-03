// 경제 캘린더 (finviz 경제지표 일정 API). 서버 전용.
// 시각은 미국 동부시간(ET) 기준으로 내려오므로 KST로 변환해 표시한다.

const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36",
  Referer: "https://finviz.com/calendar.ashx",
  Accept: "application/json",
};

export type EconCountry = "US" | "EU" | "JP" | "KR";

import { earningsCalendar } from "./earnings";

export interface EconEvent {
  id: number;
  country: EconCountry;
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

// ---- ForexFactory 주간 캘린더 (일본·유럽 등 미국 외 지역) ----
// finviz는 미국 지표만 제공하므로 그 외 지역을 이 피드로 보완한다.
interface FfEvent {
  title: string;
  country: string; // 통화코드 (USD/JPY/EUR/...)
  date: string; // ISO with offset
  impact: "High" | "Medium" | "Low" | string;
  forecast: string;
  previous: string;
}

const FF_COUNTRY: Record<string, EconCountry> = { JPY: "JP", EUR: "EU", KRW: "KR" };
const FF_IMPORTANCE: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

async function forexFactory(): Promise<EconEvent[]> {
  const r = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
    headers: { "User-Agent": H["User-Agent"] },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`ff ${r.status}`);
  const rows = (await r.json()) as FfEvent[];
  return rows
    .filter((x) => x?.date && FF_COUNTRY[x.country])
    .map((x, i) => {
      const utc = new Date(x.date); // 오프셋이 포함돼 있어 그대로 파싱 가능
      const { date, time } = kstParts(utc);
      return {
        id: 900_000_000 + i,
        country: FF_COUNTRY[x.country],
        event: x.title,
        category: "",
        kst: `${date}T${time}`,
        dateKst: date,
        timeKst: time,
        allDay: false,
        importance: FF_IMPORTANCE[x.impact] ?? 1,
        reference: "",
        actual: null, // 이 피드는 발표치를 제공하지 않음
        forecast: x.forecast || null,
        previous: x.previous || null,
        higherIsPositive: true,
      };
    });
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
        country: "US" as const,
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

/** 미국(finviz) + 일본·유럽(ForexFactory)을 합친 캘린더 */
export async function economicCalendarAll(): Promise<EconEvent[]> {
  const [us, other, earn] = await Promise.all([
    economicCalendar(0, 7).catch(() => [] as EconEvent[]),
    forexFactory().catch(() => [] as EconEvent[]),
    earningsCalendar(30).catch(() => [] as EconEvent[]),
  ]);
  // 미국은 finviz 쪽이 발표치(actual)까지 있어 더 상세 → ForexFactory의 미국 항목은 제외
  return [...us, ...other.filter((e) => e.country !== "US"), ...earn].sort((a, b) =>
    a.kst.localeCompare(b.kst),
  );
}
