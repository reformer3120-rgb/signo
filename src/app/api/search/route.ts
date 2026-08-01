import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { search } from "@/lib/naverApi";

export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ data: [] });
  try {
    const data = await cached(`search:${q}`, 300, () => search(q));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
