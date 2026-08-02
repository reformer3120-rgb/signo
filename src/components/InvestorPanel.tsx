"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { num, signColor } from "@/lib/format";
import type { InvestorRow } from "@/lib/kis";
import type { TrendRow } from "@/lib/naverApi";

const PERIODS: { key: string; label: string; days: number }[] = [
  { key: "1d", label: "일", days: 1 },
  { key: "1w", label: "주", days: 5 },
  { key: "1m", label: "월", days: 20 },
  { key: "6m", label: "반기", days: 120 },
  { key: "1y", label: "1년", days: 250 },
];

function Num({ v }: { v: number }) {
  return (
    <span className={`tnum ${signColor(v)}`}>
      {v > 0 ? "+" : ""}
      {num(v)}
    </span>
  );
}

export function InvestorPanel({ code }: { code: string }) {
  const [tab, setTab] = useState<"daily" | "cum">("daily");
  const [expanded, setExpanded] = useState(false);
  const [period, setPeriod] = useState("1w");
  const { data } = useSWR<{ data: InvestorRow[]; needKey?: boolean }>(
    `/api/investor?code=${code}`,
    fetcher,
    { refreshInterval: 30_000 },
  );

  // 누적탭: 장기 외국인/기관 (네이버 최대 1년치)
  const { data: longResp } = useSWR<{ data: TrendRow[] }>(
    tab === "cum" ? `/api/investor-frgn?code=${code}` : null,
    fetcher,
  );
  const lrows = longResp?.data ?? [];

  const rows = data?.data ?? [];
  const shown = expanded ? rows : rows.slice(0, 10);

  const cum = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period)!;
    const slice = lrows.slice(0, Math.min(p.days, lrows.length));
    const sum = slice.reduce(
      (a, r) => ({ 외국인: a.외국인 + r.외국인, 기관: a.기관 + r.기관, 개인: a.개인 + r.개인 }),
      { 외국인: 0, 기관: 0, 개인: 0 },
    );
    const from = slice[slice.length - 1]?.date ?? "";
    const to = slice[0]?.date ?? "";
    return { sum, from, to, n: slice.length };
  }, [lrows, period]);

  if (data?.needKey) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-line p-4 text-sm text-muted">
        투자자 수급은 KIS API 키가 설정되면 표시됩니다.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-line/70 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold">투자자 수급</span>
        <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
          {(["daily", "cum"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${tab === t ? "bg-brand text-white" : "text-muted"}`}
            >
              {t === "daily" ? "일별" : "누적"}
            </button>
          ))}
        </div>
      </div>

      {rows[0] && (
        <div className="mb-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-confirm animate-pulse" />
            <span className="text-xs font-semibold">
              당일 실시간 · {rows[0].date.slice(4, 6)}.{rows[0].date.slice(6, 8)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {(["외국인", "기관", "개인"] as const).map((k) => (
              <div
                key={k}
                className="flex flex-col items-center gap-0.5 rounded-md bg-canvas/40 px-2 py-1.5"
              >
                <span className="text-[11px] text-muted">{k}</span>
                <Num v={rows[0][k]} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "daily" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[360px]">
            <thead>
              <tr className="text-xs text-muted border-b border-line">
                <th className="text-left font-medium py-1.5">날짜</th>
                <th className="text-right font-medium">수익률</th>
                <th className="text-right font-medium">종가</th>
                <th className="text-right font-medium">외국인</th>
                <th className="text-right font-medium">기관</th>
                <th className="text-right font-medium">개인</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const prev = rows[i + 1]?.close;
                const ret = prev ? ((r.close - prev) / prev) * 100 : null;
                return (
                <tr key={r.date} className="border-b border-line/30">
                  <td className="py-1.5 text-muted tnum">
                    {r.date.slice(4, 6)}.{r.date.slice(6, 8)}
                  </td>
                  <td className={`text-right tnum ${ret === null ? "text-muted" : signColor(ret)}`}>
                    {ret === null ? "-" : `${ret > 0 ? "+" : ""}${ret.toFixed(2)}%`}
                  </td>
                  <td className="text-right tnum">{num(r.close)}</td>
                  <td className="text-right">
                    <Num v={r.외국인} />
                  </td>
                  <td className="text-right">
                    <Num v={r.기관} />
                  </td>
                  <td className="text-right">
                    <Num v={r.개인} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 10 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 w-full py-1.5 rounded-lg border border-line text-xs text-muted hover:text-fg hover:bg-surface"
            >
              {expanded ? "접기" : `더보기 (+${rows.length - 10}일)`}
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1 mb-3 w-fit">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${period === p.key ? "bg-brand text-white" : "text-muted"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {(["외국인", "기관", "개인"] as const).map((k) => (
              <div key={k} className="rounded-lg border border-line bg-canvas/40 px-3 py-3">
                <div className="text-xs text-muted">{k} 순매수</div>
                <div className={`tnum mt-1 text-lg font-bold ${signColor(cum.sum[k])}`}>
                  {cum.sum[k] > 0 ? "+" : ""}
                  {num(cum.sum[k])}
                </div>
              </div>
            ))}
          </div>
          {cum.to ? (
            <div className="mt-2 text-xs text-muted">
              {cum.from.slice(4, 6)}.{cum.from.slice(6, 8)} ~ {cum.to.slice(4, 6)}.{cum.to.slice(6, 8)} · {cum.n}거래일 누적 (주) · 네이버
            </div>
          ) : (
            <div className="mt-2 h-4 animate-pulse rounded bg-line/30 w-40" />
          )}
        </div>
      )}
    </div>
  );
}
