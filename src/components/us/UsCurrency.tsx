"use client";
import { createContext, useContext, type ReactNode } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { koName } from "@/lib/usKo";
import { num } from "@/lib/format";
import { useSticky } from "@/lib/useSticky";

export type Cur = "USD" | "KRW";

interface Ctx {
  cur: Cur;
  setCur: (c: Cur) => void;
  rate: number; // USD/KRW
  /** 달러 값을 현재 통화로 변환해 표기 */
  money: (usd: number, digits?: number) => string;
  /** 시가총액 등 큰 금액 축약 */
  big: (usd: number) => string;
}

const CurrencyCtx = createContext<Ctx>({
  cur: "USD",
  setCur: () => {},
  rate: 0,
  money: (v) => num(v, 2),
  big: (v) => String(v),
});

export const useCur = () => useContext(CurrencyCtx);

export function UsCurrencyProvider({ children }: { children: ReactNode }) {
  // 다른 화면에 갔다 돌아와도 선택한 통화가 유지되도록 저장
  const [cur, setCur] = useSticky<Cur>("us.cur", "USD");
  // 원화 환산은 국내 고시환율(대시보드 시장지표와 동일 소스) 사용
  const { data } = useSWR<{ fx: { label: string; price: number }[] }>("/api/market", fetcher, {
    refreshInterval: 300_000,
  });
  const rate = data?.fx?.find((f) => f.label.startsWith("달러"))?.price ?? 0;
  const usable = cur === "KRW" && rate > 0;

  const money = (usd: number, digits = 2) =>
    usable ? `${num(usd * rate, 0)}원` : `${num(usd, digits)}`;

  const big = (usd: number) => {
    if (usable) {
      const w = usd * rate;
      if (w >= 1e12) return `${(w / 1e12).toFixed(1)}조원`;
      if (w >= 1e8) return `${(w / 1e8).toFixed(0)}억원`;
      return `${num(w, 0)}원`;
    }
    if (usd >= 1e12) return `${(usd / 1e12).toFixed(2)}T$`;
    if (usd >= 1e9) return `${(usd / 1e9).toFixed(1)}B$`;
    if (usd >= 1e6) return `${(usd / 1e6).toFixed(1)}M$`;
    return `${num(usd, 0)}$`;
  };

  return (
    <CurrencyCtx.Provider value={{ cur, setCur, rate, money, big }}>{children}</CurrencyCtx.Provider>
  );
}

/** 통화 전환 토글 (달러 / 원화) */
export function CurrencyToggle() {
  const { cur, setCur, rate } = useCur();
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
        {(
          [
            ["USD", "달러"],
            ["KRW", "원화"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setCur(k)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              cur === k ? "bg-brand text-white" : "text-muted hover:text-fg"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {cur === "KRW" && rate > 0 && (
        <span className="tnum text-[11px] text-muted">₩{num(rate, 1)}/$</span>
      )}
    </div>
  );
}

/**
 * 시간외 시세 배지 — 마감가 옆에 "프리마켓 303.55 +0.04%" 처럼 붙는다.
 * 정규장 중에는 표시하지 않는다 (현재가가 곧 정규장 가격이므로 중복).
 */
export function ExtQuote({
  label,
  price,
  changePct,
  className = "",
}: {
  label?: "프리마켓" | "애프터" | "주간거래";
  price?: number;
  changePct?: number;
  className?: string;
}) {
  const { money } = useCur();
  if (!label || !price) return null;
  const up = (changePct ?? 0) > 0;
  const flat = (changePct ?? 0) === 0;
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${className}`}>
      <span className="rounded border border-line bg-canvas/60 px-1 py-0.5 text-[10px] font-semibold text-muted">
        {label}
      </span>
      <span className="tnum text-xs font-semibold">{money(price)}</span>
      <span className={`tnum text-[11px] ${flat ? "text-muted" : up ? "text-up" : "text-down"}`}>
        {up ? "+" : ""}
        {(changePct ?? 0).toFixed(2)}%
      </span>
    </span>
  );
}

/** 종목명 — 한글명(있으면) + 티커를 작게 */
export function StockName({
  symbol,
  fallback,
  className = "",
}: {
  symbol: string;
  fallback?: string;
  className?: string;
}) {
  const ko = koName(symbol);
  return (
    <span className={`inline-flex min-w-0 items-baseline gap-1.5 ${className}`}>
      <span className="truncate font-medium">{ko ?? fallback ?? symbol}</span>
      <span className="tnum shrink-0 text-[11px] text-muted">{symbol}</span>
    </span>
  );
}
