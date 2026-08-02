"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { signColor } from "@/lib/format";
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

export function SectorRankCard({ code }: { code: string }) {
  const { data } = useSWR<{ data: SectorRank }>(`/api/sector-rank?code=${code}`, fetcher, {
    refreshInterval: 900_000,
  });
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
          {r.target && (
            <div className="mb-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="text-center shrink-0">
                  <div className={`tnum text-3xl font-bold ${scoreColor(r.target.score)}`}>
                    {r.target.score}
                  </div>
                  <div className="text-[11px] text-muted">점 / 100</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{r.target.name}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {r.industryName} 내 <b className="text-fg">{r.rank}위</b> / 시총상위 {r.total}종목
                  </div>
                  <div className="text-[11px] text-muted mt-1 tnum">
                    ROE {r.target.roe || "-"}% · 부채 {r.target.debt || "-"}% · 목표가상승
                    {r.target.upside > 0 ? "+" : ""}
                    {r.target.upside}%
                  </div>
                </div>
              </div>
              {/* 세부 점수 */}
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {(
                  [
                    ["재무", r.target.parts.재무],
                    ["성장", r.target.parts.성장],
                    ["밸류", r.target.parts.밸류],
                    ["애널", r.target.parts.애널],
                    ["모멘텀", r.target.parts.모멘텀],
                    ["배당", r.target.parts.배당],
                  ] as [string, number][]
                ).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-canvas/60 px-2 py-1.5 text-center">
                    <div className="text-[10px] text-muted">{k}</div>
                    <div className="tnum text-sm font-bold">{v}</div>
                  </div>
                ))}
              </div>
              {/* 당일/1주/1달 수익률 */}
              <div className="mt-2 flex gap-3 text-[11px] text-muted tnum">
                <span>당일 {ret(r.target.d1)}</span>
                <span>1주 {ret(r.target.w1)}</span>
                <span>1달 {ret(r.target.m1)}</span>
              </div>
            </div>
          )}

          <div className="text-xs text-muted mb-1.5">섹터 상위 종목 (재무·성장·밸류 종합점수순)</div>
          <ol className="flex flex-col gap-1">
            {r.ranked.map((s, i) => {
              const me = s.code === code;
              return (
                <li
                  key={s.code}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${
                    me ? "bg-brand/10 border border-brand/30" : "border border-line/50"
                  }`}
                >
                  <span className="tnum text-xs text-muted w-5">{i + 1}</span>
                  <span className="font-medium flex-1 truncate min-w-0">{s.name}</span>
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
            점수 = 재무건전성(ROE·부채·이익률) 27 + 모멘텀 18 + 밸류(PER·PBR·EPS) 18 + 성장성 15 +
            애널리스트(목표가) 10 + 배당 7 + 시총 5 (섹터 내 상대평가, 100점)
          </div>
        </>
      )}
    </Card>
  );
}
