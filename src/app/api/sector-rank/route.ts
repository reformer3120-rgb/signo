import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { sectorRank } from "@/lib/naverApi";

export const revalidate = 0;
export const maxDuration = 60;

/**
 * 섹터 종합평가 — 업종 또는 소속 테마 안에서 이 종목이 몇 등인가.
 *
 * ── group 을 왜 이렇게 거르나 ──────────────────────────────
 * 전에는 `/^theme:\d+$/` 로 걸렀다. 네이버 테마가 번호였을 때 쓴 것인데,
 * 우리 분류로 갈아탄 뒤 테마 id 는 `bio-biosimilar` 같은 글자다. 그래서
 * 테마를 골라도 검사에 걸려 조용히 업종으로 되돌아갔고, 화면에서는
 * 제약과 바이오시밀러가 똑같은 명단을 보여 주었다.
 *
 * 조용히 되돌리는 것이 문제였다. 모르는 group 은 400 으로 돌려보내는 편이
 * 나은데, 그러면 다른 종목에서 고른 비교군을 들고 온 경우(그 종목에는 없는
 * 테마다)에 화면이 통째로 빈다. 그래서 꼴이 맞는 것만 통과시키고, 실제로
 * 그런 테마가 있는지는 sectorRank 가 판단한다.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = (sp.get("code") || "005930").replace(/\D/g, "");
  const raw = sp.get("group") || "industry";
  // "industry" 또는 "theme:<id>" — id 는 우리 분류의 것(it-si · bio-biosimilar)
  const group = /^theme:[a-z0-9-]{1,40}$/.test(raw) ? raw : "industry";
  try {
    return NextResponse.json({
      data: await cached(`sector16:${group}:${code}`, 900, () => sectorRank(code, group)),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
