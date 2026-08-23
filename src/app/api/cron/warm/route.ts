import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { sectorStrengthAll } from "@/lib/naverApi";

export const revalidate = 0;
export const maxDuration = 60;

/**
 * 무거운 계산을 장 열리기 전에 미리 데워 둔다.
 *
 * 섹터 강약의 1주·1개월은 전 종목(2,800여 개) 일봉을 받아 만들기 때문에
 * 처음 부르는 사람이 14초쯤 기다린다. 미리 만들어 두면 그 기다림이 없다.
 *
 * 크론은 하루 몇 번뿐이라 이것만으로 종일 덮이지는 않는다. 화면 쪽에서도
 * 카드가 뜨는 순간 배경으로 한 번 부른다(SectorSection). 둘이 같이 덮는다.
 */
export async function GET() {
  const t0 = Date.now();
  try {
    const all = await cached("sectorStrength:all", 7200, sectorStrengthAll);
    const used = all["1w"].detail.reduce((a, x) => a + x.used, 0);
    return NextResponse.json({ ok: true, ms: Date.now() - t0, sectors: all["1w"].detail.length, used });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
