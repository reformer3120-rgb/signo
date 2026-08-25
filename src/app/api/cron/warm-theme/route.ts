import { NextResponse } from "next/server";
import { warmOwnThemes } from "@/lib/ownTheme";

export const revalidate = 0;
// 종목 1,700여 개의 시세와 상장주식수를 미리 받는다
export const maxDuration = 300;

/**
 * 테마 화면을 미리 데운다.
 *
 * 캐시가 비면 첫 사람이 20초를 기다린다. 장 열리기 전과 장중 몇 번 데워 두면
 * 그 기다림이 없다. 상장주식수는 배포를 넘어 살아남으므로 한 번 채우면 오래 간다.
 */
export async function GET() {
  const t0 = Date.now();
  try {
    const r = await warmOwnThemes();
    return NextResponse.json({ ok: true, ms: Date.now() - t0, ...r });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
