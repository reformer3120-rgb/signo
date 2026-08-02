import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockDetail, stockReturns, investorBias } from "@/lib/naverApi";
export const revalidate = 0;
export const maxDuration = 30;
export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "005930").replace(/\D/g, "");
  try {
    const data = await cached(`detail2:${code}`, 60, async () => {
      const [detail, returns, bias] = await Promise.all([
        stockDetail(code),
        stockReturns(code).catch(() => null),
        investorBias(code, 5).catch(() => null),
      ]);
      return { detail, returns, bias };
    });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
