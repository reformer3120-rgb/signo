"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { MarketToggle, type Mkt } from "@/components/MarketToggle";
import { num, pct, signColor } from "@/lib/format";
import type { NStock } from "@/lib/naverApi";

export function MoversSection() {
  const [market, setMarket] = useState<Mkt>("KOSPI");
  const [dir, setDir] = useState<"up" | "down">("up");
  const { data, isLoading } = useSWR<{ data: NStock[] }>(
    `/api/movers?market=${market}&dir=${dir}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const rows = (data?.data ?? []).slice(0, 12);

  return (
    <Card
      title="특징주"
      right={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
            <button
              onClick={() => setDir("up")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${dir === "up" ? "bg-up text-white" : "text-muted"}`}
            >
              상승
            </button>
            <button
              onClick={() => setDir("down")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${dir === "down" ? "bg-down text-white" : "text-muted"}`}
            >
              하락
            </button>
          </div>
          <MarketToggle value={market} onChange={setMarket} />
        </div>
      }
    >
      {isLoading && !rows.length ? (
        <div className="h-64 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {rows.map((s, i) => (
            <li
              key={s.code}
              className="flex items-center gap-2 rounded-lg border border-line/60 px-3 py-2"
            >
              <span className="tnum text-xs text-muted w-4 shrink-0">{i + 1}</span>
              <span className="font-medium flex-1 min-w-0 truncate">{s.name}</span>
              <span className="tnum text-sm text-muted shrink-0">{num(s.price)}</span>
              <span
                className={`tnum text-sm font-semibold w-16 text-right shrink-0 ${signColor(s.changePct)}`}
              >
                {pct(s.changePct)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
