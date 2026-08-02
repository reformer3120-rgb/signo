import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { financials } from "@/lib/naverApi";
export const revalidate = 0;
export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "005930").replace(/\D/g, "");
  try { return NextResponse.json({ data: await cached(`fin:${code}`, 3600, () => financials(code)) }); }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 502 }); }
}
