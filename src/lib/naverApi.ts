// 네이버 모바일 stock JSON API (로그인 불필요). 서버 전용.
// 시총상위 · 상승/하락률 상위(특징주) · 국내 지수 시세.
import { daily } from "./naver";
import { themesOf, themeByNo } from "./theme";
import {
  baselineScaler,
  marketBaseline,
  missingFrom,
  saveMetrics,
  MIN_SAMPLES,
  type Baseline,
  type StockMetrics,
} from "./baseline";
// 채점 규칙은 미국 증시와 공유한다 (같은 잣대로 점수를 읽을 수 있게)
import {
  dimScaler,
  finScore,
  gradeOf,
  maCross,
  periodReturns,
  totalScore,
  trendScore,
  valueScore,
  type MaSignal,
} from "./score";

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

export async function stockReturns(code: string): Promise<Returns> {
  const bars = await daily(code, 270);
  const closes = bars.map((b) => b.close).filter((c) => c > 0);
  const { d1, w1, m1, m6, y1 } = periodReturns(closes);
  return { d1, w1, m1, m6, y1 };
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
  /** 시장 전체 기준 절대점수 — 비교군을 바꿔도 변하지 않는다. 기준선이 덜 모이면 없음 */
  absScore?: number;
  parts: {
    재무: number;
    성장: number;
    밸류: number;
    모멘텀: number;
    배당: number;
    외국인: number;
    시총: number;
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
  /** 절대점수 기준선 상태 */
  baseline?: { ready: boolean; samples: number; need: number };
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



// 주가흐름 성적 등급 (0~100 → A+ ~ D)

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
  // 업종 목록은 100건씩 끊어 오고 시총순 정렬도 아니다.
  // 1페이지만 읽으면 대형주가 뒤 페이지로 밀려 비교군에서 통째로 빠지므로 전 페이지를 모은다.
  const url = (page: number) =>
    `https://m.stock.naver.com/api/stocks/industry/${detail.industryCode}?page=${page}&pageSize=100`;
  const first = await getJson(url(1));
  const total = Number(first.totalCount) || 0;
  const pages = Math.min(Math.ceil(total / 100), 5); // 안전장치: 최대 500종목
  const rest = await Promise.all(
    Array.from({ length: Math.max(pages - 1, 0) }, (_, i) =>
      getJson(url(i + 2)).catch(() => ({ stocks: [] })),
    ),
  );
  const raw = [first, ...rest].flatMap((p) => (p.stocks ?? []) as Record<string, string>[]);
  return { name: first.groupInfo?.name ?? "", raw };
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
  // 다른 종목에서 고른 비교군을 그대로 유지할 수 있게, 현재 선택된 그룹이 목록에 없으면 추가
  if (!groups.some((g) => g.key === groupKey)) {
    groups.push({ key: groupKey, name: groupName || groupKey, count: raw.length });
  }

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
      const sr = periodReturns(closes);
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
  const divN = mk((e) => e.div, "hi");
  const capN = mk((e) => Math.log10(Math.max(e.cap, 1)), "hi");
  const frgnN = mk((e) => (e.foreignRate > 0 ? e.foreignRate : NaN), "hi");
  // 최근 주가흐름 성적표: 기간수익률(75%) + 이동평균 교차 신호(25%)
  const w1N = mk((e) => e.w1, "hi");
  const m1N = mk((e) => e.m1, "hi");
  const m3N = mk((e) => e.m3 || e.threeMo, "hi");
  const m6N = mk((e) => e.m6, "hi");
  const y1N = mk((e) => e.y1, "hi");
  const trend = enriched.map((e, i) =>
    trendScore({ w1: w1N[i], m1: m1N[i], m3: m3N[i], m6: m6N[i], y1: y1N[i] }, e.cross.score),
  );
  // 절대점수용 주가흐름 — 비교군 정규화 대신 수익률 자체를 0~1로 환산해 쓴다
  const pctTo01 = (v: number) => Math.min(1, Math.max(0, (v + 30) / 80)); // -30%~+50% 를 0~1로
  const rawTrend = enriched.map((e) =>
    trendScore(
      {
        w1: pctTo01(e.w1),
        m1: pctTo01(e.m1),
        m3: pctTo01(e.m3 || e.threeMo),
        m6: pctTo01(e.m6),
        y1: pctTo01(e.y1),
      },
      e.cross.score,
    ),
  );

  // ---- 절대점수 ----
  // 비교군과 무관하게 고정된 점수. 시장 전체 분포를 잣대로 쓴다.
  const metricsOf = (e: E, i: number): StockMetrics => ({
    roe: e.roe,
    debt: e.debt,
    opMargin: e.opMargin,
    growth: e.growth,
    per: e.per > 0 ? e.per : NaN,
    pbr: e.pbr > 0 ? e.pbr : NaN,
    eps: e.eps > 0 ? e.eps : NaN,
    div: e.div,
    cap: Math.log10(Math.max(e.cap, 1)),
    foreign: e.foreignRate > 0 ? e.foreignRate : NaN,
    // 주가흐름은 원자료가 아니라 이미 합쳐진 성적이라 그대로 보관한다
    trend: rawTrend[i],
  });
  // 이번에 조회한 종목들의 지표는 기준선 재료로 모아 둔다
  await Promise.all(enriched.map((e, i) => saveMetrics(e.code, metricsOf(e, i))));
  const mkt = await marketBaseline(await baselineUniverse().catch(() => [])).catch(
    () => ({ bounds: {}, samples: 0 }) as Baseline,
  );
  const absReady = mkt.samples >= MIN_SAMPLES;
  const absScore = (e: E, i: number): number | undefined => {
    if (!absReady) return undefined;
    const m = metricsOf(e, i);
    const S = (d: keyof StockMetrics) => {
      const f = baselineScaler(mkt, d);
      return f ? f(m[d]) : 0.5;
    };
    return totalScore({
      재무: finScore(S("roe"), S("debt"), S("opMargin")),
      밸류: valueScore(S("per"), S("pbr"), S("eps")),
      성장: S("growth"),
      시총: S("cap"),
      모멘텀: S("trend"),
      기관: S("foreign"),
      배당: S("div"),
    });
  };

  const scored: ScoredStock[] = enriched.map((e, i) => {
    const 재무 = finScore(roeN[i], debtN[i], opN[i]);
    const 성장 = growthN[i];
    const 밸류 = valueScore(perN[i], pbrN[i], epsN[i]);
    const 모멘텀 = trend[i]; // 주가흐름 성적표(수익률+골든크로스)를 모멘텀 점수로 사용
    const 배당 = divN[i];
    const 외국인 = frgnN[i];
    const 시총 = capN[i];
    const score = totalScore({ 재무, 밸류, 성장, 시총, 모멘텀, 기관: 외국인, 배당 });
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
      absScore: absScore(e, i),
      parts: {
        재무: Math.round(재무 * 100),
        성장: Math.round(성장 * 100),
        밸류: Math.round(밸류 * 100),
        모멘텀: Math.round(모멘텀 * 100),
        배당: Math.round(배당 * 100),
        외국인: Math.round(외국인 * 100),
        시총: Math.round(시총 * 100),
      },
    };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => (s.rank = i + 1));
  const target = scored.find((s) => s.code === code);
  const top10 = scored.slice(0, 10);
  // 검색한 종목이 상위 10위 밖이어도 목록 끝에 붙여 항상 보이게
  const ranked = target && !top10.some((s) => s.code === code) ? [...top10, target] : top10;
  // 기준선이 아직 덜 모였으면 이번 호출에서 조금 더 채운다.
  // 서버리스는 응답을 내보내면 곧 멈추므로 뒤로 미루지 않고 여기서 기다린다.
  if (!absReady) await fillBaseline().catch(() => {});

  return {
    industryName: groupName,
    groupKey,
    groups,
    total: scored.length,
    rank: target?.rank ?? 0,
    ranked,
    target,
    baseline: { ready: absReady, samples: mkt.samples, need: MIN_SAMPLES },
  };
}

/** 절대점수 기준선을 만들 시장 대표 종목 — 코스피·코스닥 시총 상위 */
let BASELINE_UNIVERSE: string[] = [];

async function baselineUniverse(): Promise<string[]> {
  if (BASELINE_UNIVERSE.length) return BASELINE_UNIVERSE;
  const [kp, kq] = await Promise.all([
    stockList("marketValue", "KOSPI", 70).catch(() => []),
    stockList("marketValue", "KOSDAQ", 30).catch(() => []),
  ]);
  BASELINE_UNIVERSE = [...kp, ...kq].map((s) => s.code);
  return BASELINE_UNIVERSE;
}

/** 기준선 재료를 조금씩 채운다 — 한 번에 다 받으면 응답이 너무 느려진다 */
async function fillBaseline(perCall = 6) {
  const universe = await baselineUniverse();
  const todo = await missingFrom(universe, perCall);
  for (const code of todo) {
    try {
      const [dd, finA, bars] = await Promise.all([
        stockDetail(code).catch(() => null),
        financials(code, "annual").catch(() => null),
        daily(code, 270).catch(() => []),
      ]);
      const fm = finA ? finMetrics(finA) : { roe: NaN, debt: NaN, opMargin: NaN, growth: NaN };
      const closes = bars.map((b) => b.close).filter((c) => c > 0);
      const r = periodReturns(closes);
      const pct01 = (v: number) => Math.min(1, Math.max(0, (v + 30) / 80));
      await saveMetrics(code, {
        ...fm,
        per: dd?.per && dd.per > 0 ? dd.per : NaN,
        pbr: dd?.pbr && dd.pbr > 0 ? dd.pbr : NaN,
        eps: dd?.eps && dd.eps > 0 ? dd.eps : NaN,
        div: dd?.dividendYield ?? 0,
        cap: Math.log10(Math.max((dd?.marketCap ?? 0) * 1e8, 1)),
        foreign: numSuffix(dd?.foreignRate),
        trend: trendScore(
          {
            w1: pct01(r.w1),
            m1: pct01(r.m1),
            m3: pct01(r.m3),
            m6: pct01(r.m6),
            y1: pct01(r.y1),
          },
          maCross(closes).score,
        ),
      });
    } catch {
      /* 한 종목 실패는 넘어간다 */
    }
  }
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
  /** 네이버 업종 코드 — 구성종목 조회에 쓴다 */
  code: string;
  name: string;
  changeRate: number;
  rise: number;
  fall: number;
  steady: number;
  count: number;
}

interface RawGroup {
  no?: number;
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
    code: String(g.no ?? ""),
    name: g.name,
    changeRate: Number(g.changeRate) || 0,
    rise: g.riseCount || 0,
    fall: g.fallCount || 0,
    steady: g.steadyCount || 0,
    count: g.totalCount || 0,
  }));
}


/** 업종 구성종목 — 시총 상위 순. 섹터 강약에서 관련 종목을 펼쳐볼 때 쓴다. */
export async function sectorStocks(code: string, limit = 8): Promise<
  { code: string; name: string; changeRate: number; cap: number }[]
> {
  const d = await getJson(
    `https://m.stock.naver.com/api/stocks/industry/${code}?page=1&pageSize=100`,
  );
  const rows = ((d.stocks ?? []) as Record<string, string>[]).map((x) => ({
    code: String(x.itemCode ?? ""),
    name: String(x.stockName ?? ""),
    changeRate: Number(String(x.fluctuationsRatio ?? "").replace(/,/g, "")) || 0,
    cap: n(x.marketValueRaw ?? x.marketValue),
  }));
  return rows
    .filter((r) => r.code)
    .sort((a, b) => b.cap - a.cap)
    .slice(0, limit);
}
