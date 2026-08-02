"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import type { Financials } from "@/lib/naverApi";

// 표시할 주요 항목 (있는 것만)
const KEYS = ["매출액", "영업이익", "당기순이익", "영업이익률", "순이익률", "ROE", "부채비율", "EPS"];

export function FinancialsCard({ code }: { code: string }) {
  const { data } = useSWR<{ data: Financials }>(`/api/financials?code=${code}`, fetcher);
  const f = data?.data;
  if (!f) {
    return (
      <Card title="재무제표 (연간)">
        <div className="h-40 animate-pulse rounded-lg bg-line/30" />
      </Card>
    );
  }
  const rows = f.rows.filter((r) => KEYS.includes(r.title));
  const isPct = (t: string) => t.includes("률") || t === "ROE";
  return (
    <Card title="재무제표 (연간)" right={<span className="text-xs text-muted">단위 억원 · E=추정</span>}>
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
    </Card>
  );
}
