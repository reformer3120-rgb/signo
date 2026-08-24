import { NextResponse } from "next/server";
import { ownThemeDetail, themeMeta } from "@/lib/ownTheme";

export const revalidate = 0;
export const maxDuration = 60;

/** [no] 는 자체 분류의 테마 id 다 (예: batt-cathode). 예전 네이버 번호와 다르다. */
export async function GET(_req: Request, ctx: { params: Promise<{ no: string }> }) {
  const { no } = await ctx.params;
  if (!/^[a-z0-9-]{2,40}$/.test(no)) {
    return NextResponse.json({ error: "테마 이름이 올바르지 않다" }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await ownThemeDetail(no), meta: themeMeta() });
  } catch (e) {
    // 없는 테마와 수집 실패를 가른다. 앞은 다시 불러도 소용없고, 뒤는 소용있다.
    const notFound = String(e).includes("테마 없음");
    return NextResponse.json(
      { error: notFound ? "그런 테마가 없다" : String(e) },
      { status: notFound ? 404 : 502 },
    );
  }
}
