import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { marketIndicators } from "@/lib/marketIndex";

export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await cached("market:spark4", 60, marketIndicators);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
