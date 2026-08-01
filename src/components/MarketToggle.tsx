"use client";

export type Mkt = "KOSPI" | "KOSDAQ";

export function MarketToggle({ value, onChange }: { value: Mkt; onChange: (m: Mkt) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
      {(["KOSPI", "KOSDAQ"] as Mkt[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            value === m ? "bg-brand text-white" : "text-muted hover:text-fg"
          }`}
        >
          {m === "KOSPI" ? "코스피" : "코스닥"}
        </button>
      ))}
    </div>
  );
}
