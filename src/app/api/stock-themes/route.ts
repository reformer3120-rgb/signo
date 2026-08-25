import { NextResponse } from "next/server";
import { themesOfStock } from "@/lib/ownTheme";

export const revalidate = 3600;

/** 이 종목이 어느 테마에 드는가 — 종목 화면에서 테마로 건너뛸 때 쓴다 */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "종목코드가 올바르지 않다", data: [] }, { status: 400 });
  }
  const data = themesOfStock(code).map((t) => ({ id: t.id, name: t.name, count: t.codes.length }));
  return NextResponse.json({ data });
}
