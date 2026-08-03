"use client";
import { useState } from "react";
import { useSticky } from "@/lib/useSticky";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { CandleChart, type Indicators } from "@/components/CandleChart";
import { IndicatorBar } from "@/components/IndicatorBar";
import { MaLegend } from "@/components/MaLegend";
import { num, pct, signColor } from "@/lib/format";
import type { Candle } from "@/lib/types";
import type { UsQuote } from "@/lib/us";

const INDICES = [
  { symbol: "^DJI", label: "다우존스" },
  { symbol: "^IXIC", label: "나스닥" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^RUT", label: "러셀 2000" },
  { symbol: "^VIX", label: "VIX" },
];

const TABS = [
  { key: "min", label: "분" },
  { key: "1D", label: "일" },
  { key: "1W", label: "주" },
  { key: "1M", label: "월" },
  { key: "1Y", label: "년" },
];

export function UsIndexChart({ indices }: { indices: UsQuote[] }) {
  const [sym, setSym] = useSticky("us.index.sym", "^DJI");
  const [tab, setTab] = useSticky("us.index.tab", "1D");
  const [minU, setMinU] = useSticky("us.index.min", "5m");
  const [ind, setInd] = useState<Indicators>({});

  const { data, isLoading } = useSWR<{ data: Candle[] }>(
    `/api/us-stock?part=chart&symbol=${encodeURIComponent(sym)}&kind=${tab === "min" ? minU : tab}`,
    fetcher,
    { refreshInterval: tab === "min" ? 60_000 : 0, keepPreviousData: true },
  );
  const candles = data?.data ?? [];
  const q = indices.find((x) => x.symbol === sym);
  const label = INDICES.find((x) => x.symbol === sym)?.label ?? sym;

  return (
    <Card
      title="지수 차트"
      right={
        <div className="flex items-center gap-2">
          {tab === "min" && (
            <select
              value={minU}
              onChange={(e) => setMinU(e.target.value)}
              className="rounded-md border border-line bg-canvas px-1.5 py-0.5 text-xs font-medium outline-none focus:border-brand"
            >
              {["1m", "5m", "15m", "30m", "60m"].map((u) => (
                <option key={u} value={u}>
                  {u.replace("m", "분")}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                tab === t.key ? "bg-brand text-white" : "text-muted hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          ))}
          </div>
        </div>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-canvas/50 p-1">
          {INDICES.map((x) => (
            <button
              key={x.symbol}
              onClick={() => setSym(x.symbol)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sym === x.symbol ? "bg-brand text-white" : "text-muted hover:text-fg"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        {q && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{label}</span>
            <span className="tnum text-lg font-bold">{num(q.price, 2)}</span>
            <span className={`tnum text-sm font-medium ${signColor(q.changePct)}`}>
              {pct(q.changePct)}
            </span>
          </div>
        )}
      </div>

      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <IndicatorBar value={ind} onChange={setInd} />
        {ind.ma && <MaLegend />}
      </div>

      {isLoading && !candles.length ? (
        <div className="h-[280px] animate-pulse rounded-lg bg-line/30" />
      ) : candles.length ? (
        <CandleChart
          data={candles}
          height={280}
          indicators={ind}
          session={tab === "min"}
          precision={2}
          viewKey={`usidx:${sym}:${tab === "min" ? minU : tab}`}
        />
      ) : (
        <div className="grid h-[280px] place-items-center text-sm text-muted">데이터 없음</div>
      )}
    </Card>
  );
}
