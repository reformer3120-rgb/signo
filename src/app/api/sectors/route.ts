import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { sectors, sectorStrengthAll, type SectorPeriod, type SectorMove } from "@/lib/naverApi";

export const revalidate = 0;
// 전 종목(2,800여 개) 일봉을 받아 계산한다
export const maxDuration = 60;

const PERIODS = ["1d", "1w", "1m"] as const;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get("period");
  const period: SectorPeriod = (PERIODS as readonly string[]).includes(p ?? "")
    ? (p as SectorPeriod)
    : "1d";
  const broad = searchParams.get("group") === "broad";

  try {
    // 당일·세부는 네이버 공식값 그대로라 일봉이 필요 없다 — 즉시 응답
    if (!broad && period === "1d") {
      const data = await cached<SectorMove[]>("sectorStrength:1d:detail", 60, async () =>
        (await sectors()).map((s) => ({
          key: s.code,
          name: s.name,
          changeRate: s.changeRate,
          used: s.count,
        })),
      );
      return NextResponse.json({ data, period, broad });
    }

    // 나머지는 세 기간·두 묶음을 한 덩어리로 캐시한다.
    // 기간마다 따로 캐시하면 탭을 옮길 때마다 2,800종목 일봉을 다시 받는다.
    const all = await cached("sectorStrength:all", 600, sectorStrengthAll);
    const data = broad ? all[period].broad : all[period].detail;
    return NextResponse.json({ data, period, broad });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
