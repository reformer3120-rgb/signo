import { IndexSection } from "@/components/sections/IndexSection";
import { MarketSection } from "@/components/sections/MarketSection";
import { RatesSection } from "@/components/sections/RatesSection";
import { MarketFlowSection } from "@/components/sections/MarketFlowSection";
import { SectorSection } from "@/components/sections/SectorSection";
import { MarketCapSection } from "@/components/sections/MarketCapSection";
import { MoversSection } from "@/components/sections/MoversSection";
import { Card } from "@/components/Card";

const PENDING = [
  "코스닥 선물",
  "주변자금 · 고객예탁금",
  "장내 특이점 (사이드카·서킷브레이커)",
  "다음 거래일 · 휴장일",
  "AI 브리핑",
];

export default function Home() {
  return (
    <>
      <IndexSection />
      <MarketSection />
      <RatesSection />
      <MarketFlowSection />
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
