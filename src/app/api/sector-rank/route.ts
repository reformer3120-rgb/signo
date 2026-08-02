import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { sectorRank } from "@/lib/naverApi";
export const revalidate = 0;
export const maxDuration = 60;
export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "005930").replace(/\D/g, "");
  try { return NextResponse.json({ data: await cached(`sector:${code}`, 900, () => sectorRank(code)) }); }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 502 }); }
}
