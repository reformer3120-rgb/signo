import { NextResponse } from "next/server";
import { themeIndex } from "@/lib/ownTheme";

// 정적 데이터라 오래 캐시해도 된다 (분기에 한 번 바뀐다)
export const revalidate = 3600;

/** 테마별 편입 종목 이름 — 화면이 한 번 받아 두고 종목명으로 테마를 찾는다 */
export async function GET() {
  return NextResponse.json({ data: themeIndex() });
}
