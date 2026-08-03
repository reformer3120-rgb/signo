import { UsIndicatorSection } from "@/components/us/UsIndicatorSection";
import { RatesSection } from "@/components/sections/RatesSection";

// 한국 시장지표와 같은 순서 — 지표 묶음이 먼저, 국채 금리가 그 아래
export default function UsMarketPage() {
  return (
    <>
      <UsIndicatorSection />
      <RatesSection />
    </>
  );
}
