import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fx } from "@/lib/yahoo";

export const revalidate = 0;

export async function GET() {
  try {
    const data = await cached("fx", 60, fx);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
