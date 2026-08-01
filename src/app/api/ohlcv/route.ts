import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { bars, daily, minute, yearly } from "@/lib/naver";
import type { Interval } from "@/lib/types";

export const revalidate = 0;

const UNIT: Record<string, number> = { "1": 1, "5": 5, "15": 15, "30": 30, "60": 60, "240": 240 };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "005930").replace(/\D/g, "");
  const interval = (searchParams.get("interval") || "1D") as Interval;

  try {
    let data;
    if (interval === "1D") data = await cached(`ohlcv:${code}:1D`, 300, () => daily(code, 250));
    else if (interval === "1W") data = await cached(`ohlcv:${code}:1W`, 600, () => bars(code, "week", 250));
    else if (interval === "1M") data = await cached(`ohlcv:${code}:1M`, 600, () => bars(code, "month", 300));
    else if (interval === "1Y") data = await cached(`ohlcv:${code}:1Y`, 1800, () => yearly(code));
    else {
      const unit = UNIT[interval] ?? 5;
      data = await cached(`ohlcv:${code}:${unit}`, 60, () => minute(code, unit));
    }
    return NextResponse.json({ code, interval, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
