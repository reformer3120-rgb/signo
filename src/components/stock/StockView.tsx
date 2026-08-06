"use client";
import { useEffect, useState } from "react";
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
  // 마지막으로 본 종목을 기억한다 — 다른 화면에 갔다 돌아와도 그대로.
  // 주소로 종목을 지정해 들어온 경우(대시보드에서 클릭 등)에는 그쪽이 우선.
  const [last, setLast] = useSticky("kr.stock.last", { code: "005930", name: "삼성전자" });
  const [picked, setPicked] = useState<{ code: string; name: string } | null>(
    initialCode ? { code: initialCode, name: initialName ?? initialCode } : null,
  );
  const code = picked?.code ?? last.code;
  const name = picked?.name ?? last.name;
  const [tab, setTab] = useSticky("kr.stock.tab", "1D");
  const [minUnit, setMinUnit] = useSticky<Interval>("kr.stock.min", "5");

  const select = (c: string, n: string) => {
    setPicked({ code: c, name: n });
    setLast({ code: c, name: n });
  };
  useEffect(() => {
    if (initialCode) setLast({ code: initialCode, name: initialName ?? initialCode });
    // 진입 시 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, initialName]);

  const selectFromSector = (c: string, n: string) => {
    select(c, n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <StockStickyBar code={code} name={name} onSelect={select} />
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
