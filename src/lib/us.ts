// 미국 증시 데이터 (야후 파이낸스). 서버 전용.
import { yahooFinance } from "./yahoo";
import { bonds } from "./naverApi";

export interface UsQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap: number;
  spark?: number[];
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
const INDEX_SYMBOLS = ["^DJI", "^IXIC", "^GSPC", "^RUT", "^VIX"];
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
  // 카드 안에 흐름을 보여줄 30일 라인 데이터
  const sparks = await Promise.all(
    INDEX_SYMBOLS.map(async (s) => {
      try {
        const r = await yahooFinance.chart(s, {
          period1: new Date(Date.now() - 50 * 86400_000),
          interval: "1d",
        });
        return (r.quotes ?? [])
          .map((x) => x.close)
          .filter((c): c is number => c != null)
          .slice(-30);
      } catch {
        return [];
      }
    }),
  );
  const out: UsQuote[] = [];
  INDEX_SYMBOLS.forEach((s, i) => {
    const hit = list.find((x) => x.symbol === s);
    if (!hit) return;
    out.push({ ...q(hit), name: INDEX_KO[s] ?? q(hit).name, spark: sparks[i] });
  });
  return out;
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

/** 심볼이 많을 때 나눠서 조회 */
async function quoteMany(symbols: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < symbols.length; i += 120) {
    const r = await yahooFinance.quote(symbols.slice(i, i + 120));
    out.push(...((Array.isArray(r) ? r : [r]) as Record<string, unknown>[]));
  }
  return out;
}

/**
 * 특징주 — 대형주 유니버스(시총 상위 종목군) 안에서만 산출.
 * 야후 스크리너는 소형주까지 섞여 나와서 유니버스를 직접 조회해 정렬한다.
 */
export async function usMovers(kind: UsMoverKind, count = 20): Promise<UsQuote[]> {
  const list = await quoteMany(LARGE_CAP_UNIVERSE);
  const rows = list.map(q).filter((x) => x.price > 0);
  if (kind === "actives") {
    rows.sort((a, b) => b.volume * b.price - a.volume * a.price); // 거래대금 기준
  } else if (kind === "losers") {
    rows.sort((a, b) => a.changePct - b.changePct);
  } else {
    rows.sort((a, b) => b.changePct - a.changePct);
  }
  return rows.slice(0, count);
}

/** 대형주 유니버스 — 특징주·시총상위 산출 기준 (S&P500 상위 종목군) */
export const LARGE_CAP_UNIVERSE = [
  "NVDA","AAPL","MSFT","GOOGL","GOOG","AMZN","META","AVGO","TSLA","BRK-B",
  "JPM","WMT","LLY","V","ORCL","MA","NFLX","XOM","COST","JNJ",
  "HD","PG","ABBV","BAC","PLTR","AMD","CVX","KO","TMUS","CRM",
  "WFC","CSCO","PM","IBM","MCD","GE","ABT","LIN","MRK","NOW",
  "PEP","ACN","ISRG","AXP","TMO","INTU","GS","QCOM","ADBE","TXN",
  "DIS","CAT","RTX","VZ","AMGN","MS","PFE","BKNG","SPGI","UNH",
  "BLK","T","LOW","NEE","HON","SCHW","UNP","ETN","C","BSX",
  "SYK","ANET","PGR","TJX","ADP","GILD","CMCSA","VRTX","DE","LRCX",
  "MU","BX","PANW","REGN","KLAC","AMAT","MDT","CB","ADI","MMC",
  "SO","LMT","ICE","MO","INTC","PLD","CI","SHW","DUK","APH",
  "ELV","MDLZ","CME","AON","WM","EQIX","MCK","CTAS","ZTS","PYPL",
  "MCO","APD","CL","TT","NOC","SNPS","MSI","EMR","ITW","GD",
  "ORLY","CVS","MMM","BDX","FCX","USB","CDNS","ECL","PNC","MAR",
  "NKE","CRWD","ABNB","ROP","AJG","COF","TGT","AZO","WELL","SLB",
  "TFC","HLT","AEP","SPG","PSA","AMT","CCI","DLR","O","VST",
  "CEG","SRE","D","EXC","XEL","ED","PEG","WEC","EIX","DTE",
  "COP","EOG","PSX","MPC","WMB","OXY","VLO","KMI","OKE","HES",
  "NEM","DOW","NUE","PPG","VMC","MLM","ALB","IFF","CTVA","LYB",
  "SBUX","CMG","YUM","DHI","LEN","GM","F","RCL","CCL","EBAY",
  "KMB","GIS","KHC","SYY","STZ","HSY","K","gis","GEHC","DXCM",
  "IDXX","A","IQV","RMD","WST","MTD","HUM","CNC","BIIB","MRNA",
  "SNOW","DDOG","TEAM","NET","ZS","MDB","HOOD","COIN","SQ","SHOP",
  "UBER","LYFT","DASH","RBLX","SPOT","TTD","APP","ARM","SMCI","MRVL",
  "DELL","HPQ","HPE","WDC","STX","ON","MCHP","NXPI","TER","SWKS",
].filter((v, i, a) => a.indexOf(v) === i && v === v.toUpperCase());

/** 시가총액 상위 — 대형주 종목군에서 시총순 정렬 */
export async function usMarketCap(limit = 20): Promise<UsQuote[]> {
  const rows = await quoteMany(LARGE_CAP_UNIVERSE);
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

// ---- 섹터 종합평가 ----
// 야후 스크리너는 섹터별 조회를 지원하지 않아, GICS 11개 섹터의 대표 종목을 비교군으로 사용.
const SECTOR_PEERS: Record<string, string[]> = {
  Technology: ["NVDA", "AAPL", "MSFT", "AVGO", "ORCL", "CRM", "AMD", "CSCO", "ACN", "TXN", "QCOM", "ADBE", "IBM", "NOW", "INTU"],
  "Communication Services": ["GOOGL", "META", "NFLX", "TMUS", "DIS", "CMCSA", "VZ", "T", "EA", "WBD"],
  "Consumer Cyclical": ["AMZN", "TSLA", "HD", "MCD", "BKNG", "LOW", "NKE", "SBUX", "TJX", "GM"],
  "Consumer Defensive": ["WMT", "COST", "PG", "KO", "PEP", "PM", "MO", "MDLZ", "CL", "TGT"],
  "Financial Services": ["BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "SCHW"],
  Healthcare: ["LLY", "JNJ", "ABBV", "UNH", "MRK", "TMO", "ABT", "PFE", "AMGN", "ISRG"],
  Industrials: ["GE", "CAT", "RTX", "HON", "UNP", "BA", "DE", "LMT", "UPS", "ETN"],
  Energy: ["XOM", "CVX", "COP", "EOG", "SLB", "PSX", "MPC", "WMB", "OXY", "VLO"],
  Utilities: ["NEE", "SO", "DUK", "CEG", "AEP", "SRE", "D", "EXC", "XEL", "ED"],
  "Real Estate": ["PLD", "AMT", "EQIX", "WELL", "SPG", "PSA", "O", "CCI", "DLR", "CBRE"],
  "Basic Materials": ["LIN", "SHW", "APD", "ECL", "FCX", "NEM", "DOW", "NUE", "PPG", "VMC"],
};

export interface UsScored {
  symbol: string;
  name: string;
  marketCap: number;
  per: number;
  pbr: number;
  dividendYield: number;
  eps: number;
  changePct: number;
  year1: number; // 1년 수익률 %
  vs200d: number; // 200일선 대비 %
  vs50d: number; // 50일선 대비 %
  score: number;
  rank: number;
  parts: { 밸류: number; 성장: number; 수익성: number; 모멘텀: number; 배당: number; 규모: number };
}

export interface UsSectorRank {
  sector: string;
  total: number;
  rank: number;
  ranked: UsScored[];
  target?: UsScored;
}

/** 방향 정규화 스케일러 — 기준은 비교군 고정 멤버로만 산출 */
function scaler(base: number[], dir: "hi" | "lo"): (v: number) => number {
  const ok = base.filter(Number.isFinite);
  if (!ok.length) return () => 0.5;
  const min = Math.min(...ok);
  const max = Math.max(...ok);
  const range = max - min || 1;
  return (v) => {
    if (!Number.isFinite(v)) return 0;
    const t = Math.min(1, Math.max(0, (v - min) / range));
    return dir === "hi" ? t : 1 - t;
  };
}

export async function usSectorRank(symbol: string): Promise<UsSectorRank> {
  const detail = await usDetail(symbol);
  const sector = detail.sector || "Technology";
  const base = SECTOR_PEERS[sector] ?? SECTOR_PEERS.Technology;
  const codes = base.includes(symbol) ? base : [...base, symbol];

  const rows = await yahooFinance.quote(codes);
  const list = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
  const items = list
    .filter((x) => Number(x.marketCap) > 0)
    .map((x) => ({
      symbol: String(x.symbol),
      name: String(x.shortName ?? x.symbol),
      marketCap: Number(x.marketCap) || 0,
      per: Number(x.trailingPE) || NaN,
      forwardPer: Number(x.forwardPE) || NaN,
      pbr: Number(x.priceToBook) || NaN,
      dividendYield: Number(x.dividendYield) || 0,
      eps: Number(x.epsTrailingTwelveMonths) || NaN,
      epsForward: Number(x.epsForward) || NaN,
      changePct: Number(x.regularMarketChangePercent) || 0,
      year1: Number(x.fiftyTwoWeekChangePercent) || 0,
      vs200d: Number(x.twoHundredDayAverageChangePercent) * 100 || 0,
      vs50d: Number(x.fiftyDayAverageChangePercent) * 100 || 0,
    }));

  // 정규화 기준은 큐레이션된 섹터 대표 종목으로만 (검색 종목이 기준을 흔들지 않게)
  const baseRows = items.filter((e) => base.includes(e.symbol));
  const mk = (pick: (e: (typeof items)[number]) => number, dir: "hi" | "lo") => {
    const s = scaler(baseRows.map(pick), dir);
    return items.map((e) => s(pick(e)));
  };
  const perN = mk((e) => (e.per > 0 ? e.per : NaN), "lo");
  const pbrN = mk((e) => (e.pbr > 0 ? e.pbr : NaN), "lo");
  const epsN = mk((e) => e.eps, "hi");
  // 성장: 선행EPS가 후행EPS보다 높을수록 이익 개선
  const growthN = mk(
    (e) => (Number.isFinite(e.eps) && e.eps !== 0 ? (e.epsForward - e.eps) / Math.abs(e.eps) : NaN),
    "hi",
  );
  // 수익성 대용: 선행 PER이 낮을수록 이익 대비 저평가
  const profitN = mk((e) => (e.forwardPer > 0 ? e.forwardPer : NaN), "lo");
  const y1N = mk((e) => e.year1, "hi");
  const m200N = mk((e) => e.vs200d, "hi");
  const m50N = mk((e) => e.vs50d, "hi");
  const divN = mk((e) => e.dividendYield, "hi");
  const capN = mk((e) => Math.log10(Math.max(e.marketCap, 1)), "hi");

  const scored: UsScored[] = items.map((e, i) => {
    const 밸류 = perN[i] * 0.4 + pbrN[i] * 0.35 + epsN[i] * 0.25;
    const 성장 = growthN[i];
    const 수익성 = profitN[i];
    const 모멘텀 = y1N[i] * 0.4 + m200N[i] * 0.35 + m50N[i] * 0.25;
    const 배당 = divN[i];
    const score = Math.round(
      (밸류 * 0.25 + 성장 * 0.2 + 수익성 * 0.18 + 모멘텀 * 0.22 + 배당 * 0.08 + capN[i] * 0.07) * 100,
    );
    return {
      symbol: e.symbol,
      name: e.name,
      marketCap: e.marketCap,
      per: Number.isFinite(e.per) ? +e.per.toFixed(1) : 0,
      pbr: Number.isFinite(e.pbr) ? +e.pbr.toFixed(1) : 0,
      dividendYield: +e.dividendYield.toFixed(2),
      eps: Number.isFinite(e.eps) ? +e.eps.toFixed(2) : 0,
      changePct: +e.changePct.toFixed(2),
      year1: +e.year1.toFixed(1),
      vs200d: +e.vs200d.toFixed(1),
      vs50d: +e.vs50d.toFixed(1),
      score,
      rank: 0,
      parts: {
        밸류: Math.round(밸류 * 100),
        성장: Math.round(성장 * 100),
        수익성: Math.round(수익성 * 100),
        모멘텀: Math.round(모멘텀 * 100),
        배당: Math.round(배당 * 100),
        규모: Math.round(capN[i] * 100),
      },
    };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => (s.rank = i + 1));
  const target = scored.find((s) => s.symbol === symbol);
  const top10 = scored.slice(0, 10);
  const ranked = target && !top10.some((s) => s.symbol === symbol) ? [...top10, target] : top10;
  return { sector, total: scored.length, rank: target?.rank ?? 0, ranked, target };
}

// ---- 미국 시장지표 (국채금리 · 달러 · 원자재 · 환율 · 선물 · 가상자산) ----
export interface UsIndicator {
  symbol: string;
  label: string;
  price: number;
  changePct: number;
  unit?: string;
}
export interface UsBondRow {
  country: string;
  flag: string;
  yields: Record<string, { value: number; change: number }>;
}
export interface UsMarketIndicators {
  bonds: UsBondRow[];
  yields: UsIndicator[];
  dollar: UsIndicator[];
  commodities: UsIndicator[];
  fx: UsIndicator[];
  futures: UsIndicator[];
  crypto: UsIndicator[];
}

// [심볼, 표시명, 단위]
const G_YIELDS: [string, string, string][] = [
  ["^IRX", "13주 T-Bill", "%"],
  ["2YY=F", "2년 국채", "%"],
  ["^FVX", "5년 국채", "%"],
  ["^TNX", "10년 국채", "%"],
  ["^TYX", "30년 국채", "%"],
];
const G_DOLLAR: [string, string, string][] = [
  ["DX-Y.NYB", "달러인덱스 DXY", ""],
  ["^VIX", "VIX 변동성", ""],
];
const G_COMM: [string, string, string][] = [
  ["GC=F", "금", "$"],
  ["SI=F", "은", "$"],
  ["HG=F", "구리", "$"],
  ["CL=F", "WTI 원유", "$"],
  ["BZ=F", "브렌트유", "$"],
  ["NG=F", "천연가스", "$"],
];
const G_FX: [string, string, string][] = [
  ["EURUSD=X", "EUR/USD", ""],
  ["GBPUSD=X", "GBP/USD", ""],
  ["JPY=X", "USD/JPY", ""],
  ["CNY=X", "USD/CNY", ""],
  ["KRW=X", "USD/KRW", ""],
];
const G_FUT: [string, string, string][] = [
  ["ES=F", "S&P500 선물", ""],
  ["NQ=F", "나스닥100 선물", ""],
  ["YM=F", "다우 선물", ""],
  ["RTY=F", "러셀2000 선물", ""],
];
const G_CRYPTO: [string, string, string][] = [
  ["BTC-USD", "비트코인", "$"],
  ["ETH-USD", "이더리움", "$"],
  ["XRP-USD", "리플", "$"],
  ["USDT-USD", "테더", "$"],
];

export async function usMarketIndicators(): Promise<UsMarketIndicators> {
  const all = [G_YIELDS, G_DOLLAR, G_COMM, G_FX, G_FUT, G_CRYPTO].flat();
  const rows = await yahooFinance.quote(all.map(([s]) => s));
  const list = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
  const pick = (defs: [string, string, string][]): UsIndicator[] => {
    const out: UsIndicator[] = [];
    for (const [symbol, label, unit] of defs) {
      const x = list.find((v) => v.symbol === symbol);
      const price = Number(x?.regularMarketPrice);
      if (!x || !price) continue;
      out.push({ symbol, label, price, changePct: Number(x.regularMarketChangePercent) || 0, unit });
    }
    return out;
  };
  // 국채금리는 미국만이 아니라 한국·일본·유럽까지 2/3/5/10/30년 전 구간 (네이버)
  const bondRows = await bonds().catch(() => []);
  return {
    bonds: bondRows.map((b) => ({
      country: b.country,
      flag: b.flag,
      yields: Object.fromEntries(
        Object.entries(b.yields).map(([k, v]) => [k, { value: v.value, change: v.change }]),
      ),
    })),
    yields: pick(G_YIELDS),
    dollar: pick(G_DOLLAR),
    commodities: pick(G_COMM),
    fx: pick(G_FX),
    futures: pick(G_FUT),
    crypto: pick(G_CRYPTO),
  };
}
