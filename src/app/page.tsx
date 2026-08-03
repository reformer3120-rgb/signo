import { IndexSection } from "@/components/sections/IndexSection";
import { MarketFlowSection } from "@/components/sections/MarketFlowSection";
import { CloseReportButton } from "@/components/CloseReportButton";
import { SectorSection } from "@/components/sections/SectorSection";
import { MarketCapSection } from "@/components/sections/MarketCapSection";
import { MoversSection } from "@/components/sections/MoversSection";
import { DepositSection } from "@/components/sections/DepositSection";
import { Card } from "@/components/Card";

const PENDING = [
  "코스닥150 선물",
  "미수금 · 선물예수금",
  "경제 캘린더",
  "장내 특이점 (사이드카·서킷브레이커)",
  "다음 거래일 · 휴장일",
  "AI 브리핑",
];

export default function Home() {
  return (
    <>
      <CloseReportButton />
      <IndexSection />
      <MarketFlowSection />
      <DepositSection />
      <SectorSection />
      <MoversSection />
      <MarketCapSection />
      <Card title="다음 단계 (예정)">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PENDING.map((p) => (
            <li
              key={p}
              className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-signal shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
