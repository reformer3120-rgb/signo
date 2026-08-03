import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { marketDeposit } from "@/lib/deposit";

export const revalidate = 0;

export async function GET() {
  try {
    // 일 단위 통계라 길게 캐시
    const data = await cached("deposit:v1", 1800, marketDeposit);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
