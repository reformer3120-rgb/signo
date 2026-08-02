import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { sectorRank } from "@/lib/naverApi";
export const revalidate = 0;
export const maxDuration = 60;
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = (sp.get("code") || "005930").replace(/\D/g, "");
  const raw = sp.get("group") || "industry";
  // "industry" 또는 "theme:<숫자>"만 허용
  const group = /^theme:\d+$/.test(raw) ? raw : "industry";
  try {
    return NextResponse.json({
      data: await cached(`sector7:${group}:${code}`, 900, () => sectorRank(code, group)),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
