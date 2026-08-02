"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import type { Financials } from "@/lib/naverApi";

// 표시할 주요 항목 (있는 것만)
const KEYS = ["매출액", "영업이익", "당기순이익", "영업이익률", "순이익률", "ROE", "부채비율", "EPS"];

export function FinancialsCard({ code }: { code: string }) {
  const [period, setPeriod] = useState<"annual" | "quarter">("annual");
  const { data } = useSWR<{ data: Financials }>(
    `/api/financials?code=${code}&period=${period}`,
    fetcher,
  );
  const f = data?.data;

  const tab = (p: "annual" | "quarter", label: string) => (
    <button
      onClick={() => setPeriod(p)}
      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
        period === p ? "bg-brand text-white" : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card
      title="재무제표"
      right={
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-line/30 p-0.5">
            {tab("annual", "연간")}
            {tab("quarter", "분기")}
          </div>
          <span className="hidden sm:inline text-xs text-muted">억원 · E=추정</span>
        </div>
      }
    >
      {!f ? (
        <div className="h-40 animate-pulse rounded-lg bg-line/30" />
      ) : (
        (() => {
          const rows = f.rows.filter((r) => KEYS.includes(r.title));
          const isPct = (t: string) => t.includes("률") || t === "ROE";
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[340px]">
                <thead>
                  <tr className="text-xs text-muted border-b border-line">
                    <th className="text-left font-medium py-2 pl-1">항목</th>
                    {f.periods.map((p) => (
                      <th key={p.title} className="text-right font-medium px-2 whitespace-nowrap">
                        {p.title}
                        {p.cns && <span className="text-signal">E</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.title} className="border-b border-line/40">
                      <td className="py-2 pl-1 font-medium whitespace-nowrap">{r.title}</td>
                      {r.values.map((v, i) => (
                        <td key={i} className="text-right tnum px-2 whitespace-nowrap">
                          {v ? `${v}${isPct(r.title) ? "%" : ""}` : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()
      )}
    </Card>
  );
}
