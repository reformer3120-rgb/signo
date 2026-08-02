import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockDetail } from "@/lib/naverApi";
export const revalidate = 0;
export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "005930").replace(/\D/g, "");
  try { return NextResponse.json({ data: await cached(`detail:${code}`, 60, () => stockDetail(code)) }); }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 502 }); }
}
