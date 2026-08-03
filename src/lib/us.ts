// 미국 증시 데이터 (야후 파이낸스). 서버 전용.
import { yahooFinance } from "./yahoo";

export interface UsQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap: number;
}

const q = (x: Record<string, unknown>): UsQuote => ({
  symbol: String(x.symbol ?? ""),
  name: String(x.shortName ?? x.longName ?? x.symbol ?? ""),
  price: Number(x.regularMarketPrice) || 0,
  change: Number(x.regularMarketChange) || 0,
  changePct: Number(x.regularMarketChangePercent) || 0,
  volume: Number(x.regularMarketVolume) || 0,
  marketCap: Number(x.marketCap) || 0,
});

/** 주요 지수 (S&P500 · 나스닥 · 다우 · 러셀2000 · VIX) */
const INDEX_SYMBOLS = ["^GSPC", "^IXIC", "^DJI", "^RUT", "^VIX"];
const INDEX_KO: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "나스닥 종합",
  "^DJI": "다우존스",
  "^RUT": "러셀 2000",
  "^VIX": "VIX 변동성",
};

export async function usIndices(): Promise<UsQuote[]> {
  const rows = await yahooFinance.quote(INDEX_SYMBOLS);
  const list = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
  return INDEX_SYMBOLS.map((s) => {
    const hit = list.find((x) => x.symbol === s);
    return hit ? { ...q(hit), name: INDEX_KO[s] ?? q(hit).name } : null;
  }).filter((x): x is UsQuote => !!x);
}

/** 섹터별 등락 — SPDR 섹터 ETF 기준 */
const SECTOR_ETF: [string, string][] = [
  ["XLK", "기술"],
  ["XLC", "커뮤니케이션"],
  ["XLY", "임의소비재"],
  ["XLP", "필수소비재"],
  ["XLF", "금융"],
  ["XLV", "헬스케어"],
  ["XLI", "산업재"],
  ["XLE", "에너지"],
  ["XLU", "유틸리티"],
  ["XLRE", "부동산"],
  ["XLB", "소재"],
];

export interface UsSector {
  symbol: string;
  name: string;
  changePct: number;
}

export async function usSectors(): Promise<UsSector[]> {
  const rows = await yahooFinance.quote(SECTOR_ETF.map(([s]) => s));
  const list = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
  return SECTOR_ETF.map(([sym, ko]) => {
    const hit = list.find((x) => x.symbol === sym);
    return {
      symbol: sym,
      name: ko,
      changePct: hit ? Number(hit.regularMarketChangePercent) || 0 : 0,
    };
  }).sort((a, b) => b.changePct - a.changePct);
}

export type UsMoverKind = "gainers" | "losers" | "actives";

const SCR_ID = {
  gainers: "day_gainers",
  losers: "day_losers",
  actives: "most_actives",
} as const;

/** 특징주 (상승률 · 하락률 · 거래활발) */
export async function usMovers(kind: UsMoverKind, count = 20): Promise<UsQuote[]> {
  const r = await yahooFinance.screener({ scrIds: SCR_ID[kind], count });
  return ((r.quotes ?? []) as unknown as Record<string, unknown>[]).map(q);
}

/** 시가총액 상위 — 대형주 종목군에서 시총순 정렬 */
const MEGA_CAPS = [
  "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "AVGO", "TSLA", "BRK-B", "JPM",
  "WMT", "LLY", "V", "ORCL", "MA", "NFLX", "XOM", "COST", "JNJ", "HD",
  "PG", "ABBV", "BAC", "PLTR", "AMD", "CVX", "KO", "TMUS", "CRM", "WFC",
  "CSCO", "PM", "IBM", "MCD", "GE", "ABT", "LIN", "MRK", "NOW", "PEP",
  "ACN", "ISRG", "AXP", "TMO", "INTU", "GS", "QCOM", "ADBE", "TXN", "DIS",
];

export async function usMarketCap(limit = 20): Promise<UsQuote[]> {
  const rows = await yahooFinance.quote(MEGA_CAPS.slice(0, Math.max(limit, 20)));
  const list = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
  return list
    .map(q)
    .filter((x) => x.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, limit);
}
