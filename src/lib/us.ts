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

// ---- 미국 개별 종목 ----
export interface UsSearchItem {
  symbol: string;
  name: string;
  exchange: string;
}

/** 종목 검색 (미국 상장 주식/ETF) */
export async function usSearch(query: string): Promise<UsSearchItem[]> {
  if (!query.trim()) return [];
  const r = await yahooFinance.search(query, { quotesCount: 12, newsCount: 0 });
  return ((r.quotes ?? []) as unknown as Record<string, unknown>[])
    .filter((x) => x.symbol && (x.quoteType === "EQUITY" || x.quoteType === "ETF"))
    .map((x) => ({
      symbol: String(x.symbol),
      name: String(x.shortname ?? x.longname ?? x.symbol),
      exchange: String(x.exchange ?? ""),
    }))
    .slice(0, 10);
}

export interface UsDetail {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  changePct: number;
  marketCap: number;
  per: number;
  forwardPer: number;
  pbr: number;
  eps: number;
  dividendYield: number; // %
  beta: number;
  high52: number;
  low52: number;
  targetPrice: number;
  upside: number; // %
  recommendMean: number; // 1(강력매수)~5(매도)
  recommendKey: string;
  roe: number; // %
  profitMargin: number; // %
  revenueGrowth: number; // %
  debtToEquity: number;
  heldByInstitutions: number; // %
}

const pctOf = (v: unknown) => (Number(v) || 0) * 100;

/** 종목 상세 (지표 + 애널리스트 + 수익성) */
export async function usDetail(symbol: string): Promise<UsDetail> {
  const d = await yahooFinance.quoteSummary(symbol, {
    modules: ["assetProfile", "summaryDetail", "defaultKeyStatistics", "financialData", "price"],
  });
  const p = (d.price ?? {}) as Record<string, unknown>;
  const sd = (d.summaryDetail ?? {}) as Record<string, unknown>;
  const ks = (d.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const fd = (d.financialData ?? {}) as Record<string, unknown>;
  const ap = (d.assetProfile ?? {}) as Record<string, unknown>;
  const price = Number(p.regularMarketPrice ?? fd.currentPrice) || 0;
  const target = Number(fd.targetMeanPrice) || 0;
  return {
    symbol,
    name: String(p.shortName ?? p.longName ?? symbol),
    sector: String(ap.sector ?? ""),
    industry: String(ap.industry ?? ""),
    price,
    changePct: pctOf(p.regularMarketChangePercent),
    marketCap: Number(sd.marketCap ?? p.marketCap) || 0,
    per: Number(sd.trailingPE) || 0,
    forwardPer: Number(ks.forwardPE) || 0,
    pbr: Number(ks.priceToBook) || 0,
    eps: Number(ks.trailingEps) || 0,
    dividendYield: pctOf(sd.dividendYield),
    beta: Number(ks.beta) || 0,
    high52: Number(sd.fiftyTwoWeekHigh) || 0,
    low52: Number(sd.fiftyTwoWeekLow) || 0,
    targetPrice: target,
    upside: price > 0 && target > 0 ? +(((target - price) / price) * 100).toFixed(1) : 0,
    recommendMean: Number(fd.recommendationMean) || 0,
    recommendKey: String(fd.recommendationKey ?? ""),
    roe: pctOf(fd.returnOnEquity),
    profitMargin: pctOf(fd.profitMargins),
    revenueGrowth: pctOf(fd.revenueGrowth),
    debtToEquity: Number(fd.debtToEquity) || 0,
    heldByInstitutions: pctOf(ks.heldPercentInstitutions),
  };
}

export interface UsFinRow {
  period: string; // "2025.09"
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  operatingMargin: number; // %
  netMargin: number; // %
}

/**
 * 재무제표.
 * quoteSummary의 incomeStatementHistory는 2024년 말부터 값이 비어 있어
 * 야후 권장 경로인 fundamentalsTimeSeries를 사용한다.
 */
export async function usFinancials(
  symbol: string,
  period: "annual" | "quarterly" = "annual",
): Promise<UsFinRow[]> {
  const from = period === "annual" ? "2019-01-01" : "2023-01-01";
  const rows = (await yahooFinance.fundamentalsTimeSeries(symbol, {
    period1: from,
    type: period,
    module: "financials",
  })) as unknown as Record<string, unknown>[];
  return rows
    .filter((r) => Number(r.totalRevenue) > 0)
    .map((r) => {
      const revenue = Number(r.totalRevenue) || 0;
      const op = Number(r.operatingIncome ?? r.totalOperatingIncomeAsReported) || 0;
      const net = Number(r.netIncome ?? r.netIncomeCommonStockholders) || 0;
      // date는 Date 객체로 오므로 문자열 슬라이스 대신 날짜로 변환해 사용
      const dt = new Date(r.date as string | Date);
      const period = Number.isFinite(dt.getTime())
        ? `${dt.getUTCFullYear()}.${String(dt.getUTCMonth() + 1).padStart(2, "0")}`
        : "";
      return {
        period,
        revenue,
        grossProfit: Number(r.grossProfit) || 0,
        operatingIncome: op,
        netIncome: net,
        eps: Number(r.dilutedEPS ?? r.basicEPS) || 0,
        operatingMargin: revenue ? +((op / revenue) * 100).toFixed(1) : 0,
        netMargin: revenue ? +((net / revenue) * 100).toFixed(1) : 0,
      };
    })
    .slice(-6);
}

export interface UsNews {
  title: string;
  publisher: string;
  link: string;
  time: string;
}

/** 종목 관련 뉴스 */
export async function usNews(symbol: string, count = 10): Promise<UsNews[]> {
  const r = await yahooFinance.search(symbol, { newsCount: count, quotesCount: 0 });
  return ((r.news ?? []) as unknown as Record<string, unknown>[]).map((n) => ({
    title: String(n.title ?? ""),
    publisher: String(n.publisher ?? ""),
    link: String(n.link ?? ""),
    time: n.providerPublishTime ? new Date(n.providerPublishTime as string).toISOString() : "",
  }));
}
