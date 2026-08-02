import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockList, highLow, type Market, type Category } from "@/lib/naverApi";
import { hasKIS, fluctuationRank } from "@/lib/kis";

export const revalidate = 0;
export const maxDuration = 60;

// ETF 브랜드로 시작 = ETF, + 파생 키워드(ETN 등) 제외 → 개별종목만
const ETF_BRAND =
  /^(KODEX|TIGER|KBSTAR|KOSEF|ARIRANG|HANARO|RISE|SOL|ACE|PLUS|KINDEX|TIMEFOLIO|TREX|FOCUS|KIWOOM|WOORI|1Q|HK|BNK|WON|히어로즈|마이티|파워)\s/i;
const KW = /레버리지|인버스|2X|3X|곱버스|ETN|ETF|선물|국고채|커버드콜|합성|리츠|액티브|금리/i;
const onlyStocks = <T extends { name: string }>(rows: T[]) =>
  rows.filter((s) => !KW.test(s.name) && !ETF_BRAND.test(s.name));

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI") as Market;
  const dirRaw = searchParams.get("dir") ?? "up";
  const nxt = searchParams.get("exchange") === "NXT";
  try {
    // NXT(넥스트레이드) 기준 등락률 — KIS 등락률순위 TR (통합은 미지원)
    if (nxt && (dirRaw === "up" || dirRaw === "down")) {
      if (!hasKIS()) return NextResponse.json({ market, dir: dirRaw, needKey: true, data: [] });
      const raw = await cached(`nxtrank:${market}:${dirRaw}`, 60, () =>
        fluctuationRank("NX", market, dirRaw as "up" | "down"),
      );
      const data = onlyStocks(raw)
        .slice(0, 20)
        .map((r) => ({ ...r, tradingValue: "", marketCap: "", change: 0 }));
      return NextResponse.json({ market, dir: dirRaw, exchange: "NXT", data });
    }
    if (dirRaw === "high" || dirRaw === "low") {
      const raw = await cached(`highlow2:${market}:${dirRaw}`, 600, () =>
        highLow(market, dirRaw as "high" | "low"),
      );
      return NextResponse.json({ market, dir: dirRaw, data: onlyStocks(raw).slice(0, 20) });
    }
    const dir = (dirRaw === "down" ? "down" : "up") as Category;
    const raw = await cached(`movers:${market}:${dir}`, 60, () => stockList(dir, market, 100));
    return NextResponse.json({ market, dir, data: onlyStocks(raw).slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
