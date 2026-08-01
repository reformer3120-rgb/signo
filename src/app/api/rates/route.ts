import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { bonds } from "@/lib/naverApi";

export const revalidate = 0;

export async function GET() {
  try {
    const data = await cached("bonds", 180, bonds);
    return NextResponse.json({ maturities: ["2Y", "3Y", "5Y", "10Y", "30Y"], data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
