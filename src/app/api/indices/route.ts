import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { indices } from "@/lib/naverApi";

export const revalidate = 0;

export async function GET() {
  try {
    const rows = await cached("indices", 20, indices);
    const data = rows.map((i) => ({
      symbol: i.name,
      name: i.name,
      price: i.price,
      change: i.change,
      changePct: i.changePct,
    }));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
