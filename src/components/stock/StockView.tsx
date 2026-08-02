"use client";
import { useState } from "react";
import { StockSection } from "@/components/sections/StockSection";
import { StockDetailCard } from "@/components/stock/StockDetailCard";
import { FinancialsCard } from "@/components/stock/FinancialsCard";
import { SectorRankCard } from "@/components/stock/SectorRankCard";
import { NewsCard } from "@/components/stock/NewsCard";

export function StockView() {
  const [code, setCode] = useState("005930");
  const [name, setName] = useState("삼성전자");
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
      <StockSection code={code} name={name} onCode={select} />
      <StockDetailCard code={code} />
      <FinancialsCard code={code} />
      <SectorRankCard code={code} onSelect={selectFromSector} />
      <NewsCard code={code} />
    </>
  );
}
