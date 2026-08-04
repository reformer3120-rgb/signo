"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { num, pct, signColor } from "@/lib/format";

interface Item {
  label: string;
  price: number;
  changePct: number;
}

/**
 * 장이 끝났을 때 대시보드 지수 카드 아래에 붙는 지수선물 줄.
 * 현물은 멈춰 있어도 선물은 계속 움직이므로, 마감 뒤 시장 방향을 여기서 본다.
 */
function Strip({ items, note }: { items: Item[]; note: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-2.5 rounded-lg border border-line bg-canvas/40 px-3 py-2">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[11px] font-semibold">지수선물</span>
        <span className="text-[10px] text-muted">{note}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
        {items.map((x) => (
          <div key={x.label} className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="truncate text-[11px] text-muted">{x.label}</span>
            <span className="tnum shrink-0 text-xs font-semibold">
              {num(x.price, 2)}
              <span className={`ml-1 text-[11px] font-medium ${signColor(x.changePct)}`}>
                {pct(x.changePct)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 국내 지수선물 (코스피200 · 코스닥150) */
export function KrFuturesStrip() {
  const { data } = useSWR<{ futures: Item[] }>("/api/market", fetcher, {
    refreshInterval: 120_000,
  });
  const items = (data?.futures ?? []).filter((x) => /코스피200|코스닥150/.test(x.label));
  return <Strip items={items} note="장 마감 후에도 거래됩니다" />;
}

/** 미국 지수선물 (S&P500 · 나스닥100 · 다우 · 러셀2000) */
export function UsFuturesStrip() {
  const { data } = useSWR<{ data: { futures: Item[] } }>("/api/us?part=indicators", fetcher, {
    refreshInterval: 120_000,
  });
  return <Strip items={data?.data?.futures ?? []} note="정규장 밖에서도 거래됩니다" />;
}
