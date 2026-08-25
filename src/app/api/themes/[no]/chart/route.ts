import { NextResponse } from "next/server";
import { ownThemeChart } from "@/lib/ownTheme";

export const revalidate = 0;
// 시총 상위 20종목의 일봉을 받는다
export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ no: string }> }) {
  const { no } = await ctx.params;
  if (!/^[a-z0-9-]{2,40}$/.test(no)) {
    return NextResponse.json({ error: "테마 이름이 올바르지 않다" }, { status: 400 });
  }
  const days = Math.min(250, Math.max(20, Number(new URL(req.url).searchParams.get("days")) || 60));
  try {
    return NextResponse.json({ data: await ownThemeChart(no, days), days });
  } catch (e) {
    const notFound = String(e).includes("테마 없음");
    return NextResponse.json(
      { error: notFound ? "그런 테마가 없다" : String(e), data: [] },
      { status: notFound ? 404 : 502 },
    );
  }
}
