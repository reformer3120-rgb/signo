import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { futures } from "@/lib/naverApi";
import { daily } from "@/lib/naver";

export const revalidate = 0;

export async function GET() {
  try {
    const [quote, candles] = await Promise.all([
      cached("futures", 30, futures),
      cached("futures-chart", 300, () => daily("FUT", 120)),
    ]);
    return NextResponse.json({ quote, candles });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
