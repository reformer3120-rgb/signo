import { NextResponse } from "next/server";
import { upperList, upperMeta } from "@/lib/upperTheme";

export const revalidate = 0;
export const maxDuration = 60;

/** 윗층 테마판 — 지금 돈이 들어온 묶음 */
export async function GET() {
  try {
    const data = await upperList();
    return NextResponse.json({ data, meta: upperMeta() });
  } catch (e) {
    return NextResponse.json({ error: String(e), data: [] }, { status: 502 });
  }
}
