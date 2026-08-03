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
async function flow(market: "ALL" | "KOSPI" | "KOSDAQ", dir: "buy" | "sell") {
  const session = currentSession();
  const rows = await foreignInstitution(market, 15, dir).catch(() => []);
  const hasNet = rows.some((r) => r.netValue !== 0);
  // 정규장·장 마감 후에는 외국인·기관 순매수를 우선 표시.
  // (장 초반엔 순매수가 아직 0일 수 있는데, 그때 NXT로 대체하면 안 된다)
  if (rows.length && hasNet)
    return { mode: "KRX+NXT" as const, krxRows: rows.length, data: rows };

  // 외국인·기관 순매수(가집계)는 장 마감 후 제공된다.
  // 그 전까지는 거래대금 상위로 대체 — 정규장/마감 후엔 통합(KRX+NXT), NXT 전용 시간엔 NXT 기준.
  const inSession = session === "REGULAR" || session === "AFTER";
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
  const data = await nxtActive(codes, names, 15, inSession ? "UN" : "NX");
  return {
    mode: inSession ? ("PENDING" as const) : ("NXT" as const),
    krxRows: rows.length,
    data,
  };
}

export async function GET(req: Request) {
  if (!hasKIS()) return NextResponse.json({ needKey: true, data: [] });
  const { searchParams } = new URL(req.url);
  const m = searchParams.get("market");
  const market = m === "KOSPI" || m === "KOSDAQ" ? m : "ALL";
  const dir: "buy" | "sell" = searchParams.get("dir") === "sell" ? "sell" : "buy";
  try {
    // 세션이 바뀌면 이전 세션 캐시가 이월되지 않도록 키에 포함
    const session = currentSession();
    const r = await cached(`market-flow7:${session}:${market}:${dir}`, 60, () => flow(market, dir));
    return NextResponse.json({ market, session, dir, ...r });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
