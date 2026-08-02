"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";
import { num, pct, signColor, won } from "@/lib/format";

interface Item {
  label: string;
  price: number;
  changePct: number;
  spark: number[];
}
interface MarketResp {
  fx: Item[];
  commodities: Item[];
  crypto: Item[];
  futures: Item[];
}

function Tile({ it, fmt }: { it: Item; fmt: (v: number) => string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-canvas/40 px-3 py-2.5">
      <div className="text-xs text-muted truncate">{it.label}</div>
      <div className="mt-1 flex items-end justify-between gap-1">
        <div className="min-w-0">
          <div className="tnum text-sm font-semibold leading-tight truncate">{fmt(it.price)}</div>
          <div className={`tnum text-xs font-medium ${signColor(it.changePct)}`}>{pct(it.changePct)}</div>
        </div>
        <div className="shrink-0">
          <Sparkline data={it.spark} up={it.changePct >= 0} />
        </div>
      </div>
    </div>
  );
}

function Group({ title, items, fmt }: { title: string; items?: Item[]; fmt: (v: number) => string }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-muted mb-1.5">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {items.map((it, i) => (
          <Tile key={`${it.label}-${i}`} it={it} fmt={fmt} />
        ))}
      </div>
    </div>
  );
}

export function MarketSection() {
  const { data } = useSWR<MarketResp>("/api/market", fetcher, { refreshInterval: 60_000 });

  if (!data) {
    return (
      <Card title="환율 · 원자재 · 가상자산 · 선물">
        <div className="h-48 animate-pulse rounded-lg bg-line/30" />
      </Card>
    );
  }

  const w2 = (v: number) => num(v, 2);
  return (
    <Card
      title="환율 · 원자재 · 가상자산 · 선물"
      right={<span className="text-xs text-muted">라인 · 60초</span>}
    >
      <div className="flex flex-col gap-3.5">
        <Group title="환율" items={data.fx} fmt={(v) => `${num(v, 2)}원`} />
        <Group title="원자재" items={data.commodities} fmt={w2} />
        <Group title="가상자산 (원화)" items={data.crypto} fmt={(v) => `${won(v)}원`} />
        <Group title="선물" items={data.futures} fmt={w2} />
      </div>
    </Card>
  );
}
