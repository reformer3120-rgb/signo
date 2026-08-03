import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { usSearch, usDetail, usFinancials, usNews, usSectorRank } from "@/lib/us";
import { indexChart } from "@/lib/yahoo";

export const revalidate = 0;
export const maxDuration = 30;

const clean = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, "");

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const part = sp.get("part") ?? "detail";
  try {
    if (part === "search") {
      const q = (sp.get("q") ?? "").slice(0, 40);
      if (!q.trim()) return NextResponse.json({ data: [] });
      const data = await cached(`us:search:${q.toLowerCase()}`, 300, () => usSearch(q));
      return NextResponse.json({ data });
    }
    const symbol = clean(sp.get("symbol") ?? "AAPL") || "AAPL";
    if (part === "chart") {
      const kind = sp.get("kind") ?? "1D";
      const data = await cached(`us:chart:${symbol}:${kind}`, 120, () => indexChart(symbol, kind));
      return NextResponse.json({ symbol, kind, data });
    }
    if (part === "financials") {
      const period = sp.get("period") === "quarterly" ? "quarterly" : "annual";
      const data = await cached(`us:fin2:${period}:${symbol}`, 3600, () =>
        usFinancials(symbol, period),
      );
      return NextResponse.json({ symbol, period, data });
    }
    if (part === "sector") {
      const data = await cached(`us:sector:${symbol}`, 900, () => usSectorRank(symbol));
      return NextResponse.json({ symbol, data });
    }
    if (part === "news") {
      const data = await cached(`us:news:${symbol}`, 600, () => usNews(symbol, 10));
      return NextResponse.json({ symbol, data });
    }
    const data = await cached(`us:detail:${symbol}`, 60, () => usDetail(symbol));
    return NextResponse.json({ symbol, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
