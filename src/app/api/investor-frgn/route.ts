import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockTrendLong } from "@/lib/naverApi";

export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "005930").replace(/\D/g, "");
  try {
    // 개인/외국인/기관 최대 1년치(250거래일). 여러 요청이라 30분 캐시.
    const data = await cached(`trend-long:${code}`, 1800, () => stockTrendLong(code, 250));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
