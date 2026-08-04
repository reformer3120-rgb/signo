import { NextResponse } from "next/server";
import { yahooFinance } from "@/lib/yahoo";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  const out: Record<string, unknown> = {};
  try {
    const r = await yahooFinance.quote(["PFE", "LLY", "MRK", "JNJ"]);
    out.quote = (Array.isArray(r) ? r : [r]).map((x) => ({
      sym: x.symbol,
      price: x.regularMarketPrice,
      marketCap: x.marketCap ?? null,
      shares: (x as Record<string, unknown>).sharesOutstanding ?? null,
      per: x.trailingPE ?? null,
      eps: x.epsTrailingTwelveMonths ?? null,
    }));
  } catch (e) {
    out.quoteErr = String(e).slice(0, 200);
  }
  try {
    const d = await yahooFinance.quoteSummary("PFE", {
      modules: ["price", "summaryDetail", "defaultKeyStatistics"],
    });
    const p = (d.price ?? {}) as Record<string, unknown>;
    const sd = (d.summaryDetail ?? {}) as Record<string, unknown>;
    const ks = (d.defaultKeyStatistics ?? {}) as Record<string, unknown>;
    out.summary = {
      priceCap: p.marketCap ?? null,
      sdCap: sd.marketCap ?? null,
      ksShares: ks.sharesOutstanding ?? null,
      ksFloat: ks.floatShares ?? null,
      price: p.regularMarketPrice ?? null,
    };
  } catch (e) {
    out.summaryErr = String(e).slice(0, 200);
  }
  return NextResponse.json(out);
}
