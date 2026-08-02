"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { CandleChart, type Indicators } from "@/components/CandleChart";
import { IndicatorBar } from "@/components/IndicatorBar";
import { MaLegend } from "@/components/MaLegend";
import { InvestorPanel } from "@/components/InvestorPanel";
import type { Candle, Interval } from "@/lib/types";

const TABS: { key: string; label: string }[] = [
  { key: "min", label: "분봉" },
  { key: "1D", label: "일봉" },
  { key: "1W", label: "주봉" },
  { key: "1M", label: "월봉" },
  { key: "1Y", label: "연봉" },
];
const MIN_UNITS: Interval[] = ["1", "5", "15", "30", "60", "240"];

export function StockSection({
  code: codeProp,
  name: nameProp,
  tab: tabProp,
  minUnit: minUnitProp,
  onCode,
  onTab,
  onMinUnit,
}: {
  code?: string;
  name?: string;
  tab?: string;
  minUnit?: Interval;
  onCode?: (code: string, name: string) => void;
  onTab?: (tab: string) => void;
  onMinUnit?: (u: Interval) => void;
}) {
  const [codeState, setCodeState] = useState("005930");
  const [nameState] = useState("삼성전자");
  const code = codeProp ?? codeState;
  const [tabState, setTabState] = useState("1D");
  const [minUnitState, setMinUnitState] = useState<Interval>("5");
  const tab = tabProp ?? tabState;
  const minUnit = minUnitProp ?? minUnitState;
  const setTab = (t: string) => (onTab ? onTab(t) : setTabState(t));
  const setMinUnit = (u: Interval) => (onMinUnit ? onMinUnit(u) : setMinUnitState(u));
  const [ind, setInd] = useState<Indicators>({});
  const interval: Interval = tab === "min" ? minUnit : (tab as Interval);

  const { data: ohlcv, isLoading } = useSWR<{ data: Candle[] }>(
    `/api/ohlcv?code=${code}&interval=${interval}`,
    fetcher,
    { refreshInterval: tab === "min" ? 60_000 : 0 },
  );

  const candles = ohlcv?.data ?? [];

  return (
    <Card
      title="종목"
      right={
        <div className="flex items-center gap-2">
          {tab === "min" && (
            <select
              value={minUnit}
              onChange={(e) => setMinUnit(e.target.value as Interval)}
              className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs font-medium outline-none focus:border-brand"
            >
              {MIN_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}분
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
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
      {/* 종목명·가격·고저·거래량은 상단 고정바(StockStickyBar)에 표시 */}
      {tab === "min" && (
        <div className="mb-2 text-xs text-signal">· 네이버 {minUnit}분봉</div>
      )}

      <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
        <IndicatorBar value={ind} onChange={setInd} />
        {ind.ma && <MaLegend />}
      </div>

      {isLoading ? (
        <div className="h-[440px] animate-pulse rounded-lg bg-line/40" />
      ) : candles.length ? (
        <CandleChart data={candles} indicators={ind} session={tab === "min" || tab === "1D"} precision={0} />
      ) : (
        <div className="grid h-[440px] place-items-center text-sm text-muted">데이터 없음</div>
      )}

      <InvestorPanel code={code} />
    </Card>
  );
}
