import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import {
  usIndices,
  usSectors,
  usMovers,
  usMarketCap,
  usMarketIndicators,
  type UsMoverKind,
} from "@/lib/us";

export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const part = sp.get("part") ?? "overview";
  try {
    if (part === "movers") {
      const k = sp.get("kind");
      const kind: UsMoverKind = k === "losers" || k === "actives" ? k : "gainers";
      const data = await cached(`us:movers:${kind}`, 60, () => usMovers(kind, 20));
      return NextResponse.json({ kind, data });
    }
    if (part === "marketcap") {
      const limit = Math.min(50, Math.max(20, Number(sp.get("limit")) || 20));
      const data = await cached(`us:cap:${limit}`, 60, () => usMarketCap(limit));
      return NextResponse.json({ limit, hasMore: limit < 50, data });
    }
    if (part === "indicators") {
      const data = await cached("us:indicators", 60, usMarketIndicators);
      return NextResponse.json({ data });
    }
    const [indices, sectors] = await Promise.all([
      cached("us:indices", 60, usIndices),
      cached("us:sectors", 60, usSectors),
    ]);
    return NextResponse.json({ indices, sectors });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
