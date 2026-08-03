"use client";
import { useState } from "react";
import { UsSection } from "@/components/sections/UsSection";
import { UsStockView } from "@/components/us/UsStockView";
import { UsIndicatorSection } from "@/components/us/UsIndicatorSection";

const VIEWS = [
  { key: "market", label: "시장" },
  { key: "indicator", label: "지표" },
  { key: "stock", label: "종목" },
] as const;

type View = (typeof VIEWS)[number]["key"];

export function UsView() {
  const [view, setView] = useState<View>("market");
  const [picked, setPicked] = useState<string | undefined>();

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
      {view === "market" ? (
        <UsSection
          onPick={(s) => {
            setPicked(s);
            setView("stock");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : view === "indicator" ? (
        <UsIndicatorSection />
      ) : (
        <UsStockView initialSymbol={picked} />
      )}
    </>
  );
}
