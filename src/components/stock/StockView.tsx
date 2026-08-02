"use client";
import { useState } from "react";
import { StockSection } from "@/components/sections/StockSection";
import { StockStickyBar } from "@/components/stock/StockStickyBar";
import { StockDetailCard } from "@/components/stock/StockDetailCard";
import { FinancialsCard } from "@/components/stock/FinancialsCard";
import { SectorRankCard } from "@/components/stock/SectorRankCard";
import { NewsCard } from "@/components/stock/NewsCard";
import type { Interval } from "@/lib/types";

export function StockView() {
  const [code, setCode] = useState("005930");
  const [name, setName] = useState("삼성전자");
  const [tab, setTab] = useState("1D");
  const [minUnit, setMinUnit] = useState<Interval>("5");
  const interval: Interval = tab === "min" ? minUnit : (tab as Interval);

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
      <StockStickyBar code={code} name={name} interval={interval} onSelect={select} />
      <StockSection
        code={code}
        name={name}
        tab={tab}
        minUnit={minUnit}
        onCode={select}
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
