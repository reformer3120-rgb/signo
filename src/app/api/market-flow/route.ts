import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { hasKIS, foreignInstitution, nxtActive, currentSession } from "@/lib/kis";
import { stockList, type Market } from "@/lib/naverApi";

export const revalidate = 0;
export const maxDuration = 60;

/**
 * 시장 수급.
 * - 정규장/장 마감 후: KRX 투자자별 순매수(15:30 확정치) + 통합 거래량·NXT 비중
 * - NXT만 거래되는 시간(프리마켓 등)이나 순매수 데이터가 아직 없을 때: NXT 거래 상위로 대체
 */
async function flow(market: "ALL" | "KOSPI" | "KOSDAQ") {
  const rows = await foreignInstitution(market).catch(() => []);
  const hasNet = rows.some((r) => r.netValue !== 0);
  if (hasNet) return { mode: "KRX+NXT" as const, data: rows };

  // 순매수 데이터가 없는 시간대 → NXT 체결 기준으로 표시
  const markets: Market[] = market === "ALL" ? ["KOSPI", "KOSDAQ"] : [market];
  const names = new Map<string, string>();
  const codes: string[] = [];
  for (const m of markets) {
    const list = await stockList("marketValue", m, 100).catch(() => []);
    for (const s of list) {
      names.set(s.code, s.name);
      codes.push(s.code);
    }
  }
  const data = await nxtActive(codes, names, 15);
  return { mode: "NXT" as const, data };
}

export async function GET(req: Request) {
  if (!hasKIS()) return NextResponse.json({ needKey: true, data: [] });
  const { searchParams } = new URL(req.url);
  const m = searchParams.get("market");
  const market = m === "KOSPI" || m === "KOSDAQ" ? m : "ALL";
  try {
    const r = await cached(`market-flow4:${market}`, 120, () => flow(market));
    return NextResponse.json({ market, session: currentSession(), ...r });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
