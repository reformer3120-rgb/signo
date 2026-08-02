import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockList, type Market, type NStock } from "@/lib/naverApi";
import { hasKIS, unifiedQuotes } from "@/lib/kis";

export const revalidate = 0;
export const maxDuration = 60;

const MAX = 100; // 네이버 pageSize 상한

/** 시총 상위 목록에 통합(KRX+NXT) 시세를 반영 (멀티종목 조회 1회당 30종목) */
async function marketCap(market: Market, limit: number): Promise<NStock[]> {
  const rows = await stockList("marketValue", market, limit);
  if (!hasKIS()) return rows;
  const quotes = await unifiedQuotes(rows.map((s) => s.code));
  for (const s of rows) {
    const u = quotes.get(s.code);
    if (!u || u.price <= 0) continue;
    s.price = u.price;
    s.changePct = u.changePct;
    if (u.prevClose > 0) s.change = u.price - u.prevClose;
  }
  return rows;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI") as Market;
  const limit = Math.min(MAX, Math.max(20, Number(searchParams.get("limit")) || 20));
  try {
    const data = await cached(`marketcap-un3:${market}:${limit}`, 60, () => marketCap(market, limit));
    return NextResponse.json({ market, limit, hasMore: limit < MAX, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
