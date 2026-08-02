"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import type { SectorRank } from "@/lib/naverApi";

function scoreColor(s: number) {
  if (s >= 70) return "text-confirm";
  if (s >= 45) return "text-signal";
  return "text-muted";
}

export function SectorRankCard({ code }: { code: string }) {
  const { data } = useSWR<{ data: SectorRank }>(`/api/sector-rank?code=${code}`, fetcher, {
    refreshInterval: 300_000,
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
            <div className="mb-4 flex items-center gap-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3">
              <div className="text-center">
                <div className={`tnum text-3xl font-bold ${scoreColor(r.target.score)}`}>
                  {r.target.score}
                </div>
                <div className="text-[11px] text-muted">점 / 100</div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{r.target.name}</div>
                <div className="text-xs text-muted mt-0.5">
                  {r.industryName} 내 <b className="text-fg">{r.rank}위</b> / 시총상위 {r.total}종목
                </div>
                <div className="text-[11px] text-muted mt-1 tnum">
                  PER {r.target.per || "-"} · PBR {r.target.pbr || "-"} · 배당 {r.target.div || 0}% · 3개월{" "}
                  {r.target.threeMo > 0 ? "+" : ""}
                  {r.target.threeMo}%
                </div>
              </div>
            </div>
          )}
          <div className="text-xs text-muted mb-1.5">섹터 상위 종목 (재무·시총 종합점수순)</div>
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
                  <span className="font-medium flex-1 truncate">{s.name}</span>
                  <span className="tnum text-[11px] text-muted hidden sm:inline">
                    PER {s.per || "-"} · PBR {s.pbr || "-"}
                  </span>
                  <div className="w-16 h-1.5 rounded-full bg-line/40 overflow-hidden hidden sm:block">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${s.score}%` }} />
                  </div>
                  <span className={`tnum text-sm font-bold w-9 text-right ${scoreColor(s.score)}`}>
                    {s.score}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 text-[11px] text-muted">
            점수 = 시총·PER·PBR·배당·3개월수익률 종합 (섹터 내 상대평가, 100점 만점)
          </div>
        </>
      )}
    </Card>
  );
}
