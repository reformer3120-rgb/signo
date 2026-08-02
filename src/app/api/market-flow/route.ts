import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { hasKIS, foreignInstitution } from "@/lib/kis";

export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!hasKIS()) return NextResponse.json({ needKey: true, data: [] });
  const { searchParams } = new URL(req.url);
  const m = searchParams.get("market");
  const market = m === "KOSPI" || m === "KOSDAQ" ? m : "ALL";
  try {
    const data = await cached(`market-flow3:${market}`, 120, () => foreignInstitution(market));
    return NextResponse.json({ market, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
