import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import {
  sectorStocks,
  broadSectorStocks,
  withPeriodReturn,
  SECTOR_PERIODS,
  type SectorPeriod,
} from "@/lib/naverApi";
import { usSectorStocks } from "@/lib/us";

export const revalidate = 0;
export const maxDuration = 30;

// 섹터 강약에서 마우스를 올렸을 때 보여줄 구성종목
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const market = sp.get("market") === "us" ? "us" : "kr";
  const code = (sp.get("code") ?? "").trim();
  if (!code) return NextResponse.json({ data: [] });
  try {
    // 대분류는 네이버 업종 코드가 없어 이름으로 온다 (예: 정보기술)
    const broad = sp.get("group") === "broad";
    // 섹터를 어느 기간으로 보고 있느냐에 맞춰 종목 수익률도 같은 기간으로
    const p = sp.get("period") ?? "1d";
    const days = SECTOR_PERIODS[p as SectorPeriod] ?? 1;

    const base =
      market === "us"
        ? await cached(`sec:us:${code}`, 120, () => usSectorStocks(code))
        : broad
          ? await cached(`secBroad:kr:${code}`, 600, () => broadSectorStocks(code))
          : await cached(`sec2:kr:${code}`, 120, () => sectorStocks(code.replace(/\D/g, "")));

    // 미국은 기간 수익률 계산을 아직 붙이지 않았다 (일봉 출처가 다르다)
    const data =
      market === "us" || days <= 1
        ? base
        : await cached(`secRet:kr:${broad ? "b" : "d"}:${code}:${p}`, 600, () =>
            withPeriodReturn(base, days),
          );

    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e), data: [] }, { status: 502 });
  }
}
