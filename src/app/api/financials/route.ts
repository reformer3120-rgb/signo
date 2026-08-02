import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { financials } from "@/lib/naverApi";
export const revalidate = 0;
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = (sp.get("code") || "005930").replace(/\D/g, "");
  const period = sp.get("period") === "quarter" ? "quarter" : "annual";
  try {
    return NextResponse.json({
      data: await cached(`fin:${period}:${code}`, 3600, () => financials(code, period)),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
