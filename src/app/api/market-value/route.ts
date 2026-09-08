import { NextResponse } from "next/server";
import { marketValue } from "@/lib/marketValue";

export const revalidate = 0;
export const maxDuration = 60;

/**
 * 코스피·코스닥 PER·PBR — SIGNO 가 직접 센 것.
 *
 * 지수 PER/PBR 을 그냥 주는 무료 출처가 없어서 우리가 센다. 재무는 굳혀 둔
 * 표(src/data/valuation.json)에서, 시가총액은 지표 크론이 Redis 에 넣어 둔
 * 것에서 가져와 합친다 — 새로 두드리는 곳이 없다.
 *
 * PER 이 셋인 이유는 잣대가 다르기 때문이다. 골라 쓰라고 셋을 다 준다.
 *
 *   per      DART 사업보고서(직전 연간) · 전 종목 · 흑자기업만
 *   후행per   최근 4분기(TTM) · 시총 상위 150 · 같은 표본
 *   선행per   애널리스트 컨센서스 · 시총 상위 150 · 같은 표본
 *
 * 선행과 후행은 같은 표본이라 견주기 좋다. per 은 표본이 넓은 대신 실적이
 * 반년 이상 낡았다 — 2025년 사업보고서를 쓰기 때문이다.
 *
 * 몇 종목으로 셌는지(`종목`)와 컨센서스가 시총의 몇 %를 덮는지(`컨센커버`)를
 * 같이 준다. 화면이 그것을 밝혀야 한다.
 *
 * ── 이 주소는 법인팀에 그대로 넘겨 쓸 수 있다 ─────────────
 * 법인팀은 네이버를 못 쓴다. 계산은 우리가 돌리고 결과만 가져가면 된다.
 * 여섯 시간 캐시라 자주 불러도 부담이 없다.
 */
export async function GET() {
  try {
    return NextResponse.json({ data: await marketValue() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
