import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockDetail, stockReturns, investorBias } from "@/lib/naverApi";
import { quote } from "@/lib/naver";
import { hasKIS, stockPrice, type Exchange } from "@/lib/kis";

export const revalidate = 0;
export const maxDuration = 30;

/**
 * 종목 상세 — 시세 지표 · 기간 수익률 · 최근 수급.
 *
 * ── 1일 수익률은 왜 따로 받나 ──────────────────────────────
 * 기간 수익률은 네이버 일봉에서 계산한다. 그런데 일봉은 KRX 뿐이라, 화면
 * 머리의 등락률과 어긋나는 일이 있었다. 머리는 차트 툴바의 거래소 선택을
 * 따라가기 때문이다.
 *
 *   2026-08-31 셀트리온   KRX 188,900 (-0.94%)   NXT 189,300 (-0.73%)
 *
 * NXT 나 통합을 골라 두면 머리는 -0.73%, 카드의 1일은 -0.94% 였다. 한 화면에
 * 같은 이름의 값이 둘 다 떠 있으니 어느 쪽이 맞는지 알 길이 없다.
 *
 * 1일은 이미 머리에 있는 값이므로, 여기서도 같은 시세를 쓴다. 1주 이상은
 * 그대로 일봉이다 — NXT 는 과거 일봉이 없어 달리 셀 방법도 없다.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "005930").replace(/\D/g, "");
  const ex = searchParams.get("exchange"); // KRX(기본) | NXT | UN
  const exchange: Exchange | null = ex === "NXT" ? "NX" : ex === "UN" ? "UN" : null;

  try {
    const data = await cached(`detail3:${ex ?? "KRX"}:${code}`, 60, async () => {
      const [detail, returns, bias, 오늘] = await Promise.all([
        stockDetail(code),
        stockReturns(code).catch(() => null),
        investorBias(code, 5).catch(() => null),
        오늘등락(code, exchange).catch(() => null),
      ]);
      // 시세를 못 받으면 일봉으로 센 것을 그대로 둔다 — 빈 칸보다 낫다
      return {
        detail,
        returns: returns && 오늘 !== null ? { ...returns, d1: 오늘 } : returns,
        bias,
      };
    });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

/**
 * 오늘 등락률 — /api/quote 와 같은 방식으로 뽑는다.
 *
 * KRX 외 거래소는 KIS 를 쓰고, 전일 종가는 KRX 것으로 통일한다. 그래야
 * "어제 KRX 종가 대비 지금 얼마" 라는 뜻이 거래소를 바꿔도 그대로다.
 */
async function 오늘등락(code: string, exchange: Exchange | null): Promise<number | null> {
  if (exchange && hasKIS()) {
    const [u, base] = await Promise.all([
      stockPrice(code, exchange),
      quote(code, code).catch(() => null),
    ]);
    const 전일 = base ? base.price - base.change : 0;
    if (전일 > 0) return +(((u.price - 전일) / 전일) * 100).toFixed(2);
    return +u.changePct.toFixed(2);
  }
  const q = await quote(code, code);
  return +q.changePct.toFixed(2);
}
