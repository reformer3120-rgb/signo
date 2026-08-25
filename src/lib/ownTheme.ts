// SIGNO 자체 테마 — 분류도 편입 사유도 우리가 만든 것을 쓴다. 서버 전용.
//
// ── 왜 따로 만들었나 ───────────────────────────────────────
// 네이버에서 받아 쓰던 테마 분류·편입 사유·재무 지표는 소유자가 네이버가 아니라
// 에프앤가이드다 (네이버 금융 푸터에 명시돼 있다). 시세는 KRX 것이라 코스콤
// 계약으로 덮이지만 테마와 재무는 덮이지 않는다.
//
// 그래서 출처를 전부 갈아끼웠다.
//   테마 분류 · 편입 사유   SIGNO 가 DART 사업보고서(공공데이터)로 직접 만든 것
//   시세 · 시총 · PER      KIS (계약)
//   매출성장 · 영업이익률    DART (공공데이터) — 분기에 한 번 바뀌므로 데이터 파일에 미리 실어 둔다
//
// 분류를 어떻게 만들고 품질을 어떻게 쟀는지는 scripts/theme/ 에 있다.
// 응집도(같은 테마 종목이 같이 움직이는 정도)로 재면 에프앤가이드 분류의
// 98% 수준이다 — 우리 0.500 대 0.508, 무작위는 0.36.
import { cached, redis } from "./cache";
import { exchangeBars, hasKIS, kisGet, unifiedQuotes } from "./kis";
import raw from "@/data/themes.json";

interface RawStock {
  code: string;
  name: string;
  why: string | null;
  tags: string[];
  /** 매출액증가율 % — DART 확정 실적 (수집 시점에 굳혀 둔다) */
  growth: number | null;
  /** 영업이익률 % */
  opm: number | null;
  /** 어느 사업연도 기준인가 */
  finYear: number | null;
}
interface RawTheme {
  id: string;
  name: string;
  /** 대분류 — 화면에서 60개를 이 단위로 접는다 */
  group: string;
  hint: string;
  stocks: RawStock[];
}

const DATA = raw as unknown as {
  출처: string;
  기준: string;
  만든날: string;
  themes: RawTheme[];
};

export const THEME_SOURCE = { 표기: "SIGNO 자체 분류 · DART 사업보고서", 라이선스: true };
export const themeMeta = () => ({ 출처: DATA.출처, 기준: DATA.기준, 만든날: DATA.만든날 });

const ALL_CODES = [...new Set(DATA.themes.flatMap((t) => t.stocks.map((s) => s.code)))];

/* ── 시세 ─────────────────────────────────────────────────── */

interface Quote {
  price: number;
  chg: number;
}

/**
 * 장이 열리기 전에는 KIS 가 현재가 = 전일종가를 주므로 등락률이 전부 0 이 된다
 * (2026-08-25 새벽에 확인 — 삼성전자 현재가 257,000 · 전일종가 257,000 · 0.00%).
 * 틀린 값이 아니라 "오늘은 아직 움직인 게 없다" 는 뜻이다. 다만 밤에 화면을
 * 열면 온통 0 이라 고장난 것처럼 보인다.
 *
 * 그래서 장중에 값이 움직일 때마다 그때의 등락률을 따로 남겨 두고, 다음 장이
 * 열리기 전까지는 그것을 보여 준다. 화면에는 직전 거래일 기준임을 밝힌다.
 */
const SNAP_KEY = "ownTheme:lastSession:v1";
const SNAP_TTL = 5 * 24 * 3600; // 연휴를 건너뛸 만큼
let memSnap: Record<string, Quote> | null = null;

async function readSnap(): Promise<Record<string, Quote> | null> {
  if (redis) return (await redis.get<Record<string, Quote>>(SNAP_KEY)) ?? null;
  return memSnap;
}
async function writeSnap(v: Record<string, Quote>) {
  memSnap = v;
  if (redis) await redis.set(SNAP_KEY, v, { ex: SNAP_TTL });
}

export interface Quotes {
  map: Record<string, Quote>;
  /** 직전 거래일 값을 쓰고 있는가 */
  stale: boolean;
}

/**
 * 편입 종목 전체의 시세. KIS 멀티조회는 한 번에 30종목이라
 * 2,700종목이면 90번쯤 부른다 — 처음 부르는 사람이 10초쯤 기다린다.
 * 그래서 5분 캐시에 크론 예열을 함께 쓴다 (섹터 강약과 같은 방식).
 */
/**
 * KRX 가격제한폭은 하루 ±30% 다. 그 밖의 값은 시세가 아니라 오류다.
 *
 * 실제로 헝셩그룹이 +400% 로 들어왔다 (현재가 2,100 · 시총 107억). 이 한 종목
 * 때문에 화장품 브랜드 테마 19종목의 단순 평균이 +22% 가 됐고, 나머지 16종목은
 * 움직이지도 않은 상태였다. 걸러내지 않으면 평균이 통째로 망가진다.
 *
 * 신규상장 첫날처럼 제한폭을 벗어나는 경우가 없진 않지만, 그런 종목 하나를
 * 살리자고 평균을 내주는 것보다 빼는 편이 낫다.
 */
const LIMIT = 30.5;

async function quotesAll(): Promise<Quotes> {
  if (!hasKIS()) return { map: {}, stale: false };
  const m = await unifiedQuotes(ALL_CODES);
  const map: Record<string, Quote> = {};
  let moved = 0;
  for (const [code, q] of m) {
    if (q.price <= 0 || Math.abs(q.changePct) > LIMIT) continue;
    map[code] = { price: q.price, chg: q.changePct };
    if (q.changePct !== 0) moved++;
  }
  // 장이 돌고 있으면 수백 종목이 움직인다. 몇 종목만 움직였다면 개장 전이다.
  // (문턱을 30 으로 뒀다가 엉뚱한 값 하나에 속았다 — 위 LIMIT 설명 참고)
  if (moved >= 200) {
    await writeSnap(map);
    return { map, stale: false };
  }
  const snap = await readSnap();
  // 남겨 둔 것이 없으면 있는 그대로 보여 준다. "오늘은 아직 안 움직였다" 가 사실이다.
  return snap ? { map: snap, stale: true } : { map, stale: false };
}

const quotes = () => cached<Quotes>("ownTheme:quotes:v3", 300, quotesAll);

/* ── 종목별 고정 정보 (상장주식수·PER) ────────────────────── */

interface Fixed {
  shares: number;
  per: number | null;
}

const n = (v: unknown) => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

/**
 * 상장주식수와 PER. 시총은 현재가 × 상장주식수로 만든다.
 *
 * 상장주식수는 거의 안 바뀌므로 길게 잡아 둔다. 이렇게 해 두면 시총이
 * 시세와 함께 매번 새로 계산되면서도 호출은 종목당 이레에 한 번뿐이다.
 */
async function fixedOf(code: string): Promise<Fixed> {
  const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", {
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: code,
  });
  const o = (j.output as Record<string, string>) ?? {};
  const per = Number(o.per);
  return { shares: n(o.lstn_stcn), per: Number.isFinite(per) && per !== 0 ? per : null };
}

const fixed = (code: string) =>
  cached<Fixed>(`ownTheme:fixed:v1:${code}`, 7 * 24 * 3600, () => fixedOf(code));

/** 여러 종목을 한꺼번에. 캐시가 차 있으면 거의 즉시 끝난다. */
async function fixedMany(codes: string[]): Promise<Record<string, Fixed>> {
  const out: Record<string, Fixed> = {};
  const CONC = 6;
  for (let i = 0; i < codes.length; i += CONC) {
    await Promise.all(
      codes.slice(i, i + CONC).map(async (c) => {
        try { out[c] = await fixed(c); } catch { /* 없으면 비워 둔다 */ }
      }),
    );
  }
  return out;
}

/* ── 화면이 쓰는 모양 ─────────────────────────────────────── */

export interface OwnThemeRow {
  id: string;
  name: string;
  group: string;
  hint: string;
  /** 구성종목 단순 평균 등락률 (에프앤가이드 테마와 같은 방식) */
  chg: number | null;
  up: number;
  flat: number;
  down: number;
  count: number;
  /** 오늘 가장 많이 오른 두 종목 */
  leaders: { code: string; name: string; chg: number }[];
}

export interface OwnThemeStock {
  code: string;
  name: string;
  /** 편입 사유 — 사업보고서에서 뽑은 근거 문장 */
  why: string | null;
  /** 어떤 낱말 때문에 붙었는가 */
  tags: string[];
  price: number | null;
  chg: number | null;
  /** 억원 */
  cap: number | null;
  per: number | null;
  growth: number | null;
  opm: number | null;
}

export interface OwnThemeDetail {
  id: string;
  name: string;
  hint: string;
  chg: number | null;
  /** 시총으로 다시 가중한 등락률 — 대형주가 끌었는지 본다 */
  weighted: number | null;
  count: number;
  up: number;
  flat: number;
  down: number;
  /** 직전 거래일 값을 보여 주고 있는가 (장 시작 전) */
  stale: boolean;
  stocks: OwnThemeStock[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

async function buildList(): Promise<{ rows: OwnThemeRow[]; stale: boolean }> {
  const { map: q, stale } = await quotes();
  const rows = DATA.themes
    .map((t) => {
      const live = t.stocks.map((s) => ({ ...s, q: q[s.code] })).filter((s) => s.q);
      const chgs = live.map((s) => s.q!.chg);
      return {
        id: t.id,
        name: t.name,
        group: t.group,
        hint: t.hint,
        chg: avg(chgs) === null ? null : +avg(chgs)!.toFixed(2),
        up: chgs.filter((c) => c > 0).length,
        flat: chgs.filter((c) => c === 0).length,
        down: chgs.filter((c) => c < 0).length,
        count: live.length || t.stocks.length,
        leaders: [...live]
          .sort((a, b) => b.q!.chg - a.q!.chg)
          .slice(0, 2)
          .map((s) => ({ code: s.code, name: s.name, chg: s.q!.chg })),
      };
    })
    .sort((a, b) => (b.chg ?? -999) - (a.chg ?? -999));
  return { rows, stale };
}

/** 테마 목록 (5분 캐시 — 장중 시세라 짧게) */
export const ownThemeList = () =>
  cached<{ rows: OwnThemeRow[]; stale: boolean }>("ownTheme:list:v3", 300, buildList);

async function buildDetail(id: string): Promise<OwnThemeDetail> {
  const t = DATA.themes.find((x) => x.id === id);
  if (!t) throw new Error(`테마 없음: ${id}`);

  const codes = t.stocks.map((s) => s.code);
  const [{ map: q, stale }, fx] = await Promise.all([quotes(), fixedMany(codes)]);

  const stocks: OwnThemeStock[] = t.stocks.map((s) => {
    const price = q[s.code]?.price ?? null;
    const shares = fx[s.code]?.shares ?? 0;
    return {
      code: s.code,
      name: s.name,
      why: s.why,
      tags: s.tags ?? [],
      price,
      chg: q[s.code]?.chg ?? null,
      // 억원 단위로 맞춘다 (화면이 그 단위를 쓴다)
      cap: price && shares ? Math.round((price * shares) / 1e8) : null,
      per: fx[s.code]?.per ?? null,
      growth: s.growth,
      opm: s.opm,
    };
  });

  const chgs = stocks.map((s) => s.chg).filter((c): c is number => c !== null);
  const capped = stocks.filter((s) => s.cap && s.chg !== null);
  const capSum = capped.reduce((a, s) => a + (s.cap as number), 0);

  return {
    id: t.id,
    name: t.name,
    hint: t.hint,
    chg: avg(chgs) === null ? null : +avg(chgs)!.toFixed(2),
    weighted:
      capSum > 0
        ? +capped.reduce((a, s) => a + ((s.cap as number) / capSum) * (s.chg as number), 0).toFixed(2)
        : null,
    count: stocks.length,
    up: chgs.filter((c) => c > 0).length,
    flat: chgs.filter((c) => c === 0).length,
    down: chgs.filter((c) => c < 0).length,
    stale,
    stocks,
  };
}

/** 테마 상세 (5분 캐시) */
export const ownThemeDetail = (id: string) =>
  cached<OwnThemeDetail>(`ownTheme:detail:v2:${id}`, 300, () => buildDetail(id));

/** 크론 예열용 — 시세만 미리 채워 둔다 */
export const warmOwnThemes = () => ownThemeList();

/* ── 종목 → 테마 (종목 화면의 비교군) ────────────────────── */

export interface ThemeOfStock {
  id: string;
  name: string;
  codes: string[];
}

/**
 * 어떤 종목이 어느 테마에 드는가. 구성종목이 적은 = 더 구체적인 테마를 앞에 둔다.
 * 예전에는 네이버(에프앤가이드) 테마를 썼다. 이제 우리 분류를 쓴다.
 */
export function themesOfStock(code: string): ThemeOfStock[] {
  return DATA.themes
    .filter((t) => t.stocks.some((s) => s.code === code))
    .map((t) => ({ id: t.id, name: t.name, codes: t.stocks.map((s) => s.code) }))
    .sort((a, b) => a.codes.length - b.codes.length);
}

export function themeById(id: string): ThemeOfStock | undefined {
  const t = DATA.themes.find((x) => x.id === id);
  return t ? { id: t.id, name: t.name, codes: t.stocks.map((s) => s.code) } : undefined;
}

/* ── 종목명으로 테마 찾기 ────────────────────────────────── */

/**
 * 테마별 편입 종목 이름 목록. 화면에서 "삼성SDI 가 어느 테마에 있지" 를
 * 바로 찾을 수 있게 한 번 내려 주고 그 뒤로는 브라우저에서 찾는다.
 * 분기에 한 번 바뀌는 값이라 오래 캐시해도 된다.
 */
export function themeIndex(): { id: string; name: string; group: string; names: string[] }[] {
  return DATA.themes.map((t) => ({
    id: t.id,
    name: t.name,
    group: t.group,
    names: t.stocks.map((s) => s.name),
  }));
}

/* ── 테마 등락률 시계열 ──────────────────────────────────── */

export interface ThemePoint {
  /** YYYYMMDD */
  d: string;
  /** 첫날을 0 으로 둔 누적 등락률 % */
  v: number;
}

/**
 * 테마 지수를 만든다.
 *
 * 화면에 쓰는 테마 등락률이 "편입 종목의 단순 평균" 이므로, 시계열도 같은
 * 방식이어야 한다. 날마다 구성종목의 등락률을 평균 내고 그것을 이어 붙인다.
 * 시총 가중으로 만들면 화면의 숫자와 그래프가 어긋난다.
 *
 * 전 종목 일봉을 받으면 무거우므로 시총 상위 20개만 쓴다. 테마의 움직임은
 * 큰 종목이 좌우하고, 20개면 모양이 충분히 잡힌다.
 */
async function buildChart(id: string, days: number): Promise<ThemePoint[]> {
  const t = DATA.themes.find((x) => x.id === id);
  if (!t) throw new Error(`테마 없음: ${id}`);
  if (!hasKIS()) return [];

  const codes = t.stocks.map((s) => s.code);
  const fx = await fixedMany(codes);
  const q = (await quotes()).map;
  const top = codes
    .map((c) => ({ c, cap: (q[c]?.price ?? 0) * (fx[c]?.shares ?? 0) }))
    .sort((a, b) => b.cap - a.cap)
    .slice(0, 20)
    .map((x) => x.c);

  const to = new Date();
  const from = new Date(to.getTime() - (days + 20) * 24 * 3600 * 1000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

  // 날짜별 등락률을 모은다
  const byDate = new Map<string, number[]>();
  const CONC = 5;
  for (let i = 0; i < top.length; i += CONC) {
    await Promise.all(
      top.slice(i, i + CONC).map(async (c) => {
        try {
          const bars = await exchangeBars(c, "J", "D", ymd(from), ymd(to));
          for (let k = 1; k < bars.length; k++) {
            const prev = bars[k - 1].close;
            if (prev <= 0) continue;
            const d = new Date(bars[k].time * 1000).toISOString().slice(0, 10).replace(/-/g, "");
            const r = ((bars[k].close - prev) / prev) * 100;
            // 가격제한폭 밖은 시세가 아니라 오류다 (목록에서와 같은 기준)
            if (Math.abs(r) > LIMIT) continue;
            byDate.set(d, [...(byDate.get(d) ?? []), r]);
          }
        } catch { /* 한 종목이 빠져도 평균은 선다 */ }
      }),
    );
  }

  const dates = [...byDate.keys()].sort().slice(-days);
  const out: ThemePoint[] = [];
  let acc = 1;
  for (const d of dates) {
    const rs = byDate.get(d)!;
    // 그날 값이 몇 종목뿐이면 평균이 튄다 — 절반은 있어야 쓴다
    if (rs.length < Math.max(3, top.length / 2)) continue;
    // 첫날은 0 에서 시작한다. 첫날 등락률부터 얹으면 그래프가 0 이 아닌 데서
    // 시작해 '누적' 으로 읽히지 않는다 (첫 점이 +8.37% 로 뜬 적이 있다).
    if (out.length) acc *= 1 + rs.reduce((a, b) => a + b, 0) / rs.length / 100;
    out.push({ d, v: +((acc - 1) * 100).toFixed(2) });
  }
  return out;
}

/** 테마 등락률 시계열 (12시간 캐시 — 하루 한 점씩 늘어난다) */
export const ownThemeChart = (id: string, days = 60) =>
  cached<ThemePoint[]>(`ownTheme:chart:v2:${id}:${days}`, 12 * 3600, () => buildChart(id, days));
