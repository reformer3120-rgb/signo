import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { marketBaseline, scoresFor } from "@/lib/baseline";
import { baselineUniverse } from "@/lib/naverApi";

export const revalidate = 0;
export const maxDuration = 30;

/**
 * 여러 종목의 종합평가 점수를 한 번에.
 * 이미 모아 둔 지표로 계산만 하므로 외부 조회가 없다. 아직 지표가 없는 종목은
 * 빠진 채로 온다 — 화면은 등급 없이 이름만 보여주면 된다.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("codes") ?? "";
  const codes = raw
    .split(",")
    .map((c) => c.trim().replace(/\D/g, ""))
    .filter((c) => /^\d{6}$/.test(c))
    .slice(0, 60);
  if (!codes.length) return NextResponse.json({ scores: {} });
  try {
    const key = `grades:${codes.slice().sort().join(",")}`;
    const scores = await cached(key, 300, async () => {
      const base = await marketBaseline(await baselineUniverse());
      return scoresFor(codes, base);
    });
    return NextResponse.json({ scores });
  } catch (e) {
    return NextResponse.json({ error: String(e), scores: {} }, { status: 502 });
  }
}
