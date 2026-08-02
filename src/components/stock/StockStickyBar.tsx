"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { StockSearch } from "@/components/StockSearch";
import { num, pct, signColor, won } from "@/lib/format";
import type { Candle, Quote } from "@/lib/types";

/**
 * 종목 탭 상단 고정 바 — 탭 바로 아래에 붙어 스크롤해도 계속 보인다.
 * 검색창 + 현재 종목의 시세(가격·등락률·고가·저가·거래량).
 */
export function StockStickyBar({
  code,
  name,
  interval,
  onSelect,
}: {
  code: string;
  name: string;
  interval: string;
  onSelect: (code: string, name: string) => void;
}) {
  const { data: quote } = useSWR<{ data: Quote }>(`/api/quote?code=${code}`, fetcher, {
    refreshInterval: 30_000,
  });
  // 차트와 동일한 봉 데이터로 고가·저가·거래량 산출
  const { data: ohlcv } = useSWR<{ data: Candle[] }>(
    `/api/ohlcv?code=${code}&interval=${interval}`,
    fetcher,
    { keepPreviousData: true },
  );
  const q = quote?.data;
  const candles = ohlcv?.data ?? [];
  const hi = candles.length ? Math.max(...candles.map((c) => c.high)) : 0;
  const lo = candles.length ? Math.min(...candles.map((c) => c.low)) : 0;
  const vol = candles.length ? candles[candles.length - 1].volume : 0;

  return (
    <div className="sticky top-[3.25rem] z-20 rounded-xl border border-line bg-surface/95 backdrop-blur px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StockSearch current={`${name} · ${code}`} onSelect={onSelect} />
        {q && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold">{name}</span>
            <span className="tnum text-xl font-bold">{won(q.price)}</span>
            <span className={`tnum text-sm font-semibold ${signColor(q.changePct)}`}>
              {pct(q.changePct)}
            </span>
          </div>
        )}
        {!!hi && (
          <div className="flex items-center gap-2.5 text-xs text-muted ml-auto">
            <span>
              고 <b className="tnum text-up">{num(hi)}</b>
            </span>
            <span>
              저 <b className="tnum text-down">{num(lo)}</b>
            </span>
            <span className="hidden sm:inline">
              거래량 <b className="tnum text-fg">{num(vol)}</b>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
