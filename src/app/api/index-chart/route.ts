import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { indexChart } from "@/lib/yahoo";

export const revalidate = 0;

const MAP: Record<string, string> = { KOSPI: "^KS11", KOSDAQ: "^KQ11" };
const KINDS = new Set(["1m", "5m", "15m", "30m", "60m", "1D", "1W", "1M", "1Y"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const kind = KINDS.has(searchParams.get("kind") || "") ? searchParams.get("kind")! : "1D";
  const ttl = kind.endsWith("m") ? 60 : 600;
  try {
    const data = await cached(`index-chart:${market}:${kind}`, ttl, () => indexChart(MAP[market], kind));
    return NextResponse.json({ market, kind, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
