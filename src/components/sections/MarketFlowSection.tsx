"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { compactWon, num, pct, signColor } from "@/lib/format";
import type { FiRow } from "@/lib/kis";

const MARKETS = [
  { key: "ALL", label: "전체" },
  { key: "KOSPI", label: "코스피" },
  { key: "KOSDAQ", label: "코스닥" },
] as const;

/** 순매수 대금 (KIS는 백만원 단위) */
function Flow({ v }: { v: number }) {
  return (
    <td className={`text-right tnum px-2 whitespace-nowrap ${signColor(v)}`}>
      {v > 0 ? "+" : ""}
      {compactWon(v * 1e6)}
    </td>
  );
}

export function MarketFlowSection() {
  const [market, setMarket] = useState<"ALL" | "KOSPI" | "KOSDAQ">("ALL");
  const { data, isLoading } = useSWR<{ data: FiRow[]; needKey?: boolean }>(
    `/api/market-flow?market=${market}`,
    fetcher,
    { refreshInterval: 120_000 },
  );
  const rows = (data?.data ?? []).slice(0, 15);

  return (
    <Card
      title="시장 수급 · 외국인·기관 순매수 상위"
      right={
        <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
          {MARKETS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMarket(m.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                market === m.key ? "bg-brand text-white" : "text-muted hover:text-fg"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    >
      {data?.needKey ? (
        <div className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
          KIS API 키가 설정되면 표시됩니다.
        </div>
      ) : isLoading && !rows.length ? (
        <div className="h-72 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-line">
                <th className="text-left font-medium py-2 pl-1">종목</th>
                <th className="text-right font-medium px-2">현재가</th>
                <th className="text-right font-medium px-2">등락률</th>
                <th className="text-right font-medium px-2 whitespace-nowrap">외국인 순매수</th>
                <th className="text-right font-medium px-2 whitespace-nowrap">기관 순매수</th>
                <th className="text-right font-medium px-2 whitespace-nowrap">거래량</th>
                <th className="text-right font-medium px-2 whitespace-nowrap">NXT비중</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-line/40 hover:bg-surface/70">
                  <td className="font-medium py-1.5 pl-1">{r.name}</td>
                  <td className="text-right tnum px-2">{num(r.price)}</td>
                  <td className={`text-right tnum px-2 ${signColor(r.changePct)}`}>{pct(r.changePct)}</td>
                  <Flow v={r.foreignValue} />
                  <Flow v={r.instValue} />
                  <td className="text-right tnum px-2 text-muted">
                    {num(r.unVol > 0 ? r.unVol : r.krxVol)}
                  </td>
                  <td className="text-right tnum px-2">
                    {r.nxtShare >= 0 ? (
                      <span className={r.nxtShare >= 40 ? "text-signal font-semibold" : "text-muted"}>
                        {r.nxtShare}%
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-muted">
            순매수 <b>대금</b> 기준 · KRX+NXT 합산 · KIS
          </div>
        </div>
      )}
    </Card>
  );
}
