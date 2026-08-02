"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { num } from "@/lib/format";
import type { StockDetail } from "@/lib/naverApi";

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas/40 px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="tnum mt-0.5 text-sm font-semibold truncate">{value}</div>
    </div>
  );
}

export function StockDetailCard({ code }: { code: string }) {
  const { data } = useSWR<{ data: StockDetail }>(`/api/stock-detail?code=${code}`, fetcher, {
    refreshInterval: 60_000,
  });
  const d = data?.data;
  if (!d) {
    return (
      <Card title="종목 상세">
        <div className="h-24 animate-pulse rounded-lg bg-line/30" />
      </Card>
    );
  }
  return (
    <Card title="종목 상세" right={<span className="text-xs text-muted">네이버</span>}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        <Item label="시가총액" value={d.marketCapText || "-"} />
        <Item label="PER" value={d.per ? `${d.per}배` : "-"} />
        <Item label="PBR" value={d.pbr ? `${d.pbr}배` : "-"} />
        <Item label="EPS" value={d.eps ? `${num(d.eps)}원` : "-"} />
        <Item label="BPS" value={d.bps ? `${num(d.bps)}원` : "-"} />
        <Item label="배당수익률" value={d.dividendYield ? `${d.dividendYield}%` : "-"} />
        <Item label="외국인비율" value={d.foreignRate || "-"} />
        <Item label="추정PER" value={d.cnsPer ? `${d.cnsPer}배` : "-"} />
        <Item label="52주 최고" value={d.high52 ? num(d.high52) : "-"} />
        <Item label="52주 최저" value={d.low52 ? num(d.low52) : "-"} />
      </div>
    </Card>
  );
}
