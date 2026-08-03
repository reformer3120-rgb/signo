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

const SESSION_LABEL: Record<string, string> = {
  PRE: "NXT 프리마켓",
  REGULAR: "정규장",
  AFTER: "NXT 애프터마켓",
  CLOSED: "장 마감",
};

export function MarketFlowSection() {
  const [market, setMarket] = useState<"ALL" | "KOSPI" | "KOSDAQ">("ALL");
  const [dir, setDir] = useState<"buy" | "sell">("buy");
  const { data, isLoading } = useSWR<{
    data: FiRow[];
    needKey?: boolean;
    mode?: "KRX+NXT" | "NXT" | "PENDING";
    session?: string;
  }>(`/api/market-flow?market=${market}&dir=${dir}`, fetcher, {
    refreshInterval: 120_000,
    keepPreviousData: true,
  });
  const rows = (data?.data ?? []).slice(0, 15);
  // 순매수(가집계) 이전: 거래대금 상위로 대체 표시
  const byValue = data?.mode === "NXT" || data?.mode === "PENDING";
  const nxtOnly = data?.mode === "NXT";

  return (
    <Card
      title={
        byValue
          ? `시장 수급 · ${nxtOnly ? "NXT" : "통합"} 거래대금 상위`
          : `시장 수급 · 외국인·기관 ${dir === "sell" ? "순매도" : "순매수"} 상위`
      }
      right={
        <div className="flex items-center gap-2">
          {!byValue && (
            <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
              {([
                ["buy", "순매수"],
                ["sell", "순매도"],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setDir(k)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    dir === k
                      ? k === "buy"
                        ? "bg-up text-white"
                        : "bg-down text-white"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          {data?.session && (
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
              {SESSION_LABEL[data.session] ?? data.session}
            </span>
          )}
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
                {byValue ? (
                  <th className="text-right font-medium px-2 whitespace-nowrap">
                    {nxtOnly ? "NXT" : "통합"} 거래대금
                  </th>
                ) : (
                  <>
                    <th className="text-right font-medium px-2 whitespace-nowrap">외국인 순매수</th>
                    <th className="text-right font-medium px-2 whitespace-nowrap">기관 순매수</th>
                  </>
                )}
                <th className="text-right font-medium px-2 whitespace-nowrap">거래량</th>
                {!byValue && (
                  <th className="text-right font-medium px-2 whitespace-nowrap">NXT비중</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-line/40 hover:bg-surface/70">
                  <td className="font-medium py-1.5 pl-1">{r.name}</td>
                  <td className="text-right tnum px-2">{num(r.price)}</td>
                  <td className={`text-right tnum px-2 ${signColor(r.changePct)}`}>{pct(r.changePct)}</td>
                  {byValue ? (
                    <td className="text-right tnum px-2 text-signal font-medium whitespace-nowrap">
                      {compactWon(r.nxtValue ?? 0)}
                    </td>
                  ) : (
                    <>
                      <Flow v={r.foreignValue} />
                      <Flow v={r.instValue} />
                    </>
                  )}
                  <td className="text-right tnum px-2 text-muted">
                    {num(r.unVol > 0 ? r.unVol : r.krxVol)}
                  </td>
                  {!byValue && (
                    <td className="text-right tnum px-2">
                      {r.nxtShare >= 0 ? (
                        <span className={r.nxtShare >= 40 ? "text-signal font-semibold" : "text-muted"}>
                          {r.nxtShare}%
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-muted">
            {nxtOnly
              ? "NXT만 거래되는 시간대 — NXT 체결 기준 거래대금 상위 · KIS"
              : byValue
                ? "외국인·기관 순매수는 장 마감 후 가집계로 제공됩니다. 그전까지는 KRX+NXT 통합 거래대금 상위를 표시하며, 집계가 들어오면 자동으로 순매수 순위로 전환됩니다 · KIS"
                : "순매수 대금 기준 · KRX+NXT 합산 · 거래량은 통합 기준 · KIS"}
          </div>
        </div>
      )}
    </Card>
  );
}
