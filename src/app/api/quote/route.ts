import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { quote } from "@/lib/naver";
import { hasKIS, stockPrice, type Exchange } from "@/lib/kis";
import type { Quote } from "@/lib/types";

export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "005930").replace(/\D/g, "");
  const name = searchParams.get("name") || code;
  const ex = searchParams.get("exchange"); // KRX(기본) | NXT | UN
  const exchange: Exchange | null = ex === "NXT" ? "NX" : ex === "UN" ? "UN" : null;

  try {
    // KRX 외 거래소는 KIS 시세 사용 (네이버는 KRX만 제공)
    if (exchange && hasKIS()) {
      const data = await cached<Quote>(`quote:${exchange}:${code}`, 30, async () => {
        const u = await stockPrice(code, exchange);
        // KRX 일봉에서 전일 종가를 얻어 '전일 대비'로 통일
        const base = await quote(code, name).catch(() => null);
        const prevClose = base ? base.price - base.change : 0;
        const change = prevClose > 0 ? u.price - prevClose : 0;
        return {
          symbol: code,
          name,
          price: u.price,
          change,
          changePct: prevClose > 0 ? (change / prevClose) * 100 : u.changePct,
          volume: u.volume,
          currency: "KRW",
        };
      });
      return NextResponse.json({ data, exchange: ex });
    }
    const data = await cached(`quote:${code}`, 60, () => quote(code, name));
    return NextResponse.json({ data, exchange: "KRX" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
