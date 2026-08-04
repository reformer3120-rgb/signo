"use client";
import { useEffect, useState } from "react";
import { krSessionNow, isNxtOnly, usSessionNow } from "@/lib/session";

/** 세션에 따른 배지 색 — 정규장 초록, 시간외 파랑, 마감 회색 */
function tone(regular: boolean, closed: boolean) {
  if (regular) return "border-up/40 bg-up/10 text-up";
  if (closed) return "border-line bg-canvas/60 text-muted";
  return "border-signal/40 bg-signal/10 text-signal";
}

/**
 * 국내 증시 세션 배지.
 * KRX가 닫히고 NXT에서만 거래되는 시간대임을 알려준다 — 이때 보이는
 * 시세와 등락은 NXT 체결 기준이라 정규장과 다를 수 있다.
 */
export function KrSessionBadge({ className = "" }: { className?: string }) {
  // 서버와 클라이언트의 시각이 달라 생기는 하이드레이션 불일치를 피한다
  const [s, setS] = useState<ReturnType<typeof krSessionNow> | null>(null);
  useEffect(() => {
    const tick = () => setS(krSessionNow());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (!s) return null;
  const nxt = isNxtOnly(s);
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${tone(
        s === "정규장",
        s === "장마감",
      )} ${className}`}
      title={
        nxt
          ? "KRX는 닫혀 있고 넥스트레이드(NXT)에서만 거래되는 시간입니다. 시세·등락은 NXT 체결 기준입니다."
          : "정규장 09:00~15:30 · NXT 08:00~09:00, 15:30~20:00"
      }
    >
      {nxt ? `${s} 단독거래` : s}
    </span>
  );
}

/** 미국 증시 세션 배지 */
export function UsSessionBadge({ className = "" }: { className?: string }) {
  const [s, setS] = useState<ReturnType<typeof usSessionNow> | null>(null);
  useEffect(() => {
    const tick = () => setS(usSessionNow());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (!s) return null;
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${tone(
        s === "정규장",
        s === "장마감",
      )} ${className}`}
      title="한국시간 · 주간거래 10:00~18:00 · 프리마켓 18:00~23:30 · 정규장 23:30~06:00 · 애프터 06:00~10:00"
    >
      {s}
    </span>
  );
}
