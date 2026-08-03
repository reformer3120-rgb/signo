import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { indexTrend, stockList, type Market } from "@/lib/naverApi";
import { breadth } from "@/lib/naver";
import { hasKIS, programTrade, nxtBreadth, currentSession } from "@/lib/kis";

export const revalidate = 0;
export const maxDuration = 60;

async function flow(market: Market) {
  const [spot, br] = await Promise.all([indexTrend(market), breadth(market)]);
  let program = 0;
  if (hasKIS()) {
    try {
      const p = await programTrade(market);
      program = (p[0]?.whole ?? 0) * 1e6;
    } catch {
      program = 0;
    }
  }
  // NXT 등락 종목수 — NXT만 거래되는 프리마켓(08~09시)에만 의미가 있어 그때만 집계
  let nxt = null;
  if (hasKIS() && currentSession() === "PRE") {
    try {
      const universe = await stockList("marketValue", market, 100);
      nxt = await nxtBreadth(universe.map((s) => s.code));
    } catch {
      nxt = null;
    }
  }
  // 선물 수급: 코스피200 선물(FUT)만 (계약 단위). 코스닥은 심볼 없음.
  let futures = null;
  if (market === "KOSPI") {
    try {
      const f = await indexTrend("FUT");
      futures = { personal: f.personal, foreign: f.foreign, institutional: f.institutional };
    } catch {
      futures = null;
    }
  }
  return {
    date: spot.date,
    breadth: br,
    nxt,
    spot: {
      personal: spot.personal * 1e8,
      foreign: spot.foreign * 1e8,
      institutional: spot.institutional * 1e8,
      program,
    },
    futures,
  };
}

export async function GET() {
  try {
    const ses = currentSession();
    const kospi = await cached(`index-flow3:${ses}:KOSPI`, 60, () => flow("KOSPI"));
    await new Promise((r) => setTimeout(r, 1300));
    const kosdaq = await cached(`index-flow3:${ses}:KOSDAQ`, 60, () => flow("KOSDAQ"));
    return NextResponse.json({ KOSPI: kospi, KOSDAQ: kosdaq });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
