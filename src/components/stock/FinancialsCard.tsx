"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { signColor } from "@/lib/format";
import type { Financials } from "@/lib/naverApi";

// 표시할 주요 항목 (있는 것만)
const KEYS = ["매출액", "영업이익", "당기순이익", "영업이익률", "순이익률", "ROE", "부채비율", "EPS"];
// 가이던스(컨센서스 추정)로 보여줄 항목
const GUIDE_KEYS = ["매출액", "영업이익", "당기순이익", "영업이익률", "ROE", "EPS"];
const isPctKey = (t: string) => t.includes("률") || t === "ROE";

const toNum = (v?: string | null) => {
  if (v == null) return NaN;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/** 마지막 컨센서스(E) 기간을 직전 확정 실적과 비교한 가이던스 */
function guidance(f: Financials) {
  const ei = f.periods.map((p, i) => (p.cns ? i : -1)).filter((i) => i >= 0).pop();
  if (ei === undefined) return null;
  const ai = f.periods.map((p, i) => (!p.cns ? i : -1)).filter((i) => i >= 0).pop();
  const items = GUIDE_KEYS.map((k) => {
    const row = f.rows.find((r) => r.title === k);
    if (!row) return null;
    const est = row.values[ei];
    if (est == null) return null;
    const base = ai === undefined ? null : row.values[ai];
    const e = toNum(est);
    const b = toNum(base);
    // 비율 항목은 %p 차이, 금액 항목은 증감률
    const delta =
      Number.isFinite(e) && Number.isFinite(b) && b !== 0
        ? isPctKey(k)
          ? { v: +(e - b).toFixed(2), unit: "%p" }
          : { v: +(((e - b) / Math.abs(b)) * 100).toFixed(1), unit: "%" }
        : null;
    return { key: k, est: String(est), delta };
  }).filter((x): x is NonNullable<typeof x> => !!x);
  return items.length
    ? { title: f.periods[ei].title, baseTitle: ai === undefined ? "" : f.periods[ai].title, items }
    : null;
}

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
          const isPct = isPctKey;
          const g = guidance(f);
          return (
            <>
            {g && (
              <div className="mb-3 rounded-xl border border-signal/30 bg-signal/5 px-3 py-2.5">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-xs font-semibold">
                    {g.title.replace(/\.$/, "")} 가이던스
                  </span>
                  <span className="text-[11px] text-muted">
                    애널리스트 컨센서스 추정{g.baseTitle && ` · ${g.baseTitle.replace(/\.$/, "")} 대비`}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
                  {g.items.map((it) => (
                    <div key={it.key} className="rounded-lg bg-canvas/60 px-2 py-1.5">
                      <div className="text-[10px] text-muted truncate">{it.key}</div>
                      <div className="tnum text-sm font-bold truncate">
                        {it.est}
                        {isPct(it.key) ? "%" : ""}
                      </div>
                      {it.delta && (
                        <div className={`tnum text-[11px] font-medium ${signColor(it.delta.v)}`}>
                          {it.delta.v > 0 ? "+" : ""}
                          {it.delta.v}
                          {it.delta.unit}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            </>
          );
        })()
      )}
    </Card>
  );
}
