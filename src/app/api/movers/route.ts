import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockList, highLow, type Market, type NStock } from "@/lib/naverApi";
import { hasKIS, fluctuationRank, unifiedQuote } from "@/lib/kis";

export const revalidate = 0;
export const maxDuration = 60;

// ETF 브랜드로 시작 = ETF, + 파생 키워드(ETN 등) 제외 → 개별종목만
const ETF_BRAND =
  /^(KODEX|TIGER|KBSTAR|KOSEF|ARIRANG|HANARO|RISE|SOL|ACE|PLUS|KINDEX|TIMEFOLIO|TREX|FOCUS|KIWOOM|WOORI|1Q|HK|BNK|WON|히어로즈|마이티|파워)\s/i;
const KW = /레버리지|인버스|2X|3X|곱버스|ETN|ETF|선물|국고채|커버드콜|합성|리츠|액티브|금리/i;
const onlyStocks = <T extends { name: string }>(rows: T[]) =>
  rows.filter((s) => !KW.test(s.name) && !ETF_BRAND.test(s.name));

/**
 * KRX(네이버) + NXT(KIS) 등락률 상위를 합쳐 하나의 특징주 목록으로.
 * 두 거래소 어디서든 크게 움직인 종목이 누락되지 않게 하고,
 * 상위 후보는 통합(UN) 시세로 등락률을 보정한다.
 */
async function mergedMovers(market: Market, dir: "up" | "down"): Promise<NStock[]> {
  const [krx, nxt] = await Promise.all([
    stockList(dir, market, 100).catch(() => [] as NStock[]),
    hasKIS() ? fluctuationRank("NX", market, dir).catch(() => []) : Promise.resolve([]),
  ]);
  const merged = new Map<string, NStock & { onNxt?: boolean }>();
  for (const s of onlyStocks(krx)) merged.set(s.code, { ...s });
  for (const s of onlyStocks(nxt)) {
    const cur = merged.get(s.code);
    if (cur) {
      cur.onNxt = true;
      continue;
    }
    merged.set(s.code, {
      code: s.code,
      name: s.name,
      price: s.price,
      change: 0,
      changePct: s.changePct,
      volume: s.volume,
      tradingValue: "",
      marketCap: "",
      onNxt: true,
    });
  }
  const list = [...merged.values()].sort((a, b) =>
    dir === "up" ? b.changePct - a.changePct : a.changePct - b.changePct,
  );

  // 상위 후보만 통합(KRX+NXT) 시세로 보정 — NXT 정규장 이후 가격까지 반영
  const top = list.slice(0, 24);
  if (hasKIS()) {
    for (let i = 0; i < top.length; i += 4) {
      await Promise.all(
        top.slice(i, i + 4).map(async (s) => {
          const prevClose = s.change ? s.price - s.change : 0; // 네이버 KRX 기준 전일종가
          try {
            const u = await unifiedQuote(s.code);
            if (u.price > 0) {
              s.price = u.price;
              // KIS 통합 등락률은 시간외에 '정규장 종가 대비'로 나오므로 전일 종가 기준으로 재계산
              s.changePct =
                prevClose > 0
                  ? +(((u.price - prevClose) / prevClose) * 100).toFixed(2)
                  : u.changePct;
              if (prevClose > 0) s.change = u.price - prevClose;
              if (u.volume > 0) s.volume = u.volume;
            }
          } catch {
            /* 통합 시세 실패 시 원래 값 유지 */
          }
        }),
      );
      await new Promise((r) => setTimeout(r, 250));
    }
    top.sort((a, b) => (dir === "up" ? b.changePct - a.changePct : a.changePct - b.changePct));
  }
  return top.slice(0, 20);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI") as Market;
  const dirRaw = searchParams.get("dir") ?? "up";
  try {
    if (dirRaw === "high" || dirRaw === "low") {
      const raw = await cached(`highlow2:${market}:${dirRaw}`, 600, () =>
        highLow(market, dirRaw as "high" | "low"),
      );
      return NextResponse.json({ market, dir: dirRaw, data: onlyStocks(raw).slice(0, 20) });
    }
    const dir: "up" | "down" = dirRaw === "down" ? "down" : "up";
    const data = await cached(`movers-un2:${market}:${dir}`, 120, () => mergedMovers(market, dir));
    return NextResponse.json({ market, dir, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
