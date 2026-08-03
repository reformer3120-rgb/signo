import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { economicCalendarAll } from "@/lib/calendar";

export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  try {
    // finviz는 응답 건수에 상한이 있어 범위를 넓히면 과거만 채워져 온다 → 짧게 조회
    const data = await cached("econcal:v6", 600, economicCalendarAll);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
