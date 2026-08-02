"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { StockSearch } from "@/components/StockSearch";
import { num, pct, signColor, won } from "@/lib/format";
import type { Candle, Quote } from "@/lib/types";

/**
 * 종목 탭 아래 고정 바 — 검색창 + 현재 종목 시세.
 * 페이지 전체에서 고정되므로 아래 카드(재무·섹터·뉴스)를 볼 때도 계속 보인다.
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
    <div className="sticky top-[3.4rem] z-20 rounded-xl border border-line bg-surface/95 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StockSearch onSelect={onSelect} />
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold">{name}</span>
          {q && (
            <>
              <span className="tnum text-xl font-bold">{won(q.price)}</span>
              <span className={`tnum text-sm font-semibold ${signColor(q.changePct)}`}>
                {pct(q.changePct)}
              </span>
            </>
          )}
        </div>
        {!!hi && (
          <div className="ml-auto flex items-center gap-2.5 text-xs text-muted">
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
