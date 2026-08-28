import { NextResponse } from "next/server";
import { dailySignals } from "@/lib/ownTheme";

// 직전 정규장 종가로 판정한 값이라 자주 바뀌지 않는다. lib 쪽에서 30분 캐시한다.
export const revalidate = 0;

/**
 * 오늘의 이평선 신호 — 추세가 뒷받침하는 크로스만.
 * 종목만 늘어놓지 않고 테마를 붙인다. 한 테마에 몰렸는지가 값어치 있는 자리다.
 */
export async function GET() {
  try {
    return NextResponse.json({ data: await dailySignals() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
