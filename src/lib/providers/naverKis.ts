// 지금 운영 중인 어댑터 — 네이버 + KIS.
//
// 계약(types.ts)이 실제로 구현 가능한지 증명하는 기준 구현이다.
// 코스콤 어댑터를 만들 때 "이 자리에 무엇이 들어가야 하는가"를 여기서 본다.
import { bars, daily, minute, quote as naverQuote, yearly } from "@/lib/naver";
import {
  financials as naverFinancials,
  sectorRank as naverSectorRank,
  stockDetail as naverDetail,
  stockNews,
  stockTrendLong,
} from "@/lib/naverApi";
import {
  exchangeBars,
  exchangeMinutes,
  hasKIS,
  stockInvestor,
  stockInvestorEstimate,
  stockPrice,
  type Exchange,
} from "@/lib/kis";
import type { Exch, SearchHit, StockDataProvider } from "./types";
import type { Candle, Interval, Quote } from "@/lib/types";

const toKis = (e?: Exch): Exchange | null => (e === "NXT" ? "NX" : e === "UN" ? "UN" : null);

const UNIT: Record<string, number> = { "1": 1, "5": 5, "15": 15, "30": 30, "60": 60, "240": 240 };
const PERIOD: Record<string, "D" | "W" | "M" | "Y"> = { "1D": "D", "1W": "W", "1M": "M", "1Y": "Y" };
const SPAN_DAYS: Record<string, number> = { "1D": 400, "1W": 1200, "1M": 3600, "1Y": 9000 };

const ymdOffset = (days: number) => {
  const d = new Date(Date.now() - days * 86400_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
};

/** KRX 캔들 — 네이버 */
const krxCandles = (code: string, interval: Interval): Promise<Candle[]> => {
  if (interval === "1D") return daily(code, 250);
  if (interval === "1W") return bars(code, "week", 250);
  if (interval === "1M") return bars(code, "month", 300);
  if (interval === "1Y") return yearly(code);
  return minute(code, UNIT[interval] ?? 5);
};

export const naverKisProvider: StockDataProvider = {
  name: "naver+kis",

  intervals: () => ["1D", "1W", "1M", "1Y", "1", "5", "15", "30", "60", "240"],
  exchanges: () => ["KRX", "NXT", "UN"],

  async quote(code, name, exchange): Promise<Quote> {
    const ex = toKis(exchange);
    // KRX 외 거래소는 네이버가 주지 않아 KIS 로 간다
    if (ex && hasKIS()) {
      const u = await stockPrice(code, ex);
      // 등락은 언제나 '전일 종가 대비'로 통일한다 — 거래소마다 기준이 달라지면
      // 같은 종목이 탭을 바꿀 때마다 다른 등락률로 보인다
      const base = await naverQuote(code, name).catch(() => null);
      const prevClose = base ? base.price - base.change : 0;
      const change = prevClose > 0 ? u.price - prevClose : 0;
      return {
        symbol: code,
        name,
        price: u.price,
        change,
        changePct: prevClose > 0 ? (change / prevClose) * 100 : u.changePct,
        volume: u.volume,
        currency: "KRW",
      };
    }
    return naverQuote(code, name);
  },

  async candles(code, interval, exchange): Promise<Candle[]> {
    const ex = toKis(exchange);
    if (!ex || !hasKIS()) return krxCandles(code, interval);

    const period = PERIOD[interval];
    if (ex === "NX") {
      return period
        ? exchangeBars(code, ex, period, ymdOffset(SPAN_DAYS[interval] ?? 400), ymdOffset(0))
        : exchangeMinutes(code, ex, UNIT[interval] ?? 5);
    }
    // 통합(UN): KIS 통합 조회는 과거가 짧아 그대로 쓰면 전 거래일 이전이 비어 보인다.
    // KRX 시계열을 깔고 최근 구간만 통합 값으로 덮는다.
    if (!period) return exchangeMinutes(code, ex, UNIT[interval] ?? 5);
    const base = await krxCandles(code, interval);
    const un = await exchangeBars(
      code,
      ex,
      period,
      ymdOffset(SPAN_DAYS[interval] ?? 400),
      ymdOffset(0),
    ).catch(() => [] as Candle[]);
    const byTime = new Map(base.map((c) => [c.time, c]));
    for (const c of un) byTime.set(c.time, c);
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  },

  investorDaily: (code) => (hasKIS() ? stockInvestor(code) : Promise.resolve([])),
  investorIntraday: (code) => (hasKIS() ? stockInvestorEstimate(code) : Promise.resolve([])),
  investorTrend: (code) => stockTrendLong(code, 60),

  detail: (code) => naverDetail(code),
  sectorRank: (code, groupKey) => naverSectorRank(code, groupKey),
  financials: (code, period) => naverFinancials(code, period),
  news: (code) => stockNews(code),

  async search(query): Promise<SearchHit[]> {
    const r = await fetch(
      `https://m.stock.naver.com/api/search/searchAll?query=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" } },
    );
    const j = await r.json();
    return ((j.stocks ?? []) as { code: string; name: string; market?: string }[]).map((s) => ({
      code: s.code,
      name: s.name,
      market: s.market,
    }));
  },
};
