"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { gradeColor, maColor, signColor } from "@/lib/format";
import type { SectorRank } from "@/lib/naverApi";

function scoreColor(s: number) {
  if (s >= 70) return "text-confirm";
  if (s >= 45) return "text-signal";
  return "text-muted";
}



const ret = (v: number) => (
  <span className={`tnum ${signColor(v)}`}>
    {v > 0 ? "+" : ""}
    {v.toFixed(1)}%
  </span>
);

export function SectorRankCard({
  code,
  onSelect,
}: {
  code: string;
  onSelect?: (code: string, name: string) => void;
}) {
  // 종목을 바꿔도 선택한 비교군(업종/테마)은 그대로 유지
  const [group, setGroup] = useState("industry");

  const { data, isLoading } = useSWR<{ data: SectorRank }>(
    `/api/sector-rank?code=${code}&group=${group}`,
    fetcher,
    { refreshInterval: 900_000, keepPreviousData: true },
  );
  const r = data?.data;

  return (
    <Card
      title="섹터 종합평가"
      right={<span className="text-xs text-muted">{r ? r.industryName : "네이버"}</span>}
    >
      {!r ? (
        <div className="h-56 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <>
          {/* 세부 섹터(테마) 선택 */}
          {r.groups.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted mr-0.5">비교군</span>
              {r.groups.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGroup(g.key)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                    group === g.key
                      ? "border-brand bg-brand text-white"
                      : "border-line text-muted hover:text-fg hover:border-brand/40"
                  }`}
                >
                  {g.name}
                  {g.count > 0 && <span className="opacity-60"> {g.count}</span>}
                </button>
              ))}
              {isLoading && <span className="text-[11px] text-muted">불러오는 중…</span>}
            </div>
          )}

          {r.target && (
            <div className="mb-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3">
              <div className="flex items-center gap-4">
                {/* 점수는 목록·세부 점수와 같은 잣대를 쓴다 (기준선이 모이면 시장 전체 기준) */}
                <div className="shrink-0 text-center">
                  <div className={`tnum text-3xl font-bold ${scoreColor(r.target.score)}`}>
                    {r.target.score}
                  </div>
                  <div className="text-[11px] text-muted">
                    {r.baseline?.ready ? "점 / 시장 기준" : "점 / 비교군 기준"}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{r.target.name}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {r.industryName} 내 <b className="text-fg">{r.rank}위</b> / {r.total}종목
                  </div>
                  <div className="text-[11px] text-muted mt-1 tnum">
                    ROE {r.target.roe || "-"}% · 부채 {r.target.debt || "-"}% · 외국인{" "}
                    {r.target.foreignRate || "-"}%
                  </div>
                </div>
              </div>

              {/* 세부 점수 */}
              <div className="mt-3 grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                {(
                  [
                    ["재무", r.target.parts.재무],
                    ["밸류", r.target.parts.밸류],
                    ["성장", r.target.parts.성장],
                    ["시가총액", r.target.parts.시총],
                    ["주가흐름", r.target.parts.모멘텀],
                    ["외국인 비중", r.target.parts.외국인],
                    ["배당", r.target.parts.배당],
                  ] as [string, number][]
                ).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-canvas/60 px-1.5 py-1.5 text-center">
                    <div className="text-[10px] text-muted truncate">{k}</div>
                    <div className="tnum text-sm font-bold">{v}</div>
                  </div>
                ))}
              </div>

              {/* 최근 주가흐름 성적표 */}
              <div className="mt-3 rounded-lg bg-canvas/60 px-3 py-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold">최근 주가흐름 성적표</span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${gradeColor(
                      r.target.trendGrade,
                    )}`}
                  >
                    {r.target.trendGrade}
                  </span>
                  <span className="tnum text-[11px] text-muted">{r.target.trendScore}점</span>
                  {r.target.maSignal !== "-" && (
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${maColor(
                        r.target.maSignal,
                      )}`}
                      title="20일선 vs 60일선"
                    >
                      {r.target.maSignal}
                      {(r.target.maSignal === "골든크로스" || r.target.maSignal === "데드크로스") &&
                        r.target.crossDays >= 0 &&
                        ` ${r.target.crossDays}일`}
                    </span>
                  )}
                  <span className="text-[10px] text-muted ml-auto hidden sm:inline">섹터 내 상대성적</span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {(
                    [
                      ["1주", r.target.w1],
                      ["1달", r.target.m1],
                      ["3달", r.target.m3],
                      ["6달", r.target.m6],
                      ["1년", r.target.y1],
                    ] as [string, number][]
                  ).map(([k, v]) => (
                    <div key={k}>
                      <div className="text-[10px] text-muted">{k}</div>
                      <div className={`tnum text-xs font-bold ${signColor(v)}`}>
                        {v > 0 ? "+" : ""}
                        {v.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-muted mb-1.5">
            {r.industryName} 상위 종목 (종합점수순) · 클릭하면 해당 종목으로 이동
          </div>
          <ol className="flex flex-col gap-1">
            {r.ranked.map((s, i) => {
              const me = s.code === code;
              // 상위 10위 밖인데 목록 끝에 덧붙여진 검색 종목
              const outOfTop = me && i >= 10;
              return (
                <li
                  key={s.code}
                  onClick={() => !me && onSelect?.(s.code, s.name)}
                  role={me ? undefined : "button"}
                  tabIndex={me ? undefined : 0}
                  onKeyDown={(e) => {
                    if (!me && (e.key === "Enter" || e.key === " ")) onSelect?.(s.code, s.name);
                  }}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${
                    me
                      ? "bg-brand/10 border border-brand/30"
                      : "border border-line/50 cursor-pointer hover:border-brand/40 hover:bg-brand/5"
                  } ${outOfTop ? "mt-1.5 border-dashed" : ""}`}
                >
                  <span className="tnum text-xs text-muted w-6 shrink-0">{s.rank}</span>
                  <span className="font-medium flex-1 truncate min-w-0">{s.name}</span>
                  {s.maSignal === "골든크로스" && (
                    <span
                      className="rounded border border-up/40 bg-up/20 px-1 text-[10px] font-bold text-up shrink-0"
                      title={`20일선이 60일선 상향돌파 (${s.crossDays}일 전)`}
                    >
                      골든
                    </span>
                  )}
                  <span
                    className={`rounded border px-1 text-[10px] font-bold shrink-0 ${gradeColor(s.trendGrade)}`}
                    title="최근 주가흐름 성적"
                  >
                    {s.trendGrade}
                  </span>
                  <span className="tnum text-[11px] hidden sm:flex gap-2 text-muted">
                    <span>일 {ret(s.d1)}</span>
                    <span>주 {ret(s.w1)}</span>
                    <span>월 {ret(s.m1)}</span>
                  </span>
                  <div className="w-14 h-1.5 rounded-full bg-line/40 overflow-hidden hidden sm:block">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${s.score}%` }} />
                  </div>
                  <span className={`tnum text-sm font-bold w-9 text-right ${scoreColor(s.score)}`}>
                    {s.score}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 text-[11px] text-muted leading-relaxed">
            점수 = 재무건전성(ROE·부채·이익률) 25 + 밸류(PER·PBR·EPS) 23 + 성장성 15 +
            시가총액 14 + 주가흐름(기간수익률·골든크로스) 10 + 외국인보유비중 10 + 배당 3
            <br />
            점수는 <b>시장 전체(시총 상위 100종목) 분포 기준</b>이라 비교군을 바꿔도
            변하지 않습니다. 비교군은 누구와 견줄지(순위)를 정할 뿐입니다.
            평가는 <b>직전 정규장 종가</b> 기준이라 장중에 점수가 출렁이지 않습니다.
            {r.baseline && !r.baseline.ready && (
              <>
                {" "}
                <span className="text-signal">
                  (시장 기준 자료 수집 중 {r.baseline.samples}/{r.baseline.need} — 그때까지는
                  비교군 기준 점수를 보여줍니다)
                </span>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
