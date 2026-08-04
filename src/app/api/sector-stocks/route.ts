import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { sectorStocks } from "@/lib/naverApi";
import { usSectorStocks } from "@/lib/us";

export const revalidate = 0;
export const maxDuration = 30;

// 섹터 강약에서 마우스를 올렸을 때 보여줄 구성종목
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const market = sp.get("market") === "us" ? "us" : "kr";
  const code = (sp.get("code") ?? "").trim();
  if (!code) return NextResponse.json({ data: [] });
  try {
    const data =
      market === "us"
        ? await cached(`sec:us:${code}`, 120, () => usSectorStocks(code))
        : await cached(`sec:kr:${code}`, 120, () => sectorStocks(code.replace(/\D/g, "")));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e), data: [] }, { status: 502 });
  }
}
