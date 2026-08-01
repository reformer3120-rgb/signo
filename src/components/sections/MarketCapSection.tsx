"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { MarketToggle, type Mkt } from "@/components/MarketToggle";
import { num, pct, signColor } from "@/lib/format";
import type { NStock } from "@/lib/naverApi";

export function MarketCapSection() {
  const [market, setMarket] = useState<Mkt>("KOSPI");
  const { data, isLoading } = useSWR<{ data: NStock[] }>(
    `/api/marketcap?market=${market}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const rows = data?.data ?? [];

  return (
    <Card title="시가총액 상위 Top 20" right={<MarketToggle value={market} onChange={setMarket} />}>
      {isLoading && !rows.length ? (
        <div className="h-72 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-line">
                <th className="text-left font-medium py-2 pl-1 w-8">#</th>
                <th className="text-left font-medium">종목</th>
                <th className="text-right font-medium">현재가</th>
                <th className="text-right font-medium">등락률</th>
                <th className="text-right font-medium hidden sm:table-cell">거래대금</th>
                <th className="text-right font-medium hidden md:table-cell pr-1">시가총액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.code} className="border-b border-line/40 hover:bg-surface/70 transition-colors">
                  <td className="py-2 pl-1 tnum text-muted">{i + 1}</td>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-right tnum">{num(s.price)}</td>
                  <td className={`text-right tnum font-medium ${signColor(s.changePct)}`}>
                    {pct(s.changePct)}
                  </td>
                  <td className="text-right tnum text-muted hidden sm:table-cell">{s.tradingValue}</td>
                  <td className="text-right tnum text-muted hidden md:table-cell pr-1">{s.marketCap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
