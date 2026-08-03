"use client";
import { useState } from "react";
import { useSticky } from "@/lib/useSticky";
import { StockSection } from "@/components/sections/StockSection";
import { StockStickyBar } from "@/components/stock/StockStickyBar";
import { StockDetailCard } from "@/components/stock/StockDetailCard";
import { FinancialsCard } from "@/components/stock/FinancialsCard";
import { SectorRankCard } from "@/components/stock/SectorRankCard";
import { NewsCard } from "@/components/stock/NewsCard";
import type { Interval } from "@/lib/types";

export function StockView({
  initialCode,
  initialName,
}: {
  initialCode?: string;
  initialName?: string;
} = {}) {
  const [code, setCode] = useState(initialCode ?? "005930");
  const [name, setName] = useState(initialName ?? (initialCode ? initialCode : "삼성전자"));
  const [tab, setTab] = useSticky("kr.stock.tab", "1D");
  const [minUnit, setMinUnit] = useSticky<Interval>("kr.stock.min", "5");

  const select = (c: string, n: string) => {
    setCode(c);
    setName(n);
  };
  const selectFromSector = (c: string, n: string) => {
    select(c, n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <StockStickyBar onSelect={select} />
      <StockSection
        code={code}
        name={name}
        tab={tab}
        minUnit={minUnit}
        onTab={setTab}
        onMinUnit={setMinUnit}
      />
      <StockDetailCard code={code} />
      <FinancialsCard code={code} />
      <SectorRankCard code={code} onSelect={selectFromSector} />
      <NewsCard code={code} />
    </>
  );
}
