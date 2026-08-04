import { NextResponse } from "next/server";
import { yahooFinance } from "@/lib/yahoo";
import { redis } from "@/lib/cache";
import { LARGE_CAP_UNIVERSE } from "@/lib/us";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  const want = LARGE_CAP_UNIVERSE;
  const got = new Map<string, Record<string, unknown>>();
  let calls = 0;
  for (let i = 0; i < want.length; i += 40) {
    calls++;
    try {
      const r = await yahooFinance.quote(want.slice(i, i + 40));
      for (const x of (Array.isArray(r) ? r : [r]) as Record<string, unknown>[])
        if (x?.symbol) got.set(String(x.symbol), x);
    } catch {
      /* 무시 */
    }
  }
  const withCap = [...got.values()].filter((x) => Number(x.marketCap) > 0).length;
  const withPrice = [...got.values()].filter((x) => Number(x.regularMarketPrice) > 0).length;

  // 상세조회 3건이 실제로 되는지
  const sample = [...got.entries()]
    .filter(([, x]) => !(Number(x.marketCap) > 0) && Number(x.regularMarketPrice) > 0)
    .slice(0, 3);
  const probes: unknown[] = [];
  for (const [sym] of sample) {
    try {
      const d = await yahooFinance.quoteSummary(sym, {
        modules: ["price", "summaryDetail", "defaultKeyStatistics"],
      });
      const p = (d.price ?? {}) as Record<string, unknown>;
      const ks = (d.defaultKeyStatistics ?? {}) as Record<string, unknown>;
      probes.push({ sym, cap: p.marketCap ?? null, shares: ks.sharesOutstanding ?? null, float: ks.floatShares ?? null });
    } catch (e) {
      probes.push({ sym, err: String(e).slice(0, 120) });
    }
  }
  let redisOk: unknown = "no-redis";
  if (redis) {
    try {
      await redis.set("probe:ping", 1, { ex: 60 });
      redisOk = await redis.get("probe:ping");
    } catch (e) {
      redisOk = String(e).slice(0, 120);
    }
  }
  return NextResponse.json({
    요청: want.length, 응답: got.size, 시총있음: withCap, 가격있음: withPrice, 호출수: calls,
    상세조회샘플: probes, redis: redisOk,
  });
}
