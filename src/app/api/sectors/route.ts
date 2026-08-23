import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { sectorDaily, sectorStrengthAll, type SectorPeriod, type SectorMove } from "@/lib/naverApi";
import { krSessionNow } from "@/lib/session";

export const revalidate = 0;
// 1주·1개월은 전 종목(2,800여 개) 일봉을 받아 계산한다
export const maxDuration = 60;

const PERIODS = ["1d", "1w", "1m"] as const;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get("period");
  const period: SectorPeriod = (PERIODS as readonly string[]).includes(p ?? "")
    ? (p as SectorPeriod)
    : "1d";
  const broad = searchParams.get("group") === "broad";

  // 당일은 일봉이 필요 없다. 세부든 대분류든 가볍게 끝난다.
  const daily = () =>
    cached<SectorMove[]>(`sectorDaily:${broad ? "b" : "d"}`, 60, () => sectorDaily(broad));

  try {
    if (period === "1d") {
      return NextResponse.json({ data: await daily(), period, broad });
    }

    // 1주·1개월은 세 기간·두 묶음을 한 덩어리로 캐시한다.
    // 기간마다 따로 캐시하면 탭을 옮길 때마다 2,800종목 일봉을 다시 받는다.
    //
    // 장이 열려 있을 때만 값이 움직인다. 마감 뒤에는 다음 개장까지 그대로다.
    const live = krSessionNow() !== "장마감";
    const all = await cached("sectorStrength:all", live ? 600 : 7200, sectorStrengthAll);
    const data = broad ? all[period].broad : all[period].detail;
    return NextResponse.json({ data, period, broad });
  } catch (e) {
    // 무거운 계산이 실패해도 카드가 비지 않게 당일 값이라도 내려준다.
    // 기간이 어긋난 값을 조용히 내보내면 안 되므로 fallback 을 함께 알린다.
    try {
      return NextResponse.json({ data: await daily(), period: "1d", broad, fallback: true });
    } catch {
      return NextResponse.json({ error: String(e), data: [] }, { status: 502 });
    }
  }
}
