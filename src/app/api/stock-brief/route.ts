import { NextResponse } from "next/server";
import { stockFixed, nameOf } from "@/lib/ownTheme";
import { aboutOf } from "@/lib/about";

export const revalidate = 0;

/**
 * 종목 개요 — 이 회사가 무슨 일을 하는가.
 *
 * ── 왜 바깥을 하나도 안 부르나 ─────────────────────────────
 * 예전에는 여기서 시세·일봉 270개·시장 기준선까지 받아 점수와 PER, 목표주가,
 * 골든크로스를 함께 내려보냈다. 그런데 그 값들은 아래 카드(종목 상세·재무제표·
 * 섹터 종합평가)에 그대로 또 있어서 개요에서 걷어냈고, 그 뒤로는 아무도 쓰지
 * 않는 값을 받자고 네 군데를 두드리고 있었다.
 *
 * 남은 것은 전부 배포에 실려 있는 표(themes.json · about.json)에서 읽는다.
 * 그래서 이 주소는 네트워크를 타지 않고 몇 밀리초에 답한다 — 개요 카드가
 * 시세 응답을 기다리느라 빈 채로 서 있던 일이 없어진다.
 *
 * 숫자가 필요하면 그것을 보여 주는 카드가 따로 부른다
 * (stock-detail · financials · sector-rank).
 */
export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "종목코드가 올바르지 않다" }, { status: 400 });
  }

  // 테마는 여기서 안 내려보낸다 — 차트 위 테마 칩이 stock-themes 로 따로 받는다
  const fixed = stockFixed(code);

  return NextResponse.json({
    data: {
      // 주소에 name 없이 들어온 화면이 제목을 채우는 데 쓴다.
      // 분류표에 없는 종목은 null 이고, 그때는 화면이 코드를 그대로 쓴다.
      name: nameOf(code),
      // 개요 본문 — 사업보고서 '사업의 개요' 에서 옮긴 두세 문장
      about: aboutOf(code),
      // about 이 빈 종목(5%)에서 개요 대신 쓰는 테마 편입 사유
      why: fixed?.why ?? null,
      biz: fixed?.biz ?? [],
    },
  });
}
