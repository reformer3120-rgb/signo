import { NextResponse } from "next/server";
import { upperDetail } from "@/lib/upperTheme";

export const revalidate = 0;
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^u\d{2}$/.test(id)) {
    return NextResponse.json({ error: "테마 이름이 올바르지 않다" }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await upperDetail(id) });
  } catch (e) {
    const notFound = String(e).includes("없음");
    return NextResponse.json(
      { error: notFound ? "그런 테마가 없다" : String(e) },
      { status: notFound ? 404 : 502 },
    );
  }
}
