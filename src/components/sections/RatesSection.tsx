"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { signColor } from "@/lib/format";
import type { BondRow } from "@/lib/naverApi";

const LABELS: Record<string, string> = {
  "2Y": "2년",
  "3Y": "3년",
  "5Y": "5년",
  "10Y": "10년",
  "30Y": "30년",
};

export function RatesSection() {
  const { data } = useSWR<{ maturities: string[]; data: BondRow[] }>("/api/rates", fetcher, {
    refreshInterval: 180_000,
  });

  return (
    <Card title="국채 금리" right={<span className="text-xs text-muted">국가 × 만기 · 네이버</span>}>
      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-line">
                <th className="text-left font-medium py-2 pl-1">국가</th>
                {data.maturities.map((m) => (
                  <th key={m} className="text-right font-medium px-2">
                    {LABELS[m] ?? m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.country} className="border-b border-line/40">
                  <td className="py-2 pl-1 font-medium whitespace-nowrap">
                    {c.flag} {c.country}
                  </td>
                  {data.maturities.map((m) => {
                    const cell = c.yields[m];
                    return (
                      <td key={m} className="text-right px-2 py-2">
                        {cell ? (
                          <div className="leading-tight">
                            <div className="tnum font-semibold">{cell.value.toFixed(2)}</div>
                            <div className={`tnum text-[11px] ${signColor(cell.change)}`}>
                              {cell.change > 0 ? "+" : ""}
                              {cell.change.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted/50">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-muted">단위 % · 아래 숫자는 전일대비(%p) · 네이버</div>
        </div>
      ) : (
        <div className="h-40 animate-pulse rounded-lg bg-line/30" />
      )}
    </Card>
  );
}
