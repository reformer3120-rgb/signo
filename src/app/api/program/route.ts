import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { hasKIS, programTrade } from "@/lib/kis";

export const revalidate = 0;

export async function GET(req: Request) {
  if (!hasKIS()) return NextResponse.json({ needKey: true, data: [] });
  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  try {
    const data = await cached(`program:${market}`, 60, () => programTrade(market));
    return NextResponse.json({ market, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
