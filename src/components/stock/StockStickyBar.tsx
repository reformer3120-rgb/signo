"use client";
import { StockSearch } from "@/components/StockSearch";
import { WatchButton } from "@/components/WatchButton";

/** 종목 탭 아래 고정되는 검색 바 (검색창만). 시세는 차트 박스 안에 표시. */
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
      <StockSearch onSelect={onSelect} />
    </div>
  );
}
