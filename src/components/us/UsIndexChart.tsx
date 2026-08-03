"use client";
import { useState } from "react";
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
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "나스닥" },
  { symbol: "^DJI", label: "다우존스" },
  { symbol: "^RUT", label: "러셀 2000" },
  { symbol: "^VIX", label: "VIX" },
];

const TABS = [
  { key: "5m", label: "분" },
  { key: "1D", label: "일" },
  { key: "1W", label: "주" },
  { key: "1M", label: "월" },
  { key: "1Y", label: "년" },
];

export function UsIndexChart({ indices }: { indices: UsQuote[] }) {
  const [sym, setSym] = useState("^GSPC");
  const [tab, setTab] = useState("1D");
  const [ind, setInd] = useState<Indicators>({});

  const { data, isLoading } = useSWR<{ data: Candle[] }>(
    `/api/us-stock?part=chart&symbol=${encodeURIComponent(sym)}&kind=${tab}`,
    fetcher,
    { refreshInterval: tab === "5m" ? 60_000 : 0, keepPreviousData: true },
  );
  const candles = data?.data ?? [];
  const q = indices.find((x) => x.symbol === sym);
  const label = INDICES.find((x) => x.symbol === sym)?.label ?? sym;

  return (
    <Card
      title="지수 차트"
      right={
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
        <CandleChart data={candles} height={280} indicators={ind} session={tab === "5m"} precision={2} />
      ) : (
        <div className="grid h-[280px] place-items-center text-sm text-muted">데이터 없음</div>
      )}
    </Card>
  );
}
