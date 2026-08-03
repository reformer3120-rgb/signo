"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { num, pct, signColor } from "@/lib/format";
import type { UsIndicator, UsMarketIndicators } from "@/lib/us";

/** 값 표기 — 금리는 %, 그 외는 자릿수만 맞춤 */
function fmt(x: UsIndicator) {
  if (x.unit === "%") return `${x.price.toFixed(3)}%`;
  const digits = x.price >= 1000 ? 0 : x.price >= 10 ? 2 : 4;
  return num(x.price, digits);
}

function Group({ title, items, note }: { title: string; items?: UsIndicator[]; note?: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-xs font-semibold text-muted">{title}</span>
        {note && <span className="text-[11px] text-muted/70">{note}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((x) => (
          <div key={x.symbol} className="min-w-0 rounded-lg border border-line bg-canvas/40 px-3 py-2.5">
            <div className="truncate text-xs text-muted">{x.label}</div>
            <div className="tnum mt-1 truncate text-sm font-semibold leading-tight">{fmt(x)}</div>
            <div className={`tnum text-xs font-medium ${signColor(x.changePct)}`}>
              {pct(x.changePct)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UsIndicatorSection() {
  const { data, isLoading } = useSWR<{ data: UsMarketIndicators }>(
    "/api/us?part=indicators",
    fetcher,
    { refreshInterval: 60_000 },
  );
  const d = data?.data;

  return (
    <Card title="시장지표" right={<span className="text-xs text-muted">야후 · 60초</span>}>
      {isLoading && !d ? (
        <div className="h-64 animate-pulse rounded-lg bg-line/30" />
      ) : !d ? (
        <div className="grid h-24 place-items-center text-sm text-muted">데이터 없음</div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <Group title="미국 국채금리" items={d.yields} note="등락률은 금리 자체의 변동" />
          <Group title="달러 · 변동성" items={d.dollar} />
          <Group title="지수선물" items={d.futures} />
          <Group title="원자재" items={d.commodities} />
          <Group title="환율" items={d.fx} />
          <Group title="가상자산" items={d.crypto} />
        </div>
      )}
    </Card>
  );
}
