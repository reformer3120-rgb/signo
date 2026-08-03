"use client";
import { useRef } from "react";
import { StockSearch } from "@/components/StockSearch";
import { usePublishHeight } from "@/lib/useStickyOffset";
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
  const ref = useRef<HTMLDivElement>(null);
  // 카드 안 시세줄이 이 바 바로 아래에 붙도록 높이를 알린다
  usePublishHeight(ref, "--stockbar-h", 6);

  return (
    <div
      ref={ref}
      style={{ top: "calc(var(--nav-bottom, 90px) + 4px)" }}
      className="sticky z-20 flex w-fit items-center gap-2"
    >
      <StockSearch onSelect={onSelect} />
      <WatchButton item={{ code, name, market: "KR" }} />
    </div>
  );
}
