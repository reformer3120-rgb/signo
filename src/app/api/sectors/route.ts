import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { sectors } from "@/lib/naverApi";

export const revalidate = 0;

export async function GET() {
  try {
    const data = await cached("sectors2", 60, sectors);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
