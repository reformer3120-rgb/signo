"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { compactWon, num, pct, signColor } from "@/lib/format";
import type { UsQuote, UsSector } from "@/lib/us";

/** 달러 시가총액 축약 (조/억 달러) */
function capUsd(v: number) {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}조$`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(0)}억$`;
  return compactWon(v);
}

const MOVERS = [
  { key: "gainers", label: "상승", on: "bg-up text-white" },
  { key: "losers", label: "하락", on: "bg-down text-white" },
  { key: "actives", label: "거래활발", on: "bg-brand text-white" },
] as const;

/** 지수 + 섹터 */
function Overview() {
  const { data, isLoading } = useSWR<{ indices: UsQuote[]; sectors: UsSector[] }>(
    "/api/us?part=overview",
    fetcher,
    { refreshInterval: 60_000 },
  );
  const idx = data?.indices ?? [];
  const sectors = data?.sectors ?? [];
  const max = Math.max(1, ...sectors.map((s) => Math.abs(s.changePct)));

  return (
    <>
      <Card title="미국 지수" right={<span className="text-xs text-muted">야후 · 60초</span>}>
        {isLoading && !idx.length ? (
          <div className="h-24 animate-pulse rounded-lg bg-line/30" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {idx.map((x) => (
              <div key={x.symbol} className="min-w-0 rounded-lg border border-line bg-canvas/40 px-3 py-2.5">
                <div className="text-xs text-muted truncate">{x.name}</div>
                <div className="tnum mt-1 text-lg font-bold leading-tight truncate">
                  {num(x.price, 2)}
                </div>
                <div className={`tnum text-xs font-medium ${signColor(x.changePct)}`}>
                  {pct(x.changePct)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="섹터 강약" right={<span className="text-xs text-muted">SPDR 섹터 ETF</span>}>
        {isLoading && !sectors.length ? (
          <div className="h-48 animate-pulse rounded-lg bg-line/30" />
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {sectors.map((s) => (
              <div key={s.symbol} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 truncate">{s.name}</span>
                <span className="tnum w-12 shrink-0 text-[11px] text-muted">{s.symbol}</span>
                <div className="relative h-2 flex-1 rounded-full bg-line/30">
                  <div
                    className={`absolute top-0 h-full rounded-full ${s.changePct >= 0 ? "bg-up" : "bg-down"}`}
                    style={{
                      width: `${(Math.abs(s.changePct) / max) * 50}%`,
                      left: s.changePct >= 0 ? "50%" : undefined,
                      right: s.changePct < 0 ? "50%" : undefined,
                    }}
                  />
                  <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
                </div>
                <span className={`tnum w-16 shrink-0 text-right font-medium ${signColor(s.changePct)}`}>
                  {pct(s.changePct)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/** 특징주 */
function Movers() {
  const [kind, setKind] = useState<(typeof MOVERS)[number]["key"]>("gainers");
  const { data, isLoading } = useSWR<{ data: UsQuote[] }>(
    `/api/us?part=movers&kind=${kind}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true },
  );
  const rows = data?.data ?? [];
  const half = Math.ceil(rows.length / 2);

  return (
    <Card
      title="특징주"
      right={
        <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
          {MOVERS.map((m) => (
            <button
              key={m.key}
              onClick={() => setKind(m.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                kind === m.key ? m.on : "text-muted hover:text-fg"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    >
      {isLoading && !rows.length ? (
        <div className="h-64 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
          {[rows.slice(0, half), rows.slice(half)].map(
            (col, ci) =>
              col.length > 0 && (
                <ol key={ci} className="flex flex-col gap-1.5">
                  {col.map((s, i) => (
                    <li
                      key={s.symbol}
                      className="flex items-center gap-2 rounded-lg border border-line/60 px-3 py-2"
                    >
                      <span className="tnum w-5 shrink-0 text-xs text-muted">
                        {ci === 0 ? i + 1 : half + i + 1}
                      </span>
                      <span className="tnum w-14 shrink-0 font-semibold">{s.symbol}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">{s.name}</span>
                      <span className="tnum shrink-0 text-sm text-muted">{num(s.price, 2)}</span>
                      <span
                        className={`tnum w-16 shrink-0 text-right text-sm font-semibold ${signColor(s.changePct)}`}
                      >
                        {pct(s.changePct)}
                      </span>
                    </li>
                  ))}
                </ol>
              ),
          )}
        </div>
      )}
    </Card>
  );
}

/** 시가총액 상위 */
function MarketCap() {
  const [limit, setLimit] = useState(20);
  const { data, isLoading } = useSWR<{ data: UsQuote[]; hasMore: boolean }>(
    `/api/us?part=marketcap&limit=${limit}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true },
  );
  const rows = data?.data ?? [];

  return (
    <Card title="시가총액 상위" right={<span className="text-xs text-muted">달러 기준</span>}>
      {isLoading && !rows.length ? (
        <div className="h-72 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="w-8 py-2 pl-1 text-left font-medium">#</th>
                  <th className="text-left font-medium">종목</th>
                  <th className="text-right font-medium">현재가</th>
                  <th className="text-right font-medium">등락률</th>
                  <th className="pr-1 text-right font-medium whitespace-nowrap">시가총액</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.symbol} className="border-b border-line/40 transition-colors hover:bg-surface/70">
                    <td className="tnum py-2 pl-1 text-muted">{i + 1}</td>
                    <td className="max-w-[12rem] truncate">
                      <span className="tnum font-semibold">{s.symbol}</span>
                      <span className="ml-1.5 text-xs text-muted">{s.name}</span>
                    </td>
                    <td className="tnum text-right">{num(s.price, 2)}</td>
                    <td className={`tnum text-right font-medium ${signColor(s.changePct)}`}>
                      {pct(s.changePct)}
                    </td>
                    <td className="tnum pr-1 text-right text-muted whitespace-nowrap">
                      {capUsd(s.marketCap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            {data?.hasMore && (
              <button
                onClick={() => setLimit((v) => Math.min(50, v + 15))}
                className="flex-1 rounded-lg border border-line py-2 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-fg"
              >
                더보기
              </button>
            )}
            {limit > 20 && (
              <button
                onClick={() => setLimit(20)}
                className="flex-1 rounded-lg border border-line py-2 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-fg"
              >
                접기 (상위 20종목)
              </button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export function UsSection() {
  return (
    <>
      <Overview />
      <Movers />
      <MarketCap />
    </>
  );
}
