import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockFixed, themesOfStock, ownThemeList } from "@/lib/ownTheme";
import { stockDetail, baselineUniverse } from "@/lib/naverApi";
import { daily } from "@/lib/naver";
import { marketBaseline, scoresFor } from "@/lib/baseline";
import { maCross, periodReturns } from "@/lib/score";

export const revalidate = 0;
export const maxDuration = 30;

/**
 * 종목 한 장 소개 — 주요사업 · 평가 · 모멘텀 세 칸.
 *
 * 테마 목록에서는 이 값들을 지표 크론이 미리 모아 둔 것에서 읽는다(종목마다
 * 부르면 백 번을 두드리게 된다). 종목 화면은 한 종목뿐이라 그럴 필요가 없어
 * 그때그때 받는다 — 크론이 아직 안 훑은 종목도 모멘텀이 채워진다.
 */
export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "종목코드가 올바르지 않다" }, { status: 400 });
  }
  try {
    const data = await cached(`brief:v1:${code}`, 300, async () => {
      const fixed = stockFixed(code);
      const [dd, bars, themes, list] = await Promise.all([
        stockDetail(code).catch(() => null),
        daily(code, 270).catch(() => []),
        Promise.resolve(themesOfStock(code)),
        ownThemeList().catch(() => null),
      ]);

      const closes = bars.map((b) => b.close).filter((c) => c > 0);
      const r = closes.length > 1 ? periodReturns(closes) : null;
      const cross = closes.length ? maCross(closes).signal : null;

      // 가장 좁은 테마를 대표로 삼는다 — 넓은 테마보다 그 종목을 잘 가리킨다
      const main = themes.length
        ? [...themes].sort((a, b) => a.codes.length - b.codes.length)[0]
        : null;
      const themeRow = main ? (list?.rows.find((x) => x.id === main.id) ?? null) : null;

      let score: number | null = null;
      try {
        const base = await marketBaseline(await baselineUniverse());
        score = (await scoresFor([code], base))[code] ?? null;
      } catch {
        /* 점수가 없어도 나머지는 보여 준다 */
      }

      const foreign = dd?.foreignRate ? Number(String(dd.foreignRate).replace(/[^\d.]/g, "")) : NaN;
      return {
        biz: fixed?.biz ?? [],
        themeName: main?.name ?? null,
        themeCount: main?.codes.length ?? null,
        themeChg: themeRow?.chg ?? null,
        cap: dd?.marketCap ?? null, // 억원
        growth: fixed?.growth ?? null,
        opm: fixed?.opm ?? null,
        finYear: fixed?.finYear ?? null,
        per: dd?.per && dd.per > 0 ? dd.per : null,
        score,
        target: dd?.priceTarget && dd.priceTarget > 0 ? dd.priceTarget : null,
        upside: dd?.priceTarget && dd.priceTarget > 0 ? dd.upside : null,
        recomm: dd?.recommMean && dd.recommMean > 0 ? dd.recommMean : null,
        ret1m: r ? r.m1 : null,
        cross,
        foreign: Number.isFinite(foreign) ? foreign : null,
      };
    });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
