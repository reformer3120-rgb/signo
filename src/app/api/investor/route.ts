import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { hasKIS, stockInvestor } from "@/lib/kis";

export const revalidate = 0;

export async function GET(req: Request) {
  if (!hasKIS()) {
    return NextResponse.json({ needKey: true, data: [] });
  }
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "005930").replace(/\D/g, "");
  try {
    const data = await cached(`investor:${code}`, 120, () => stockInvestor(code));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
