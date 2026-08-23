import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { sectorStocks, broadSectorStocks } from "@/lib/naverApi";
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
    // 대분류는 네이버 업종 코드가 없어 이름으로 온다 (예: 정보기술)
    const broad = sp.get("group") === "broad";
    const data =
      market === "us"
        ? await cached(`sec:us:${code}`, 120, () => usSectorStocks(code))
        : broad
          ? await cached(`secBroad:kr:${code}`, 600, () => broadSectorStocks(code))
          : await cached(`sec2:kr:${code}`, 120, () => sectorStocks(code.replace(/\D/g, "")));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e), data: [] }, { status: 502 });
  }
}
