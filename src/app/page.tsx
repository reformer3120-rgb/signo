import { SignoHeader } from "@/components/SignoHeader";
import { IndexSection } from "@/components/sections/IndexSection";
import { MarketSection } from "@/components/sections/MarketSection";
import { StockSection } from "@/components/sections/StockSection";
import { MarketCapSection } from "@/components/sections/MarketCapSection";
import { MoversSection } from "@/components/sections/MoversSection";
import { SectorSection } from "@/components/sections/SectorSection";
import { MarketFlowSection } from "@/components/sections/MarketFlowSection";
import { RatesSection } from "@/components/sections/RatesSection";
import { Card } from "@/components/Card";

const PENDING = [
  "옵션 (풋/콜)",
  "주변자금 · 고객예탁금 (네이버 그래프 파싱)",
  "장내 특이점 (사이드카·서킷브레이커)",
  "다음 거래일 · 휴장일 캘린더",
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 flex flex-col gap-4">
      <SignoHeader />
      <IndexSection />
      <StockSection />
      <MarketSection />
      <RatesSection />
      <MarketFlowSection />
      <SectorSection />
      <MarketCapSection />
      <MoversSection />
      <Card title="다음 단계 (예정 섹션)" right={<span className="text-xs text-muted">KIS · Claude 연동 시</span>}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
      <footer className="py-4 text-center text-xs text-muted">
        SIGNO · KRX 마켓 대시보드 · 데이터: Yahoo Finance · 네이버 금융 (폴백 모드)
      </footer>
    </main>
  );
}
