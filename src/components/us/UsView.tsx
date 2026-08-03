"use client";
import { useState } from "react";
import { UsSection } from "@/components/sections/UsSection";
import { UsStockView } from "@/components/us/UsStockView";

const VIEWS = [
  { key: "market", label: "시장" },
  { key: "stock", label: "종목" },
] as const;

export function UsView() {
  const [view, setView] = useState<"market" | "stock">("market");
  return (
    <>
      <div className="flex w-fit items-center gap-1 rounded-xl border border-line bg-surface p-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              view === v.key ? "bg-brand text-white" : "text-muted hover:text-fg"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "market" ? <UsSection /> : <UsStockView />}
    </>
  );
}
