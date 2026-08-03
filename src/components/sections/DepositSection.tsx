"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";
import { signColor } from "@/lib/format";
import type { DepositTrend } from "@/lib/deposit";

/** 억원 → 조/억 표기 */
function jo(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}조`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}억`;
}

export function DepositSection() {
  const { data, isLoading } = useSWR<{ data: DepositTrend[] }>("/api/deposit", fetcher, {
    refreshInterval: 1_800_000,
  });
  const rows = data?.data ?? [];
  const latest = rows[0];

  return (
    <Card
      title="증시 주변자금"
      right={<span className="text-xs text-muted">{latest ? `20${latest.date}` : "네이버"}</span>}
    >
      {isLoading && !latest ? (
        <div className="h-28 animate-pulse rounded-lg bg-line/30" />
      ) : !latest ? (
        <div className="grid h-24 place-items-center text-sm text-muted">데이터 없음</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {latest.items.map((it, i) => {
              // 과거 → 최근 순으로 뒤집어 스파크라인 구성
              const series = rows
                .map((r) => r.items[i]?.value ?? 0)
                .filter((v) => v > 0)
                .reverse();
              return (
                <div key={it.label} className="min-w-0 rounded-lg border border-line bg-canvas/40 px-3 py-2.5">
                  <div className="text-xs text-muted truncate">{it.label}</div>
                  <div className="mt-1 flex items-end justify-between gap-1">
                    <div className="min-w-0">
                      <div className="tnum text-sm font-semibold leading-tight truncate">
                        {jo(it.value)}
                      </div>
                      <div className={`tnum text-xs font-medium ${signColor(it.change)}`}>
                        {it.change > 0 ? "+" : ""}
                        {jo(it.change)}
                      </div>
                    </div>
                    {series.length > 1 && (
                      <div className="shrink-0">
                        <Sparkline data={series} up={it.change >= 0} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-muted">
            전일 대비 · 최근 {rows.length}거래일 추이 · 네이버 증시자금동향
          </div>
        </>
      )}
    </Card>
  );
}
