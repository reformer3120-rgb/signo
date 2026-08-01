import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockList, type Market, type Category } from "@/lib/naverApi";

export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI") as Market;
  const dir = (searchParams.get("dir") === "down" ? "down" : "up") as Category;
  // ETF 브랜드로 시작 = ETF, + 파생 키워드(ETN 등) 제외 → 개별종목만
  const ETF_BRAND =
    /^(KODEX|TIGER|KBSTAR|KOSEF|ARIRANG|HANARO|RISE|SOL|ACE|PLUS|KINDEX|TIMEFOLIO|TREX|FOCUS|KIWOOM|WOORI|1Q|HK|BNK|WON|히어로즈|마이티|파워)\s/i;
  const KW = /레버리지|인버스|2X|3X|곱버스|ETN|ETF|선물|국고채|커버드콜|합성|리츠/i;
  try {
    const raw = await cached(`movers:${market}:${dir}`, 60, () => stockList(dir, market, 100));
    const data = raw.filter((s) => !KW.test(s.name) && !ETF_BRAND.test(s.name)).slice(0, 20);
    return NextResponse.json({ market, dir, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
