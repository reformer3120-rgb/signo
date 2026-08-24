import { NextResponse } from "next/server";
import { ownThemeList, themeMeta } from "@/lib/ownTheme";

export const revalidate = 0;
// 편입 종목 전체 시세를 KIS 멀티조회로 받는다 (30종목씩 90번쯤)
export const maxDuration = 60;

export async function GET() {
  try {
    const { rows, stale } = await ownThemeList();
    return NextResponse.json({ data: rows, stale, meta: themeMeta() });
  } catch (e) {
    return NextResponse.json({ error: String(e), data: [] }, { status: 502 });
  }
}
