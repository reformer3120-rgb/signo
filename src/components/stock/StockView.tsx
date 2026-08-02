"use client";
import { useState } from "react";
import { StockSection } from "@/components/sections/StockSection";
import { StockDetailCard } from "@/components/stock/StockDetailCard";
import { FinancialsCard } from "@/components/stock/FinancialsCard";
import { SectorRankCard } from "@/components/stock/SectorRankCard";
import { NewsCard } from "@/components/stock/NewsCard";

export function StockView() {
  const [code, setCode] = useState("005930");
  return (
    <>
      <StockSection onCode={(c) => setCode(c)} />
      <StockDetailCard code={code} />
      <FinancialsCard code={code} />
      <SectorRankCard code={code} />
      <NewsCard code={code} />
    </>
  );
}
