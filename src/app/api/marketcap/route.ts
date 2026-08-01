import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockList, type Market } from "@/lib/naverApi";

export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI") as Market;
  try {
    const data = await cached(`marketcap:${market}`, 60, () => stockList("marketValue", market, 20));
    return NextResponse.json({ market, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
