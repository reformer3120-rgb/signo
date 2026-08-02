import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockList, type Market, type NStock } from "@/lib/naverApi";
import { hasKIS, unifiedQuote } from "@/lib/kis";

export const revalidate = 0;
export const maxDuration = 60;

const MAX = 100; // 네이버 pageSize 상한

/** 시총 상위 목록에 통합(KRX+NXT) 시세를 반영 */
async function marketCap(market: Market, limit: number): Promise<NStock[]> {
  const rows = await stockList("marketValue", market, limit);
  if (!hasKIS()) return rows;
  // KIS 초당 호출제한(약 20건/초)에 맞춰 8개씩 400ms 간격
  for (let i = 0; i < rows.length; i += 8) {
    await Promise.all(
      rows.slice(i, i + 8).map(async (s) => {
        // 전일 종가 (네이버: 현재가 - 전일대비)
        const prevClose = s.price - s.change;
        try {
          const u = await unifiedQuote(s.code);
          if (u.price > 0) {
            s.price = u.price;
            // KIS 통합 등락률은 시간외에 '정규장 종가 대비'로 나오므로 전일 종가 기준으로 재계산
            s.changePct =
              prevClose > 0
                ? +(((u.price - prevClose) / prevClose) * 100).toFixed(2)
                : u.changePct;
            s.change = prevClose > 0 ? u.price - prevClose : s.change;
          }
        } catch {
          /* 통합 시세 실패 시 KRX 값 유지 */
        }
      }),
    );
    await new Promise((r) => setTimeout(r, 400));
  }
  return rows;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI") as Market;
  const limit = Math.min(MAX, Math.max(20, Number(searchParams.get("limit")) || 20));
  try {
    const data = await cached(`marketcap-un2:${market}:${limit}`, 60, () => marketCap(market, limit));
    return NextResponse.json({ market, limit, hasMore: limit < MAX, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
