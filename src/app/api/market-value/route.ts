import { NextResponse } from "next/server";
import { marketValue } from "@/lib/marketValue";

export const revalidate = 0;
export const maxDuration = 30;

/**
 * 코스피·코스닥 PER·PBR — SIGNO 가 직접 센 것.
 *
 * 지수 PER/PBR 을 그냥 주는 무료 출처가 없어서 우리가 센다. 재무는 굳혀 둔
 * 표(src/data/valuation.json)에서, 시가총액은 지표 크론이 Redis 에 넣어 둔
 * 것에서 가져와 합친다 — 새로 두드리는 곳이 없다.
 *
 * 몇 종목으로 셌는지(`종목`)를 같이 준다. 크론이 아직 안 훑은 종목은 빠지므로
 * 화면이 그 수를 밝혀야 한다.
 */
export async function GET() {
  try {
    return NextResponse.json({ data: await marketValue() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
