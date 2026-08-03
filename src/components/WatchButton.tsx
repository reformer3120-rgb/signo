"use client";
import { Star } from "lucide-react";
import { useWatchlist, type WatchItem } from "@/lib/watchlist";

/** 관심종목 추가/해제 버튼 */
export function WatchButton({ item }: { item: WatchItem }) {
  const { has, toggle } = useWatchlist();
  const on = has(item.code, item.market);
  return (
    <button
      onClick={() => toggle(item)}
      title={on ? "관심종목 해제" : "관심종목 추가"}
      aria-pressed={on}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${
        on
          ? "border-signal/40 bg-signal/10 text-signal"
          : "border-line text-muted hover:border-brand/40 hover:text-fg"
      }`}
    >
      <Star size={15} fill={on ? "currentColor" : "none"} />
    </button>
  );
}
