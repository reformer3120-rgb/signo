"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { UsSessionBadge } from "@/components/SessionBadge";
import { SectorPeek } from "@/components/SectorPeek";
import { UsFuturesStrip } from "@/components/FuturesStrip";
import { usSessionNow } from "@/lib/session";
import { num, pct, signColor } from "@/lib/format";
import { useCur, CurrencyToggle, StockName, ExtQuote } from "@/components/us/UsCurrency";
import { Sparkline } from "@/components/Sparkline";
import { UsIndexChart } from "@/components/us/UsIndexChart";
import { koName } from "@/lib/usKo";
import type { UsQuote, UsSector } from "@/lib/us";

const MOVERS = [
  { key: "gainers", label: "상승", on: "bg-up text-white" },
  { key: "losers", label: "하락", on: "bg-down text-white" },
  { key: "actives", label: "거래활발", on: "bg-brand text-white" },
] as const;

/** 지수 + 섹터 */
function Overview({ onPick }: { onPick?: (s: string) => void }) {
  const { money } = useCur();
  const { data, isLoading } = useSWR<{ indices: UsQuote[]; sectors: UsSector[] }>(
    "/api/us?part=overview",
    fetcher,
    { refreshInterval: 60_000 },
  );
  const idx = data?.indices ?? [];
  const sectors = data?.sectors ?? [];
  const [offHours, setOffHours] = useState(false);
  useEffect(() => {
    const tick = () => setOffHours(usSessionNow() !== "정규장");
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  const max = Math.max(1, ...sectors.map((s) => Math.abs(s.changePct)));

  return (
    <>
      <Card
        title="미국 지수"
        right={
          <div className="flex items-center gap-2">
            {/* 지금이 어느 세션인지 — 가격이 마감가인지 시간외인지 한눈에 */}
            <UsSessionBadge />
            <CurrencyToggle />
          </div>
        }
      >
        {isLoading && !idx.length ? (
          <div className="h-24 animate-pulse rounded-lg bg-line/30" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {idx.map((x) => (
              <div key={x.symbol} className="min-w-0 rounded-lg border border-line bg-canvas/40 px-3 py-2.5">
                <div className="truncate text-xs text-muted">{x.name}</div>
                <div className="mt-1 flex items-end justify-between gap-1">
                  <div className="min-w-0">
                    <div className="tnum truncate text-lg font-bold leading-tight">
                      {num(x.price, 2)}
                    </div>
                    <div className={`tnum text-xs font-medium ${signColor(x.changePct)}`}>
                      {pct(x.changePct)}
                    </div>
                  </div>
                  {!!x.spark?.length && (
                    <div className="shrink-0">
                      <Sparkline data={x.spark} up={x.changePct >= 0} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* 정규장 밖에서는 지수 현물이 멈추므로 계속 움직이는 선물을 보여준다 */}
        {offHours && <UsFuturesStrip />}
      </Card>

      <UsIndexChart indices={idx} />

      <Card title="섹터 강약" right={<span className="text-xs text-muted">SPDR 섹터 ETF</span>}>
        {isLoading && !sectors.length ? (
          <div className="h-48 animate-pulse rounded-lg bg-line/30" />
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {sectors.map((s) => (
              // 마우스를 올리면 대표 구성종목이 펼쳐지고, 고르면 그 종목으로 이동
              <SectorPeek
                key={s.symbol}
                market="us"
                code={s.symbol}
                title={s.name}
                onPick={(sym) => onPick?.(sym)}
              >
              <div className="flex items-center gap-1.5 text-sm">
                <span className="w-20 shrink-0 truncate">{s.name}</span>
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
                <span className={`tnum w-14 shrink-0 text-right font-medium ${signColor(s.changePct)}`}>
                  {pct(s.changePct)}
                </span>
              </div>
              </SectorPeek>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/** 특징주 */
function Movers({ onPick }: { onPick?: (s: string) => void }) {
  const [kind, setKind] = useState<(typeof MOVERS)[number]["key"]>("gainers");
  const { data, isLoading } = useSWR<{ data: UsQuote[] }>(
    `/api/us?part=movers&kind=${kind}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true },
  );
  const { money } = useCur();
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
                      onClick={() => onPick?.(s.symbol)}
                      role={onPick ? "button" : undefined}
                      className={`flex items-center gap-2 rounded-lg border border-line/60 px-3 py-2 ${
                        onPick ? "cursor-pointer transition-colors hover:border-brand/40 hover:bg-brand/5" : ""
                      }`}
                    >
                      <span className="tnum w-5 shrink-0 text-xs text-muted">
                        {ci === 0 ? i + 1 : half + i + 1}
                      </span>
                      <StockName symbol={s.symbol} fallback={s.name} className="min-w-0 flex-1" />
                      <span className="tnum shrink-0 text-sm text-muted">{money(s.price)}</span>
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
function MarketCap({ onPick }: { onPick?: (s: string) => void }) {
  const [limit, setLimit] = useState(20);
  const { data, isLoading } = useSWR<{ data: UsQuote[]; hasMore: boolean }>(
    `/api/us?part=marketcap&limit=${limit}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true },
  );
  const { money, big } = useCur();
  const rows = data?.data ?? [];

  return (
    <Card title="시가총액 상위" right={<span className="text-xs text-muted">시총순</span>}>
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
                  <tr
                    key={s.symbol}
                    onClick={() => onPick?.(s.symbol)}
                    className={`border-b border-line/40 transition-colors hover:bg-surface/70 ${
                      onPick ? "cursor-pointer" : ""
                    }`}
                  >
                    <td className="tnum py-2 pl-1 text-muted">{i + 1}</td>
                    <td className="max-w-[13rem] truncate">
                      <StockName symbol={s.symbol} fallback={s.name} />
                    </td>
                    <td className="tnum text-right whitespace-nowrap">
                      {money(s.price)}
                      <ExtQuote
                        label={s.extLabel}
                        price={s.extPrice}
                        changePct={s.extChangePct}
                        className="ml-1.5"
                      />
                    </td>
                    <td className={`tnum text-right font-medium ${signColor(s.changePct)}`}>
                      {pct(s.changePct)}
                    </td>
                    <td className="tnum pr-1 text-right text-muted whitespace-nowrap">
                      {big(s.marketCap)}
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

export function UsSection({ onPick }: { onPick?: (s: string) => void }) {
  return (
    <>
      <Overview onPick={onPick} />
      <Movers onPick={onPick} />
      <MarketCap onPick={onPick} />
    </>
  );
}
