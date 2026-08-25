import { NextResponse } from "next/server";
import { ownThemeList, themesOfStock } from "@/lib/ownTheme";

export const revalidate = 0;
// 등락률을 함께 주려면 편입 종목 시세가 있어야 한다 (목록과 같은 캐시를 쓴다)
export const maxDuration = 60;

/** 이 종목이 어느 테마에 드는가 — 종목 화면에서 테마로 건너뛸 때 쓴다 */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "종목코드가 올바르지 않다", data: [] }, { status: 400 });
  }
  const mine = themesOfStock(code);
  if (!mine.length) return NextResponse.json({ data: [] });

  // 등락률은 목록에서 가져온다. 목록이 아직 없으면 이름만이라도 내려 준다.
  let chgOf: Record<string, number | null> = {};
  let stale = false;
  try {
    const list = await ownThemeList();
    stale = list.stale;
    chgOf = Object.fromEntries(list.rows.map((r) => [r.id, r.chg]));
  } catch { /* 시세가 없어도 테마 이름은 쓸모가 있다 */ }

  const data = mine.map((t) => ({
    id: t.id,
    name: t.name,
    count: t.codes.length,
    chg: chgOf[t.id] ?? null,
  }));
  return NextResponse.json({ data, stale });
}
