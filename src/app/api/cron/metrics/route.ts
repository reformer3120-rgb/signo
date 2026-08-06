import { NextResponse } from "next/server";
import { collectMetrics } from "@/lib/naverApi";

export const revalidate = 0;
export const maxDuration = 60;

/**
 * 하루 한 번 종합평가용 지표를 미리 모아 둔다.
 *
 * 평가는 직전 정규장 종가 기준이라 하루 한 번만 만들면 그날 내내 그대로 쓴다.
 * 이걸 해 두면 화면에서는 계산만 하므로 목록에 등급을 붙여도 느려지지 않는다.
 *
 * 한 번에 다 못 채우면 다음 실행에서 이어간다 (지표 보관 기간 3일).
 * Vercel 크론이 부르지만 주소를 알면 손으로도 부를 수 있다.
 */
export async function GET() {
  try {
    const r = await collectMetrics(50_000);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
