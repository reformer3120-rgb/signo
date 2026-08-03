import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { hasKIS, stockInvestorEstimate } from "@/lib/kis";

export const revalidate = 0;

export async function GET(req: Request) {
  if (!hasKIS()) return NextResponse.json({ needKey: true, data: [] });
  const code = (new URL(req.url).searchParams.get("code") || "005930").replace(/\D/g, "");
  try {
    // 장중 추정치라 짧게 캐시
    const data = await cached(`investest:${code}`, 30, () => stockInvestorEstimate(code));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
