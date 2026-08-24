import { NextResponse } from "next/server";
import { themeList } from "@/lib/theme";

export const revalidate = 0;
// 목록은 10페이지를 훑는다
export const maxDuration = 30;

export async function GET() {
  try {
    return NextResponse.json({ data: await themeList() });
  } catch (e) {
    return NextResponse.json({ error: String(e), data: [] }, { status: 502 });
  }
}
