"use client";
import type { Indicators } from "@/components/CandleChart";

const ITEMS: { key: keyof Indicators; label: string }[] = [
  { key: "ma", label: "이평선" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
];

export function IndicatorBar({
  value,
  onChange,
}: {
  value: Indicators;
  onChange: (v: Indicators) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted">지표</span>
      {ITEMS.map((it) => {
        const on = !!value[it.key];
        return (
          <button
            key={it.key}
            onClick={() => onChange({ ...value, [it.key]: !on })}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              on
                ? "bg-brand text-white border-brand"
                : "border-line text-muted hover:text-fg"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
