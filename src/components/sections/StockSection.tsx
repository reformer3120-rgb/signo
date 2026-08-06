"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { useChartFit } from "@/lib/useChartFit";
import { KrSessionBadge } from "@/components/SessionBadge";
import { CandleChart, type Indicators } from "@/components/CandleChart";
import { IndicatorBar } from "@/components/IndicatorBar";
import { MaLegend } from "@/components/MaLegend";
import { InvestorPanel } from "@/components/InvestorPanel";
import { ExchangeSelect, type Exch } from "@/components/ExchangeSelect";
import { num, pct, signColor, won } from "@/lib/format";
import type { Candle, Interval, Quote } from "@/lib/types";

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
  onTab,
  onMinUnit,
}: {
  code?: string;
  name?: string;
  tab?: string;
  minUnit?: Interval;
  onTab?: (tab: string) => void;
  onMinUnit?: (u: Interval) => void;
}) {
  const code = codeProp ?? "005930";
  const name = nameProp ?? "삼성전자";
  const [tabState, setTabState] = useState("1D");
  const [minUnitState, setMinUnitState] = useState<Interval>("5");
  const tab = tabProp ?? tabState;
  const minUnit = minUnitProp ?? minUnitState;
  const setTab = (t: string) => (onTab ? onTab(t) : setTabState(t));
  const setMinUnit = (u: Interval) => (onMinUnit ? onMinUnit(u) : setMinUnitState(u));
  const [ind, setInd] = useState<Indicators>({});
  // 고정된 차트 카드가 화면보다 커지지 않게 높이를 맞춘다
  const fitHeight = useChartFit();
  const [exch, setExch] = useState<Exch>("KRX");
  const interval: Interval = tab === "min" ? minUnit : (tab as Interval);

  const { data: ohlcv, isLoading } = useSWR<{ data: Candle[] }>(
    `/api/ohlcv?code=${code}&interval=${interval}&exchange=${exch}`,
    fetcher,
    { refreshInterval: tab === "min" ? 60_000 : 0, keepPreviousData: true },
  );

  const { data: quote } = useSWR<{ data: Quote }>(
    `/api/quote?code=${code}&exchange=${exch}`,
    fetcher,
    { refreshInterval: 30_000, keepPreviousData: true },
  );

  const candles = ohlcv?.data ?? [];
  const stat = useMemo(() => {
    if (!candles.length) return null;
    return {
      hi: Math.max(...candles.map((c) => c.high)),
      lo: Math.min(...candles.map((c) => c.low)),
      volume: candles[candles.length - 1].volume,
    };
  }, [candles]);
  const q = quote?.data;

  return (
    <>
      <Card
        // 스크롤해도 차트가 화면에 남고 아래 카드들이 그 밑으로 지나간다
        className="sticky z-[5]"
        style={{ top: "calc(var(--nav-bottom, 90px) + var(--stockbar-h, 44px) + 4px)" }}
      >
      {/* 종목명·현재가 — 카드째 고정되므로 따로 붙일 필요가 없다 */}
      <div className="mb-2 rounded-lg border border-line/60 bg-surface/95 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xl font-semibold">{name}</span>
          {q && (
            <>
              <span className="tnum text-xl font-bold">{won(q.price)}</span>
              <span className={`tnum text-sm font-semibold ${signColor(q.changePct)}`}>
                {pct(q.changePct)}
              </span>
            </>
          )}
          {/* 어느 거래소 기준인지 명시 */}
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
              exch === "KRX" ? "border-line text-muted" : "border-signal/40 bg-signal/10 text-signal"
            }`}
          >
            {exch === "UN" ? "통합" : exch}
          </span>
          {/* KRX가 닫힌 시간대면 지금 시세가 NXT 기준임을 알린다 */}
          <KrSessionBadge />
          {stat && (
            <div className="ml-auto flex items-center gap-2.5 text-xs text-muted">
              <span>
                고 <b className="tnum text-up">{num(stat.hi)}</b>
              </span>
              <span>
                저 <b className="tnum text-down">{num(stat.lo)}</b>
              </span>
              <span className="hidden sm:inline">
                거래량 <b className="tnum text-fg">{num(stat.volume)}</b>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 지표와 봉주기를 같은 선상에 배치 */}
      <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <IndicatorBar value={ind} onChange={setInd} />
          {ind.ma && <MaLegend />}
        </div>
        <div className="flex items-center gap-2">
          <ExchangeSelect value={exch} onChange={setExch} />
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
      </div>

      {isLoading ? (
        <div className="animate-pulse rounded-lg bg-line/40" style={{ height: fitHeight ?? 440 }} />
      ) : candles.length ? (
        <CandleChart
          data={candles}
          indicators={ind}
          session={tab === "min" || tab === "1D"}
          precision={0}
          fitHeight={fitHeight}
          viewKey={`kr:${code}:${exch}:${interval}`}
        />
      ) : (
        <div className="grid place-items-center text-sm text-muted" style={{ height: fitHeight ?? 440 }}>데이터 없음</div>
      )}

      </Card>

      {/* 투자자수급은 차트 카드 밖으로 뺀다. 차트를 화면에 고정하려면
          고정되는 카드가 짧아야 아래 자료를 읽을 공간이 남는다. */}
      <InvestorPanel code={code} />
    </>
  );
}
