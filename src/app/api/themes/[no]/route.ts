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
    // 없는 번호와 수집 실패를 가른다. 앞은 다시 불러도 소용없고, 뒤는 소용있다.
    const notFound = String(e).includes("테마 없음");
    return NextResponse.json(
      { error: notFound ? "그런 테마가 없다" : String(e) },
      { status: notFound ? 404 : 502 },
    );
  }
}
