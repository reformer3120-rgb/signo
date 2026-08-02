"use client";
import { StockSearch } from "@/components/StockSearch";

/** 종목 탭 아래 고정되는 검색 바 (검색창만). */
export function StockStickyBar({
  code,
  name,
  onSelect,
}: {
  code: string;
  name: string;
  onSelect: (code: string, name: string) => void;
}) {
  return (
    <div className="sticky top-[3.4rem] z-20 w-fit">
      <StockSearch current={`${name} · ${code}`} onSelect={onSelect} />
    </div>
  );
}
