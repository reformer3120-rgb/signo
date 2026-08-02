import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { stockList, highLow, type Market, type NStock } from "@/lib/naverApi";
import { hasKIS, fluctuationRank, unifiedQuotes } from "@/lib/kis";

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
  const top = list.slice(0, 30);
  if (hasKIS()) {
    const quotes = await unifiedQuotes(top.map((s) => s.code));
    for (const s of top) {
      const u = quotes.get(s.code);
      if (!u || u.price <= 0) continue;
      s.price = u.price;
      s.changePct = u.changePct;
      if (u.prevClose > 0) s.change = u.price - u.prevClose;
      if (u.volume > 0) s.volume = u.volume;
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
    const data = await cached(`movers-un3:${market}:${dir}`, 120, () => mergedMovers(market, dir));
    return NextResponse.json({ market, dir, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
