"use client";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * 차트 접기·펼치기.
 * 차트를 화면에 고정해 두면 아래 자료를 읽을 자리가 줄어든다.
 * 표나 재무제표를 훑을 때는 접어서 화면을 비울 수 있게 한다.
 */
export function ChartFoldButton({
  folded,
  onToggle,
  className = "",
}: {
  folded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onToggle}
      title={folded ? "차트 펼치기" : "차트 접기 — 아래 자료를 볼 자리를 넓힌다"}
      aria-expanded={!folded}
      className={`flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-fg ${className}`}
    >
      {folded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      {folded ? "차트" : "접기"}
    </button>
  );
}
