import { NextResponse } from "next/server";
import { themeDetail } from "@/lib/theme";

export const revalidate = 0;
export const maxDuration = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ no: string }> }) {
  const { no } = await ctx.params;
  if (!/^\d+$/.test(no)) {
    return NextResponse.json({ error: "테마 번호가 올바르지 않다" }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await themeDetail(no) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
