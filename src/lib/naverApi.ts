// 네이버 모바일 stock JSON API (로그인 불필요). 서버 전용.
// 시총상위 · 상승/하락률 상위(특징주) · 국내 지수 시세.
import { daily } from "./naver";
import { themesOf, themeByNo } from "./theme";

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

// ---- 신고가 / 신저가 (네이버 미제공 → 52주 고저 대비로 직접 판정) ----
export interface HighLowStock extends NStock {
  ref52: number; // 52주 최고(신고가) 또는 최저(신저가)
  todayExtreme: number; // 당일 고가(신고가) 또는 저가(신저가)
}

async function chunked<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/** 시총 상위 universe를 훑어 당일 고가/저가가 52주 고/저를 갱신한 종목 */
export async function highLow(
  market: Market,
  dir: "high" | "low",
  universe = 400,
): Promise<HighLowStock[]> {
  // 네이버 pageSize 상한은 100 → 페이지네이션으로 universe 확보
  const pages = Math.max(1, Math.ceil(universe / 100));
  const raw: (RawStock & { stockEndType?: string })[] = [];
  for (let p = 1; p <= pages; p++) {
    const d = await getJson(
      `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${p}&pageSize=100`,
    );
    const chunk = (d.stocks ?? []) as (RawStock & { stockEndType?: string })[];
    if (!chunk.length) break;
    raw.push(...chunk);
  }
  const list = raw
    .slice(0, universe)
    .filter((s) => (s.stockEndType ?? "stock") === "stock");
  const rows = await chunked(list, 50, async (s) => {
    try {
      const det = await getJson(`https://m.stock.naver.com/api/stock/${s.itemCode}/integration`);
      const ti: Record<string, string> = {};
      for (const x of (det.totalInfos ?? []) as { code: string; value: string }[]) ti[x.code] = x.value;
      const hi52 = numSuffix(ti.highPriceOf52Weeks);
      const lo52 = numSuffix(ti.lowPriceOf52Weeks);
      const high = numSuffix(ti.highPrice);
      const low = numSuffix(ti.lowPrice);
      const hit =
        dir === "high"
          ? hi52 > 0 && high > 0 && high >= hi52
          : lo52 > 0 && low > 0 && low <= lo52;
      if (!hit) return null;
      return {
        ...mapStock(s),
        ref52: dir === "high" ? hi52 : lo52,
        todayExtreme: dir === "high" ? high : low,
      } as HighLowStock;
    } catch {
      return null;
    }
  });
  const out = rows.filter((x): x is HighLowStock => !!x);
  // 신고가는 상승률 높은 순, 신저가는 하락률 큰 순
  out.sort((a, b) => (dir === "high" ? b.changePct - a.changePct : a.changePct - b.changePct));
  return out;
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
  foreignRate: number; // 외국인 보유비중 %
  threeMo: number;
  d1: number;
  w1: number;
  m1: number;
  m3: number;
  m6: number;
  y1: number;
  maSignal: MaSignal; // 골든크로스 / 정배열 / 역배열 / 데드크로스
  crossDays: number; // 최근 교차 이후 경과 거래일 (없으면 -1)
  rank: number; // 비교군 내 순위
  trendScore: number; // 최근 주가흐름 성적 (0~100)
  trendGrade: string; // A+ ~ D
  score: number;
  parts: {
    재무: number;
    성장: number;
    밸류: number;
    애널: number;
    모멘텀: number;
    배당: number;
    외국인: number;
  };
}
export interface SectorGroupOption {
  key: string; // "industry" | "theme:614"
  name: string;
  count: number;
}
export interface SectorRank {
  industryName: string;
  groupKey: string;
  groups: SectorGroupOption[]; // 업종 + 소속 테마(세부 섹터)
  total: number;
  rank: number; // 검색종목 순위
  ranked: ScoredStock[]; // 상위 10
  target?: ScoredStock;
}

/**
 * 방향(hi=클수록 좋음, lo=작을수록 좋음) 정규화 스케일러.
 * 기준(min/max)은 '비교군 고정 멤버'로만 만든다 — 검색한 종목이 무엇이냐에 따라
 * 기준이 흔들려 같은 업종인데 순위가 매번 달라지는 것을 막기 위함.
 * 기준 밖의 값(검색 종목이 최댓값을 넘는 등)은 0~1로 클램프.
 */
function dimScaler(baseVals: number[], dir: "hi" | "lo"): (v: number) => number {
  const valid = baseVals.filter((v) => Number.isFinite(v));
  if (!valid.length) return () => 0.5;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  return (v: number) => {
    if (!Number.isFinite(v)) return 0;
    const t = Math.min(1, Math.max(0, (v - min) / range));
    return dir === "hi" ? t : 1 - t;
  };
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

// 우선주(예: "삼성전자우", "현대차2우B") 감지 — 대응하는 보통주 이름이 같은 목록에 있을 때만 우선주로 판정
function isPreferredDuplicate(name: string, commonNames: Set<string>): boolean {
  const m = name.match(/^(.+?)\d*우[A-Z]?$/);
  return !!m && commonNames.has(m[1]);
}

// ---- 이동평균 교차 (골든크로스/데드크로스) ----
export type MaSignal = "골든크로스" | "정배열" | "역배열" | "데드크로스" | "-";

function movingAvg(closes: number[], p: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= p) sum -= closes[i - p];
    out.push(i >= p - 1 ? sum / p : null);
  }
  return out;
}

/**
 * 20일선과 60일선의 교차 상태.
 * 골든크로스 = 최근 20거래일 내 20일선이 60일선을 상향 돌파(가장 강한 신호)
 * 정배열 = 20일선이 60일선 위 / 역배열 = 아래 / 데드크로스 = 최근 하향 돌파
 */
function maCross(closes: number[]): { signal: MaSignal; days: number; score: number } {
  if (closes.length < 61) return { signal: "-", days: -1, score: 0.5 };
  const s = movingAvg(closes, 20);
  const l = movingAvg(closes, 60);
  const above = (i: number) => s[i] !== null && l[i] !== null && (s[i] as number) > (l[i] as number);
  const last = closes.length - 1;
  // 가장 최근 교차 시점 찾기
  let cross = -1;
  for (let i = last; i > 0; i--) {
    if (s[i] === null || l[i] === null || s[i - 1] === null || l[i - 1] === null) break;
    if (above(i) !== above(i - 1)) {
      cross = last - i;
      break;
    }
  }
  const up = above(last);
  const fresh = cross >= 0 && cross <= 20;
  if (up) {
    // 갓 만들어진 골든크로스일수록 가점 ↑
    return {
      signal: fresh ? "골든크로스" : "정배열",
      days: cross,
      score: fresh ? 1 - (cross / 20) * 0.2 : 0.7,
    };
  }
  return {
    signal: fresh ? "데드크로스" : "역배열",
    days: cross,
    score: fresh ? 0.05 : 0.25,
  };
}

// 주가흐름 성적 등급 (0~100 → A+ ~ D)
function gradeOf(s: number): string {
  if (s >= 85) return "A+";
  if (s >= 70) return "A";
  if (s >= 55) return "B";
  if (s >= 40) return "C";
  return "D";
}

/** 그룹(업종 또는 테마)의 구성종목 원본 */
async function groupMembers(
  code: string,
  detail: StockDetail,
  groupKey: string,
): Promise<{ name: string; raw: Record<string, string>[] }> {
  if (groupKey.startsWith("theme:")) {
    const g = await themeByNo(groupKey.slice(6));
    if (g) {
      // 테마 구성종목의 시세/시총은 업종 API로는 못 얻으므로 종목별 basic 조회
      const raw = await Promise.all(
        g.codes.map(async (c) => {
          try {
            const b = await getJson(`https://m.stock.naver.com/api/stock/${c}/basic`);
            return {
              itemCode: c,
              stockName: b.stockName ?? c,
              stockEndType: b.stockEndType ?? "stock",
              marketValueRaw: "",
              threeMonthEarningRate: "N/A",
            } as Record<string, string>;
          } catch {
            return null;
          }
        }),
      );
      return { name: g.name, raw: raw.filter((x): x is Record<string, string> => !!x) };
    }
  }
  const ind = await getJson(
    `https://m.stock.naver.com/api/stocks/industry/${detail.industryCode}?page=1&pageSize=100`,
  );
  return { name: ind.groupInfo?.name ?? "", raw: (ind.stocks ?? []) as Record<string, string>[] };
}

export async function sectorRank(code: string, groupKey = "industry"): Promise<SectorRank> {
  const detail = await stockDetail(code);
  const [{ name: groupName, raw }, themes] = await Promise.all([
    groupMembers(code, detail, groupKey),
    themesOf(code).catch(() => []),
  ]);
  // 선택 가능한 그룹: 업종(기본) + 소속 테마(더 세분화된 섹터)
  const industryName =
    groupKey === "industry"
      ? groupName
      : ((await getJson(
          `https://m.stock.naver.com/api/stocks/industry/${detail.industryCode}?page=1&pageSize=1`,
        ).then((d) => d.groupInfo?.name ?? "")) as string);
  const groups: SectorGroupOption[] = [
    { key: "industry", name: industryName || "업종", count: 0 },
    ...themes.slice(0, 8).map((t) => ({ key: `theme:${t.no}`, name: t.name, count: t.codes.length })),
  ];

  const commonNames = new Set(raw.map((s) => s.stockName));
  // 우선주는 보통주와 재무는 동일하지만 애널리스트 목표주가(컨센서스)를 보통주 것을 그대로
  // 물려받아 상승여력이 부풀려짐 → 검색한 종목이 아닌 한 랭킹 후보에서 제외
  const members = raw
    .filter((s) => s.itemCode === code || !isPreferredDuplicate(s.stockName, commonNames))
    .map((s) => ({
      code: s.itemCode,
      name: s.stockName,
      cap: n(s.marketValueRaw ?? s.marketValue),
      threeMo: Number(s.threeMonthEarningRate) || 0,
    }));
  members.sort((a, b) => b.cap - a.cap);
  // 비교군 고정 멤버 = 시총 상위 15 (검색 종목과 무관하게 항상 동일)
  const base = members.slice(0, 15);
  const top = [...base];
  // 검색한 종목은 시총 상위 밖이거나 해당 테마 소속이 아니어도 반드시 평가에 포함
  const isExtra = !!code && !base.some((m) => m.code === code);
  if (isExtra) {
    top.push(
      members.find((m) => m.code === code) ?? {
        code,
        name: detail.name,
        cap: detail.marketCap * 1e8,
        threeMo: 0,
      },
    );
  }
  // 종목별 상세 + 연간재무 + 일봉(장기 수익률) 병렬 수집
  const enriched = await Promise.all(
    top.map(async (m) => {
      const [dd, finA, bars] = await Promise.all([
        stockDetail(m.code).catch(() => null),
        financials(m.code, "annual").catch(() => null),
        daily(m.code, 270).catch(() => []),
      ]);
      const fm = finA
        ? finMetrics(finA)
        : { roe: NaN, debt: NaN, opMargin: NaN, growth: NaN };
      const closes = bars.map((b) => b.close).filter((c) => c > 0);
      const sr = {
        ...shortReturns(closes),
        m3: closes.length > 1 ? pctBack(closes, 60) : 0,
        m6: closes.length > 1 ? pctBack(closes, 120) : 0,
        y1: closes.length > 1 ? pctBack(closes, 245) : 0,
      };
      // 테마 그룹은 시총/3개월수익률이 비어 있으므로 상세·일봉에서 보완
      const cap = m.cap || (dd?.marketCap ?? 0) * 1e8;
      const threeMo = m.threeMo || sr.m3;
      const cross = maCross(closes);
      return {
        ...m,
        cap,
        threeMo,
        per: dd?.per ?? 0,
        pbr: dd?.pbr ?? 0,
        eps: dd?.eps ?? 0,
        div: dd?.dividendYield ?? 0,
        upside: dd?.upside ?? 0,
        foreignRate: numSuffix(dd?.foreignRate),
        cross,
        ...fm,
        ...sr,
      };
    }),
  );

  // 정규화 기준은 고정 멤버(base)로만 산출 → 어떤 종목을 검색해도 그룹 순위가 동일
  type E = (typeof enriched)[number];
  const baseRows = enriched.filter((e) => base.some((m) => m.code === e.code));
  const mk = (pick: (e: E) => number, dir: "hi" | "lo") => {
    const s = dimScaler(baseRows.map(pick), dir);
    return enriched.map((e) => s(pick(e)));
  };
  const roeN = mk((e) => e.roe, "hi");
  const debtN = mk((e) => e.debt, "lo");
  const opN = mk((e) => e.opMargin, "hi");
  const growthN = mk((e) => e.growth, "hi");
  const perN = mk((e) => (e.per > 0 ? e.per : NaN), "lo");
  const pbrN = mk((e) => (e.pbr > 0 ? e.pbr : NaN), "lo");
  const epsN = mk((e) => (e.eps > 0 ? e.eps : NaN), "hi");
  const upsideN = mk((e) => e.upside, "hi");
  const divN = mk((e) => e.div, "hi");
  const capN = mk((e) => Math.log10(Math.max(e.cap, 1)), "hi");
  const frgnN = mk((e) => (e.foreignRate > 0 ? e.foreignRate : NaN), "hi");
  // 최근 주가흐름 성적표: 기간수익률(75%) + 이동평균 교차 신호(25%)
  const w1N = mk((e) => e.w1, "hi");
  const m1N = mk((e) => e.m1, "hi");
  const m3N = mk((e) => e.m3 || e.threeMo, "hi");
  const m6N = mk((e) => e.m6, "hi");
  const y1N = mk((e) => e.y1, "hi");
  const trend = enriched.map(
    (e, i) =>
      (w1N[i] * 0.15 + m1N[i] * 0.3 + m3N[i] * 0.25 + m6N[i] * 0.2 + y1N[i] * 0.1) * 0.75 +
      e.cross.score * 0.25,
  );

  const scored: ScoredStock[] = enriched.map((e, i) => {
    const 재무 = roeN[i] * 0.5 + debtN[i] * 0.3 + opN[i] * 0.2;
    const 성장 = growthN[i];
    const 밸류 = perN[i] * 0.4 + pbrN[i] * 0.35 + epsN[i] * 0.25;
    const 애널 = upsideN[i];
    const 모멘텀 = trend[i]; // 주가흐름 성적표(수익률+골든크로스)를 모멘텀 점수로 사용
    const 배당 = divN[i];
    const 외국인 = frgnN[i];
    const score = Math.round(
      (재무 * 0.27 +
        모멘텀 * 0.18 +
        밸류 * 0.18 +
        성장 * 0.15 +
        애널 * 0.1 +
        외국인 * 0.06 +
        배당 * 0.04 +
        capN[i] * 0.02) *
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
      foreignRate: e.foreignRate,
      threeMo: e.threeMo,
      d1: e.d1,
      w1: e.w1,
      m1: e.m1,
      m3: e.m3,
      m6: e.m6,
      y1: e.y1,
      maSignal: e.cross.signal,
      crossDays: e.cross.days,
      rank: 0, // 정렬 후 채움
      trendScore: Math.round(trend[i] * 100),
      trendGrade: gradeOf(trend[i] * 100),
      score,
      parts: {
        재무: Math.round(재무 * 100),
        성장: Math.round(성장 * 100),
        밸류: Math.round(밸류 * 100),
        애널: Math.round(애널 * 100),
        모멘텀: Math.round(모멘텀 * 100),
        배당: Math.round(배당 * 100),
        외국인: Math.round(외국인 * 100),
      },
    };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => (s.rank = i + 1));
  const target = scored.find((s) => s.code === code);
  const top10 = scored.slice(0, 10);
  // 검색한 종목이 상위 10위 밖이어도 목록 끝에 붙여 항상 보이게
  const ranked = target && !top10.some((s) => s.code === code) ? [...top10, target] : top10;
  return {
    industryName: groupName,
    groupKey,
    groups,
    total: scored.length,
    rank: target?.rank ?? 0,
    ranked,
    target,
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
