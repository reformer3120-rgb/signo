// 네이버 모바일 stock JSON API (로그인 불필요). 서버 전용.
// 시총상위 · 상승/하락률 상위(특징주) · 국내 지수 시세.
import { daily } from "./naver";

const H = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1",
  Referer: "https://m.stock.naver.com/",
  Accept: "application/json",
};

async function getJson(url: string) {
  const r = await fetch(url, { headers: H, cache: "no-store" });
  if (!r.ok) throw new Error(`naver ${r.status}`);
  return r.json();
}

const n = (s?: string | number) =>
  s === undefined || s === null ? 0 : Number(String(s).replace(/,/g, "")) || 0;

export type Market = "KOSPI" | "KOSDAQ";
export type Category = "marketValue" | "up" | "down";

export interface NStock {
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  tradingValue: string; // "9조 1,185억원"
  marketCap: string; // "1,286조원"
}

interface RawStock {
  itemCode: string;
  stockName: string;
  closePrice: string;
  compareToPreviousClosePrice: string;
  fluctuationsRatio: string;
  accumulatedTradingVolume: string;
  accumulatedTradingValueKrwHangeul?: string;
  marketValueHangeul?: string;
}

function mapStock(s: RawStock): NStock {
  return {
    code: s.itemCode,
    name: s.stockName,
    price: n(s.closePrice),
    change: n(s.compareToPreviousClosePrice),
    changePct: Number(s.fluctuationsRatio) || 0,
    volume: n(s.accumulatedTradingVolume),
    tradingValue: s.accumulatedTradingValueKrwHangeul ?? "",
    marketCap: s.marketValueHangeul ?? "",
  };
}

/** 카테고리별 종목 리스트 (시총상위/상승률/하락률) */
export async function stockList(category: Category, market: Market, size = 20): Promise<NStock[]> {
  const d = await getJson(
    `https://m.stock.naver.com/api/stocks/${category}/${market}?page=1&pageSize=${size}`,
  );
  return (d.stocks ?? []).map(mapStock);
}

export interface NIndex {
  name: string;
  price: number;
  change: number;
  changePct: number;
}

/** 국내 지수 시세 (코스피/코스닥) */
export async function indexQuote(market: Market): Promise<NIndex> {
  const d = await getJson(`https://m.stock.naver.com/api/index/${market}/basic`);
  return {
    name: market === "KOSPI" ? "코스피" : "코스닥",
    price: n(d.closePrice),
    change: n(d.compareToPreviousClosePrice),
    changePct: Number(d.fluctuationsRatio) || 0,
  };
}

export async function indices(): Promise<NIndex[]> {
  return Promise.all([indexQuote("KOSPI"), indexQuote("KOSDAQ")]);
}

// ---- 국채 금리 (네이버 marketindex/bond, 4개국 × 5만기) ----
export interface BondCell {
  value: number;
  change: number;
  changePct: number;
}
export interface BondRow {
  country: string;
  flag: string;
  yields: Record<string, BondCell>;
}

const BOND_COUNTRIES: [string, string, string][] = [
  ["한국", "🇰🇷", "KR"],
  ["일본", "🇯🇵", "JP"],
  ["미국", "🇺🇸", "US"],
  ["유럽", "🇪🇺", "EU"],
];
const BOND_MATS = ["2", "3", "5", "10", "30"];

async function bondCell(code: string): Promise<BondCell | null> {
  try {
    const d = await getJson(`https://api.stock.naver.com/marketindex/bond/${code}`);
    return {
      value: n(d.closePrice as string),
      change: n(d.fluctuations as string),
      changePct: Number(d.fluctuationsRatio) || 0,
    };
  } catch {
    return null;
  }
}

export async function bonds(): Promise<BondRow[]> {
  return Promise.all(
    BOND_COUNTRIES.map(async ([country, flag, c]) => {
      const cells = await Promise.all(
        BOND_MATS.map(async (m) => [`${m}Y`, await bondCell(`${c}${m}YT=RR`)] as const),
      );
      const yields: Record<string, BondCell> = {};
      for (const [k, v] of cells) if (v) yields[k] = v;
      return { country, flag, yields };
    }),
  );
}

// ---- 종목 장기 투자자 수급 (개인/외국인/기관, m.stock trend 역페이지네이션) ----
export interface TrendRow {
  date: string;
  개인: number;
  외국인: number;
  기관: number;
}

function prevDay(ymd: string): string {
  const dt = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}`;
}

export async function stockTrendLong(code: string, days: number): Promise<TrendRow[]> {
  const out: TrendRow[] = [];
  const seen = new Set<string>();
  let bizdate = "";
  for (let i = 0; i < 30 && out.length < days; i++) {
    const url = `https://m.stock.naver.com/api/stock/${code}/trend${bizdate ? `?bizdate=${bizdate}` : ""}`;
    let arr: Record<string, string>[];
    try {
      arr = (await getJson(url)) as unknown as Record<string, string>[];
    } catch {
      break;
    }
    if (!Array.isArray(arr) || !arr.length) break;
    let added = 0;
    for (const r of arr) {
      if (seen.has(r.bizdate)) continue;
      seen.add(r.bizdate);
      out.push({
        date: r.bizdate,
        개인: n(r.individualPureBuyQuant),
        외국인: n(r.foreignerPureBuyQuant),
        기관: n(r.organPureBuyQuant),
      });
      added++;
    }
    if (added === 0) break;
    bizdate = prevDay(arr[arr.length - 1].bizdate);
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out.slice(0, days);
}

// ---- 지수(시장) 투자자 수급 : 개인/외국인/기관 순매수 (억원) ----
export interface IndexTrend {
  date: string;
  personal: number;
  foreign: number;
  institutional: number;
}

export async function indexTrend(symbol: string): Promise<IndexTrend> {
  const d = await getJson(`https://m.stock.naver.com/api/index/${symbol}/trend`);
  return {
    date: d.bizdate ?? "",
    personal: n(d.personalValue as string),
    foreign: n(d.foreignValue as string),
    institutional: n(d.institutionalValue as string),
  };
}

export interface Futures {
  futurePrice: number;
  futureChangePct: number;
  spotPrice: number; // KOSPI200 현물
  spotChangePct: number;
  basis: number; // 선물 - 현물
}

/** 코스피200 선물 + 현물(KOSPI200) + 베이시스 */
export async function futures(): Promise<Futures> {
  const [fut, spot] = await Promise.all([
    getJson("https://m.stock.naver.com/api/index/FUT/basic"),
    getJson("https://m.stock.naver.com/api/index/KPI200/basic"),
  ]);
  const f = n(fut.closePrice);
  const s = n(spot.closePrice);
  return {
    futurePrice: f,
    futureChangePct: Number(fut.fluctuationsRatio) || 0,
    spotPrice: s,
    spotChangePct: Number(spot.fluctuationsRatio) || 0,
    basis: +(f - s).toFixed(2),
  };
}

// ---- 종목 상세 (integration) ----
export interface StockDetail {
  code: string;
  name: string;
  industryCode: string;
  price: number; // 현재가(전일종가)
  per: number;
  pbr: number;
  eps: number;
  bps: number;
  cnsPer: number;
  marketCap: number; // 억원
  marketCapText: string; // "1,254조 9,859억"
  foreignRate: string;
  high52: number;
  low52: number;
  dividendYield: number;
  priceTarget: number; // 애널리스트 목표주가 평균
  upside: number; // 목표주가 상승여력 %
  recommMean: number; // 투자의견 평균(1매도~5매수)
}

// 접미사(배/원/%/조억) 제거 파서
const numSuffix = (s?: string) =>
  s ? parseFloat(String(s).replace(/,/g, "").replace(/[^\d.]/g, "")) || 0 : 0;
// 조/억 → 억 단위
const eok = (s?: string): number => {
  if (!s) return 0;
  let t = 0;
  const jo = s.match(/([\d,]+)\s*조/);
  const e = s.match(/([\d,]+)\s*억/);
  if (jo) t += Number(jo[1].replace(/,/g, "")) * 10000;
  if (e) t += Number(e[1].replace(/,/g, ""));
  return jo || e ? t : numSuffix(s);
};

export async function stockDetail(code: string): Promise<StockDetail> {
  const d = await getJson(`https://m.stock.naver.com/api/stock/${code}/integration`);
  const ti: Record<string, string> = {};
  for (const x of (d.totalInfos ?? []) as { code: string; value: string }[]) ti[x.code] = x.value;
  const price = numSuffix(ti.lastClosePrice);
  const priceTarget = n(d.consensusInfo?.priceTargetMean);
  const recommMean = Number(d.consensusInfo?.recommMean) || 0;
  return {
    code,
    name: d.stockName ?? code,
    industryCode: String(d.industryCode ?? ""),
    price,
    per: numSuffix(ti.per),
    pbr: numSuffix(ti.pbr),
    eps: numSuffix(ti.eps),
    bps: numSuffix(ti.bps),
    cnsPer: numSuffix(ti.cnsPer),
    marketCap: eok(ti.marketValue),
    marketCapText: ti.marketValue ?? "",
    foreignRate: ti.foreignRate ?? "",
    high52: numSuffix(ti.highPriceOf52Weeks),
    low52: numSuffix(ti.lowPriceOf52Weeks),
    dividendYield: numSuffix(ti.dividendYieldRatio),
    priceTarget,
    upside: price > 0 && priceTarget > 0 ? +(((priceTarget - price) / price) * 100).toFixed(1) : 0,
    recommMean,
  };
}

// ---- 재무제표 (finance/annual) ----
export interface Financials {
  periods: { title: string; cns: boolean }[];
  rows: { title: string; values: (string | null)[] }[];
}

export async function financials(
  code: string,
  period: "annual" | "quarter" = "annual",
): Promise<Financials> {
  const d = await getJson(`https://m.stock.naver.com/api/stock/${code}/finance/${period}`);
  const fi = d.financeInfo ?? {};
  const tr = (fi.trTitleList ?? []) as { title: string; key: string; isConsensus: string }[];
  const periods = tr.map((t) => ({ title: t.title, cns: t.isConsensus === "Y" }));
  const rows = ((fi.rowList ?? []) as { title: string; columns: Record<string, { value: string }> }[]).map(
    (r) => ({ title: r.title, values: tr.map((t) => r.columns?.[t.key]?.value ?? null) }),
  );
  return { periods, rows };
}

// ---- 종목 뉴스 ----
export interface NewsItem {
  title: string;
  office: string;
  datetime: string;
  url: string;
}

export async function stockNews(code: string, size = 12): Promise<NewsItem[]> {
  const groups = await getJson(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=${size}`);
  const out: NewsItem[] = [];
  for (const g of (Array.isArray(groups) ? groups : []) as { items: Record<string, string>[] }[]) {
    for (const it of g.items ?? []) {
      out.push({
        title: it.title,
        office: it.officeName,
        datetime: it.datetime,
        url: `https://n.news.naver.com/article/${it.officeId}/${it.articleId}`,
      });
    }
  }
  return out.slice(0, size);
}

// ---- 기간별 수익률 (일봉 종가로 계산) ----
export interface Returns {
  d1: number;
  w1: number;
  m1: number;
  m6: number;
  y1: number;
}

// 종가 배열(오름차순)에서 n거래일 전 대비 수익률
function pctBack(closes: number[], back: number): number {
  const last = closes[closes.length - 1];
  const idx = closes.length - 1 - back;
  const base = idx >= 0 ? closes[idx] : closes[0];
  return base > 0 ? +(((last - base) / base) * 100).toFixed(2) : 0;
}

export async function stockReturns(code: string): Promise<Returns> {
  const bars = await daily(code, 270);
  const closes = bars.map((b) => b.close).filter((c) => c > 0);
  if (closes.length < 2) return { d1: 0, w1: 0, m1: 0, m6: 0, y1: 0 };
  return {
    d1: pctBack(closes, 1),
    w1: pctBack(closes, 5),
    m1: pctBack(closes, 20),
    m6: pctBack(closes, 120),
    y1: pctBack(closes, 245),
  };
}

// 종가 배열에서 1일/1주/1달만 (섹터 멤버용, 짧은 일봉)
function shortReturns(closes: number[]): { d1: number; w1: number; m1: number } {
  if (closes.length < 2) return { d1: 0, w1: 0, m1: 0 };
  return { d1: pctBack(closes, 1), w1: pctBack(closes, 5), m1: pctBack(closes, 20) };
}

// ---- 최근 수급: 어느 주체가 매수 우위인가 ----
export interface InvestorBias {
  days: number;
  개인: number; // 순매수 합(주)
  외국인: number;
  기관: number;
  leader: "개인" | "외국인" | "기관" | "-"; // 최근 매수 우위 주체
  today?: TrendRow; // 당일 실시간
}

export async function investorBias(code: string, days = 5): Promise<InvestorBias> {
  const rows = await stockTrendLong(code, days);
  const sum = { 개인: 0, 외국인: 0, 기관: 0 };
  for (const r of rows) {
    sum.개인 += r.개인;
    sum.외국인 += r.외국인;
    sum.기관 += r.기관;
  }
  const entries: [InvestorBias["leader"], number][] = [
    ["개인", sum.개인],
    ["외국인", sum.외국인],
    ["기관", sum.기관],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const leader = entries[0][1] > 0 ? entries[0][0] : "-";
  return { days: rows.length, ...sum, leader, today: rows[0] };
}

// ---- 섹터 종합평가 (같은 업종 상위종목 점수화) ----
export interface ScoredStock {
  code: string;
  name: string;
  marketCap: number;
  per: number;
  pbr: number;
  div: number;
  roe: number;
  debt: number; // 부채비율
  growth: number; // 매출·영익 성장 평균 %
  upside: number; // 애널리스트 목표주가 상승여력 %
  threeMo: number;
  d1: number;
  w1: number;
  m1: number;
  score: number;
  parts: { 재무: number; 성장: number; 밸류: number; 애널: number; 모멘텀: number; 배당: number };
}
export interface SectorRank {
  industryName: string;
  total: number;
  rank: number; // 검색종목 순위
  ranked: ScoredStock[]; // 상위 10
  target?: ScoredStock;
}

// 방향(hi=클수록 좋음, lo=작을수록 좋음) 정규화. 결측(NaN)은 최저(0).
function scoreDim(vals: number[], dir: "hi" | "lo"): number[] {
  const valid = vals.filter((v) => Number.isFinite(v));
  if (!valid.length) return vals.map(() => 0.5);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  return vals.map((v) => {
    if (!Number.isFinite(v)) return 0;
    const t = (v - min) / range;
    return dir === "hi" ? t : 1 - t;
  });
}

const avgFinite = (xs: number[]) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
};

// 재무제표(연간)에서 최근 실적 지표 추출
function finMetrics(fin: Financials) {
  const series = (title: string): number[] => {
    const r = fin.rows.find((x) => x.title === title);
    if (!r) return [];
    const out: number[] = [];
    fin.periods.forEach((p, i) => {
      if (p.cns) return; // 추정치 제외
      const v = r.values[i];
      if (v == null) return;
      const num = Number(String(v).replace(/,/g, ""));
      if (Number.isFinite(num)) out.push(num);
    });
    return out; // 과거→최근 순
  };
  const last = (a: number[]) => (a.length ? a[a.length - 1] : NaN);
  const yoy = (a: number[]) =>
    a.length >= 2 && a[a.length - 2] > 0
      ? ((a[a.length - 1] - a[a.length - 2]) / Math.abs(a[a.length - 2])) * 100
      : NaN;
  return {
    roe: last(series("ROE")),
    debt: last(series("부채비율")),
    opMargin: last(series("영업이익률")),
    growth: avgFinite([yoy(series("매출액")), yoy(series("영업이익"))]),
  };
}

export async function sectorRank(code: string): Promise<SectorRank> {
  const detail = await stockDetail(code);
  const ind = await getJson(
    `https://m.stock.naver.com/api/stocks/industry/${detail.industryCode}?page=1&pageSize=100`,
  );
  const raw = (ind.stocks ?? []) as Record<string, string>[];
  const members = raw.map((s) => ({
    code: s.itemCode,
    name: s.stockName,
    cap: n(s.marketValueRaw ?? s.marketValue),
    threeMo: Number(s.threeMonthEarningRate) || 0,
  }));
  members.sort((a, b) => b.cap - a.cap);
  const top = members.slice(0, 15);
  if (code && !top.find((m) => m.code === code)) {
    const me = members.find((m) => m.code === code);
    if (me) top.push(me);
  }
  // 종목별 상세 + 연간재무 + 최근 일봉(수익률) 병렬 수집
  const enriched = await Promise.all(
    top.map(async (m) => {
      const [dd, finA, bars] = await Promise.all([
        stockDetail(m.code).catch(() => null),
        financials(m.code, "annual").catch(() => null),
        daily(m.code, 30).catch(() => []),
      ]);
      const fm = finA
        ? finMetrics(finA)
        : { roe: NaN, debt: NaN, opMargin: NaN, growth: NaN };
      const sr = shortReturns(bars.map((b) => b.close).filter((c) => c > 0));
      return {
        ...m,
        per: dd?.per ?? 0,
        pbr: dd?.pbr ?? 0,
        div: dd?.dividendYield ?? 0,
        upside: dd?.upside ?? 0,
        ...fm,
        ...sr,
      };
    }),
  );

  // 정규화 차원들
  const roeN = scoreDim(enriched.map((e) => e.roe), "hi");
  const debtN = scoreDim(enriched.map((e) => e.debt), "lo");
  const opN = scoreDim(enriched.map((e) => e.opMargin), "hi");
  const growthN = scoreDim(enriched.map((e) => e.growth), "hi");
  const perN = scoreDim(enriched.map((e) => (e.per > 0 ? e.per : NaN)), "lo");
  const pbrN = scoreDim(enriched.map((e) => (e.pbr > 0 ? e.pbr : NaN)), "lo");
  const upsideN = scoreDim(enriched.map((e) => e.upside), "hi");
  const m1N = scoreDim(enriched.map((e) => e.m1), "hi");
  const threeMoN = scoreDim(enriched.map((e) => e.threeMo), "hi");
  const divN = scoreDim(enriched.map((e) => e.div), "hi");
  const capN = scoreDim(enriched.map((e) => Math.log10(Math.max(e.cap, 1))), "hi");

  const scored: ScoredStock[] = enriched.map((e, i) => {
    const 재무 = roeN[i] * 0.5 + debtN[i] * 0.3 + opN[i] * 0.2;
    const 성장 = growthN[i];
    const 밸류 = perN[i] * 0.5 + pbrN[i] * 0.5;
    const 애널 = upsideN[i];
    const 모멘텀 = m1N[i] * 0.5 + threeMoN[i] * 0.5;
    const 배당 = divN[i];
    const score = Math.round(
      (재무 * 0.28 + 성장 * 0.18 + 밸류 * 0.15 + 애널 * 0.15 + 모멘텀 * 0.12 + 배당 * 0.07 + capN[i] * 0.05) *
        100,
    );
    return {
      code: e.code,
      name: e.name,
      marketCap: e.cap,
      per: e.per,
      pbr: e.pbr,
      div: e.div,
      roe: Number.isFinite(e.roe) ? +e.roe.toFixed(1) : 0,
      debt: Number.isFinite(e.debt) ? +e.debt.toFixed(0) : 0,
      growth: Number.isFinite(e.growth) ? +e.growth.toFixed(1) : 0,
      upside: e.upside,
      threeMo: e.threeMo,
      d1: e.d1,
      w1: e.w1,
      m1: e.m1,
      score,
      parts: {
        재무: Math.round(재무 * 100),
        성장: Math.round(성장 * 100),
        밸류: Math.round(밸류 * 100),
        애널: Math.round(애널 * 100),
        모멘텀: Math.round(모멘텀 * 100),
        배당: Math.round(배당 * 100),
      },
    };
  });
  scored.sort((a, b) => b.score - a.score);
  const rank = scored.findIndex((s) => s.code === code) + 1;
  return {
    industryName: ind.groupInfo?.name ?? "",
    total: scored.length,
    rank,
    ranked: scored.slice(0, 10),
    target: scored.find((s) => s.code === code),
  };
}

export interface SearchItem {
  code: string;
  name: string;
  market: string;
}

interface RawAc {
  code: string;
  name: string;
  typeName?: string;
  typeCode?: string;
  category?: string;
  nationCode?: string;
}

/** 종목 키워드 검색 (전 종목, 국내만) */
export async function search(query: string): Promise<SearchItem[]> {
  if (!query.trim()) return [];
  const d = await getJson(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`);
  return ((d.items ?? []) as RawAc[])
    .filter((it) => it.category === "stock" && it.nationCode === "KOR" && /^\d{6}$/.test(it.code))
    .map((it) => ({ code: it.code, name: it.name, market: it.typeName ?? it.typeCode ?? "" }));
}

export interface Sector {
  name: string;
  changeRate: number;
  rise: number;
  fall: number;
  steady: number;
  count: number;
}

interface RawGroup {
  name: string;
  changeRate: string;
  riseCount: number;
  fallCount: number;
  steadyCount: number;
  totalCount: number;
}

/**
 * 업종(섹터)별 등락 — KRX 전체 업종 분류 (market 파라미터는 서버가 무시함).
 * 종목수(rise/fall)는 업종 중복 집계라 신뢰 불가 → changeRate만 사용.
 */
export async function sectors(): Promise<Sector[]> {
  const d = await getJson(
    `https://m.stock.naver.com/api/stocks/industry?market=KOSPI&page=1&pageSize=100`,
  );
  return ((d.groups ?? []) as RawGroup[]).map((g) => ({
    name: g.name,
    changeRate: Number(g.changeRate) || 0,
    rise: g.riseCount || 0,
    fall: g.fallCount || 0,
    steady: g.steadyCount || 0,
    count: g.totalCount || 0,
  }));
}
