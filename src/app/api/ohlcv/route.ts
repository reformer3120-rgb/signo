import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { bars, daily, minute, yearly } from "@/lib/naver";
import { hasKIS, exchangeBars, exchangeMinutes, type Exchange } from "@/lib/kis";
import type { Interval } from "@/lib/types";

export const revalidate = 0;
export const maxDuration = 60;

const UNIT: Record<string, number> = { "1": 1, "5": 5, "15": 15, "30": 30, "60": 60, "240": 240 };
const PERIOD: Record<string, "D" | "W" | "M" | "Y"> = { "1D": "D", "1W": "W", "1M": "M", "1Y": "Y" };

// KIS 기간별시세 조회 범위 (봉 종류별로 충분한 과거까지)
const SPAN_DAYS: Record<string, number> = { "1D": 400, "1W": 1200, "1M": 3600, "1Y": 9000 };

function ymdOffset(days: number): string {
  const d = new Date(Date.now() - days * 86400_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "005930").replace(/\D/g, "");
  const interval = (searchParams.get("interval") || "1D") as Interval;
  const ex = searchParams.get("exchange"); // KRX(기본) | NXT | UN
  const exchange: Exchange | null = ex === "NXT" ? "NX" : ex === "UN" ? "UN" : null;

  try {
    // KRX 외 거래소는 KIS에서 조회 (네이버는 KRX만 제공)
    if (exchange && hasKIS()) {
      const key = `ohlcv:${exchange}:${code}:${interval}`;
      const period = PERIOD[interval];
      const data = period
        ? await cached(key, interval === "1D" ? 300 : 900, () =>
            exchangeBars(code, exchange, period, ymdOffset(SPAN_DAYS[interval] ?? 400), ymdOffset(0)),
          )
        : await cached(key, 60, () => exchangeMinutes(code, exchange, UNIT[interval] ?? 5));
      return NextResponse.json({ code, interval, exchange: ex, data });
    }

    let data;
    if (interval === "1D") data = await cached(`ohlcv:${code}:1D`, 300, () => daily(code, 250));
    else if (interval === "1W") data = await cached(`ohlcv:${code}:1W`, 600, () => bars(code, "week", 250));
    else if (interval === "1M") data = await cached(`ohlcv:${code}:1M`, 600, () => bars(code, "month", 300));
    else if (interval === "1Y") data = await cached(`ohlcv:${code}:1Y`, 1800, () => yearly(code));
    else {
      const unit = UNIT[interval] ?? 5;
      data = await cached(`ohlcv:${code}:${unit}`, 60, () => minute(code, unit));
    }
    return NextResponse.json({ code, interval, exchange: "KRX", data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
