"use client";
import { useState } from "react";
import Link from "next/link";
import { GradeBadge, useGrades } from "@/components/GradeBadge";
import { useSticky } from "@/lib/useSticky";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { MarketToggle, type Mkt } from "@/components/MarketToggle";
import { num, pct, signColor } from "@/lib/format";
import type { NStock } from "@/lib/naverApi";

type Dir = "up" | "down" | "high" | "low";
const DIRS: { key: Dir; label: string; on: string }[] = [
  { key: "up", label: "상승", on: "bg-up text-white" },
  { key: "down", label: "하락", on: "bg-down text-white" },
  { key: "high", label: "신고가", on: "bg-up text-white" },
  { key: "low", label: "신저가", on: "bg-down text-white" },
];

/** 시가총액 하한 (원). 소형 급등주를 걸러 우량주 흐름만 보고 싶을 때 */
const CAPS: { key: number; label: string }[] = [
  { key: 0, label: "전체" },
  { key: 50_000_000_000, label: "500억↑" },
  { key: 500_000_000_000, label: "5000억↑" },
  { key: 1_000_000_000_000, label: "1조↑" },
];

export function MoversSection() {
  const [market, setMarket] = useState<Mkt>("KOSPI");
  const [dir, setDir] = useState<Dir>("up");
  const [minCap, setMinCap] = useSticky("kr.movers.minCap", 0);
  const { data, isLoading } = useSWR<{ data: NStock[]; needKey?: boolean }>(
    `/api/movers?market=${market}&dir=${dir}&minCap=${minCap}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const rows = (data?.data ?? []).slice(0, 12);
  // 종목명 옆에 종합평가 등급 — 이미 모아 둔 지표로 계산만 한다
  const grades = useGrades(rows.map((r) => r.code));

  return (
    <Card
      title="특징주"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <MarketToggle value={market} onChange={setMarket} />
          {/* 시가총액으로 거르기 — 소형 급등주 대신 우량주 흐름을 보고 싶을 때 */}
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
            {CAPS.map((c) => (
              <button
                key={c.key}
                onClick={() => setMinCap(c.key)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  minCap === c.key ? "bg-brand text-white" : "text-muted hover:text-fg"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
            {DIRS.map((d) => (
              <button
                key={d.key}
                onClick={() => setDir(d.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                  dir === d.key ? d.on : "text-muted hover:text-fg"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {isLoading && !rows.length ? (
        <div className="h-64 animate-pulse rounded-lg bg-line/30" />
      ) : !rows.length ? (
        <div className="grid h-24 place-items-center text-sm text-muted">
          {dir === "high" ? "오늘 52주 신고가 종목 없음" : dir === "low" ? "오늘 52주 신저가 종목 없음" : "데이터 없음"}
        </div>
      ) : (
        /* 왼쪽 열에 1~n, 오른쪽 열에 n+1~ (열 우선 배치) */
        <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
          {[rows.slice(0, Math.ceil(rows.length / 2)), rows.slice(Math.ceil(rows.length / 2))].map(
            (col, ci) =>
              col.length > 0 && (
                <ol key={ci} className="flex flex-col gap-1.5">
                  {col.map((s, i) => {
                    const rank = ci === 0 ? i + 1 : Math.ceil(rows.length / 2) + i + 1;
                    return (
                      <li key={s.code}>
                        <Link
                          href={`/stock?code=${s.code}&name=${encodeURIComponent(s.name)}`}
                          className="flex items-center gap-2 rounded-lg border border-line/60 px-3 py-2 transition-colors hover:border-brand/40 hover:bg-brand/5"
                        >
                          <span className="tnum text-xs text-muted w-5 shrink-0">{rank}</span>
                          {/* 등급은 종목명 바로 옆에 — 이름과 한 덩어리로 읽히게 */}
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="truncate font-medium">{s.name}</span>
                            <GradeBadge score={grades[s.code]} />
                          </span>
                          <span className="tnum text-sm text-muted shrink-0">{num(s.price)}</span>
                          <span
                            className={`tnum text-sm font-semibold w-16 text-right shrink-0 ${signColor(s.changePct)}`}
                          >
                            {pct(s.changePct)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              ),
          )}
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted">
        {dir === "high" || dir === "low"
          ? `시총 상위 400종목 중 당일 ${dir === "high" ? "고가가 52주 최고" : "저가가 52주 최저"}를 갱신한 종목 (ETF·ETN 제외) · KRX 기준`
          : "KRX + NXT(넥스트레이드) 통합 기준 · ETF·ETN 제외"}
      </div>
    </Card>
  );
}
