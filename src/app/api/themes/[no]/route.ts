import { NextResponse } from "next/server";
import { ownThemeDetail, themeMeta } from "@/lib/ownTheme";
import { marketBaseline, scoresFor } from "@/lib/baseline";
import { baselineUniverse } from "@/lib/naverApi";

export const revalidate = 0;
export const maxDuration = 60;

/** [no] 는 자체 분류의 테마 id 다 (예: batt-cathode). 예전 네이버 번호와 다르다. */
export async function GET(_req: Request, ctx: { params: Promise<{ no: string }> }) {
  const { no } = await ctx.params;
  if (!/^[a-z0-9-]{2,40}$/.test(no)) {
    return NextResponse.json({ error: "테마 이름이 올바르지 않다" }, { status: 400 });
  }
  try {
    const data = await ownThemeDetail(no);
    // 종합점수는 여기서 얹는다. ownTheme 안에서 부르면 naverApi 와 서로 물린다
    // (naverApi 가 테마를 읽고 테마가 점수를 읽는 꼴이 된다).
    // 이미 모아 둔 지표로 계산만 하므로 외부 조회가 없다.
    try {
      const base = await marketBaseline(await baselineUniverse());
      const scores = await scoresFor(data.stocks.map((s) => s.code), base);
      for (const s of data.stocks) s.score = scores[s.code] ?? null;
    } catch {
      /* 점수가 없어도 나머지는 보여 준다 */
    }
    return NextResponse.json({ data, meta: themeMeta() });
  } catch (e) {
    // 없는 테마와 수집 실패를 가른다. 앞은 다시 불러도 소용없고, 뒤는 소용있다.
    const notFound = String(e).includes("테마 없음");
    return NextResponse.json(
      { error: notFound ? "그런 테마가 없다" : String(e) },
      { status: notFound ? 404 : 502 },
    );
  }
}
