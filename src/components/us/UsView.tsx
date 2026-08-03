"use client";
import { useState } from "react";
import { UsSection } from "@/components/sections/UsSection";
import { UsStockView } from "@/components/us/UsStockView";
import { UsIndicatorSection } from "@/components/us/UsIndicatorSection";
import { UsCurrencyProvider } from "@/components/us/UsCurrency";
import { CloseReportButton } from "@/components/CloseReportButton";

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
    <UsCurrencyProvider>
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
      {view === "market" && (
        <CloseReportButton
          api="/api/us-report"
          title="미국증시 마감 리포트"
          desc="지수·섹터·특징주·시총상위·시장지표를 텍스트로 저장"
          filePrefix="signo-미국마감리포트"
        />
      )}
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
    </UsCurrencyProvider>
  );
}
