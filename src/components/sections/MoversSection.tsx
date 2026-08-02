"use client";
import { useState } from "react";
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

export function MoversSection() {
  const [market, setMarket] = useState<Mkt>("KOSPI");
  const [dir, setDir] = useState<Dir>("up");
  const [exchange, setExchange] = useState<"KRX" | "NXT">("KRX");
  // 신고가/신저가는 52주 기준(KRX)만 제공
  const nxtOn = exchange === "NXT" && (dir === "up" || dir === "down");
  const { data, isLoading } = useSWR<{ data: NStock[]; needKey?: boolean }>(
    `/api/movers?market=${market}&dir=${dir}${nxtOn ? "&exchange=NXT" : ""}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const rows = (data?.data ?? []).slice(0, 12);

  return (
    <Card
      title="특징주"
      right={
        <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
            {(["KRX", "NXT"] as const).map((x) => (
              <button
                key={x}
                onClick={() => setExchange(x)}
                disabled={x === "NXT" && (dir === "high" || dir === "low")}
                className={`px-2 py-1 rounded-md text-xs font-medium disabled:opacity-30 ${
                  exchange === x ? "bg-brand text-white" : "text-muted hover:text-fg"
                }`}
              >
                {x}
              </button>
            ))}
          </div>
          <MarketToggle value={market} onChange={setMarket} />
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
        <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {rows.map((s, i) => (
            <li
              key={s.code}
              className="flex items-center gap-2 rounded-lg border border-line/60 px-3 py-2"
            >
              <span className="tnum text-xs text-muted w-4 shrink-0">{i + 1}</span>
              <span className="font-medium flex-1 min-w-0 truncate">{s.name}</span>
              <span className="tnum text-sm text-muted shrink-0">{num(s.price)}</span>
              <span
                className={`tnum text-sm font-semibold w-16 text-right shrink-0 ${signColor(s.changePct)}`}
              >
                {pct(s.changePct)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {(dir === "high" || dir === "low") && (
        <div className="mt-2 text-[11px] text-muted">
          시총 상위 400종목 중 당일 {dir === "high" ? "고가가 52주 최고" : "저가가 52주 최저"}를 갱신한 종목 (ETF·ETN 제외) · KRX 기준
        </div>
      )}
      {nxtOn && (
        <div className="mt-2 text-[11px] text-muted">
          넥스트레이드(NXT) 체결 기준 등락률 · KIS
        </div>
      )}
    </Card>
  );
}
