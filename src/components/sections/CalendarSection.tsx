"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { koEvent } from "@/lib/econKo";
import type { EconEvent } from "@/lib/calendar";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(d: string) {
  const [y, m, dd] = d.split("-").map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
  return `${m}월 ${dd}일 (${wd})`;
}

function todayKst() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return p;
}

/** 중요도 별 */
function Stars({ n }: { n: number }) {
  return (
    <span className={n >= 3 ? "text-up" : n === 2 ? "text-signal" : "text-muted"} title={`중요도 ${n}/3`}>
      {"★".repeat(n)}
      <span className="opacity-25">{"★".repeat(3 - n)}</span>
    </span>
  );
}

const COUNTRIES = [
  { key: "ALL", label: "전체", flag: "" },
  { key: "US", label: "미국", flag: "🇺🇸" },
  { key: "EU", label: "유럽", flag: "🇪🇺" },
  { key: "JP", label: "일본", flag: "🇯🇵" },
  { key: "KR", label: "한국", flag: "🇰🇷" },
] as const;

const FLAG: Record<string, string> = { US: "🇺🇸", EU: "🇪🇺", JP: "🇯🇵", KR: "🇰🇷" };

export function CalendarSection() {
  const [minImp, setMinImp] = useState(1);
  const [country, setCountry] = useState<string>("ALL");
  const { data, isLoading } = useSWR<{ data: EconEvent[] }>("/api/calendar", fetcher, {
    refreshInterval: 600_000,
  });
  const all = data?.data ?? [];
  const rows = all.filter(
    (e) => e.importance >= minImp && (country === "ALL" || e.country === country),
  );
  const today = todayKst();

  // 날짜별 그룹
  const groups: { date: string; items: EconEvent[] }[] = [];
  for (const e of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.dateKst) last.items.push(e);
    else groups.push({ date: e.dateKst, items: [e] });
  }

  return (
    <Card
      title="경제 캘린더"
      right={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
            {COUNTRIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCountry(c.key)}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  country === c.key ? "bg-brand text-white" : "text-muted hover:text-fg"
                }`}
              >
                {c.flag && <span className="mr-0.5">{c.flag}</span>}
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
            {([
              [1, "전체"],
              [2, "★★ 이상"],
              [3, "★★★"],
            ] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setMinImp(v)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  minImp === v ? "bg-brand text-white" : "text-muted hover:text-fg"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="hidden sm:inline text-xs text-muted">한국시간 · finviz</span>
        </div>
      }
    >
      {isLoading && !all.length ? (
        <div className="h-72 animate-pulse rounded-lg bg-line/30" />
      ) : !groups.length ? (
        <div className="grid h-24 place-items-center px-4 text-center text-sm text-muted">
          {country === "KR"
            ? "한국 경제지표 일정은 무료로 공개된 소스를 찾지 못했습니다."
            : "해당 조건의 일정이 없습니다."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.date}>
              <div
                className={`mb-1 text-xs font-semibold ${g.date === today ? "text-brand" : "text-muted"}`}
              >
                {dayLabel(g.date)}
                {g.date === today && " · 오늘"}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-[11px] text-muted border-b border-line">
                      <th className="text-left font-medium py-1 w-12">시각</th>
                      <th className="text-left font-medium w-12">중요도</th>
                      <th className="text-left font-medium">지표</th>
                      <th className="text-right font-medium pr-2 w-20">실제</th>
                      <th className="text-right font-medium pr-2 w-20">예상</th>
                      <th className="text-right font-medium w-20">이전</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((e) => (
                      <tr key={e.id} className="border-b border-line/40">
                        <td className="tnum py-1.5 pr-2 text-muted w-12 whitespace-nowrap">
                          {e.timeKst || "종일"}
                        </td>
                        <td className="pr-2 w-12 whitespace-nowrap text-xs">
                          <Stars n={e.importance} />
                        </td>
                        <td className="pr-2 font-medium" title={e.event}>
                          <span className="mr-1">{FLAG[e.country]}</span>
                          {koEvent(e.event)}
                          {e.reference && (
                            <span className="ml-1 text-[11px] text-muted">({e.reference})</span>
                          )}
                        </td>
                        <td className="tnum pr-2 text-right whitespace-nowrap w-20">
                          {e.actual ? (
                            <b
                              className={
                                e.forecast && e.actual !== e.forecast
                                  ? e.higherIsPositive
                                    ? "text-up"
                                    : "text-down"
                                  : ""
                              }
                            >
                              {e.actual}
                            </b>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td className="tnum pr-2 text-right text-muted whitespace-nowrap w-20">
                          {e.forecast ?? "-"}
                        </td>
                        <td className="tnum text-right text-muted whitespace-nowrap w-20">
                          {e.previous ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div className="text-[11px] text-muted">
            한국시간 기준 · 미국 주요 경제지표 · 지표명에 마우스를 올리면 원문 표기 · finviz
          </div>
        </div>
      )}
    </Card>
  );
}
