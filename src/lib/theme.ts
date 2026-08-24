// 네이버 금융 테마(세부 섹터) 인덱스. 서버 전용.
// 업종(예: "반도체와반도체장비")보다 훨씬 세분화된 그룹(HBM, 반도체 장비, 반도체 기판 …)을 제공.
//
// ┌─ 배포 전 반드시 읽을 것 ────────────────────────────────────────┐
// │ 이 파일이 긁는 데이터의 소유자는 네이버가 아니다.                │
// │                                                                │
// │ 네이버 금융 푸터에 이렇게 적혀 있다.                             │
// │   "네이버파이낸셜에 콘텐츠 제공 — 에프앤가이드(기업 및 재무정보)" │
// │   "게시된 정보는 무단으로 배포할 수 없습니다."                   │
// │   "국내 증시 기본 데이터는 한국거래소(KRX)에서 제공합니다."       │
// │                                                                │
// │ 즉 테마 분류·편입 사유·재무 지표(매출액증가율·영업이익·PER)는    │
// │ 에프앤가이드 것이다. 시세만 KRX 것이고, 그쪽은 코스콤 계약으로   │
// │ 덮이지만 테마와 재무는 덮이지 않는다 — 별도 계약이 필요하다.     │
// │                                                                │
// │ 그래서 이 구현은 개발·검증용이다. 외부 이용자에게 서비스하려면   │
// │ 에프앤가이드 라이선스를 받고, 아래 파서 대신 정식 API를 쓰는     │
// │ ThemeSource 를 끼워야 한다 (providers/types.ts 참고).            │
// └────────────────────────────────────────────────────────────────┘
import { cached } from "./cache";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" };

// 테마 상세의 항목선택은 쿠키에 저장된다. 아래 값은 시가총액·매출액·
// 영업이익·매출액증가율·PER 다섯을 켠 상태다. 이 쿠키를 실어 보내면
// 재무 지표가 시세표에 함께 실려 오므로 재무제표를 따로 긁지 않아도 된다.
//
// 값이 언제까지 유효한지는 네이버 사정이라 보장할 수 없다. 그래서 아래
// 파서는 열 위치를 고정하지 않고 머리글(th)을 읽어 이름으로 찾는다.
// 쿠키가 먹지 않으면 지표가 null 이 될 뿐, 엉뚱한 칸을 읽지는 않는다.
const FIELD_COOKIE = "field_list=6|0000C890";

async function eucKr(url: string, cookie?: string): Promise<string> {
  const r = await fetch(url, {
    headers: cookie ? { ...UA, cookie } : UA,
    cache: "no-store",
  });
  const b = await r.arrayBuffer();
  return new TextDecoder("euc-kr").decode(b);
}

/** 태그를 걷어내고 공백을 하나로 */
const strip = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** "+21.91%" · "8,877" · "-176" → 숫자. 빈칸이나 N/A 는 null */
function num(s: string | undefined | null): number | null {
  if (!s) return null;
  const t = s.replace(/,/g, "").replace(/[^\d.+-]/g, "");
  if (!t || t === "-" || t === "+" || t === ".") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/* ── 테마 목록 ───────────────────────────────────────────── */

export interface ThemeRow {
  no: string;
  name: string;
  /** 전일대비 등락률 % */
  chg: number | null;
  /** 최근 3일 등락률 % */
  chg3d: number | null;
  up: number;
  flat: number;
  down: number;
  /** 주도주 (네이버가 이름을 줄여 준다 — 상세로 들어가면 정식 이름) */
  leaders: { code: string; name: string }[];
}

async function buildList(): Promise<ThemeRow[]> {
  const out: ThemeRow[] = [];
  const seen = new Set<string>();
  for (let p = 1; p <= 10; p++) {
    const html = await eucKr(`https://finance.naver.com/sise/theme.naver?&page=${p}`);
    const body = html.slice(Math.max(0, html.indexOf("type_1 theme")));
    let added = 0;
    for (const row of body.split("</tr>")) {
      const head = /sise_group_detail\.naver\?type=theme&no=(\d+)"[^>]*>([^<]+)</.exec(row);
      if (!head) continue;
      const no = head[1];
      if (seen.has(no)) continue;
      seen.add(no);

      const cells = (cls: string) =>
        [
          ...row.matchAll(
            new RegExp(`<td[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</td>`, "g"),
          ),
        ].map((m) => strip(m[1]));
      const cnt = cells("col_type4");

      out.push({
        no,
        name: head[2].trim(),
        chg: num(cells("col_type2")[0]),
        chg3d: num(cells("col_type3")[0]),
        up: num(cnt[0]) ?? 0,
        flat: num(cnt[1]) ?? 0,
        down: num(cnt[2]) ?? 0,
        // 테마 링크는 no=, 주도주 링크는 code= 라 6자리 코드만 잡으면 주도주만 걸린다
        leaders: [...row.matchAll(/code=(\d{6})"[^>]*>([^<]+)</g)].map((m) => ({
          code: m[1],
          name: m[2].trim().replace(/\.\.$/, "…"),
        })),
      });
      added++;
    }
    if (!added) break;
  }
  return out;
}

/** 테마 목록 + 등락률 (5분 캐시 — 장중 시세라 짧게) */
export const themeList = () => cached<ThemeRow[]>("themeList:v1", 300, buildList);

/* ── 테마 상세 ───────────────────────────────────────────── */

export interface ThemeStock {
  code: string;
  name: string;
  /** 테마 편입 사유 */
  why: string;
  price: number | null;
  chg: number | null;
  /** 시가총액 (억원) */
  cap: number | null;
  /** 매출액 (억원) */
  sales: number | null;
  /** 영업이익 (억원) */
  op: number | null;
  /** 영업이익률 % — 영업이익 ÷ 매출액 */
  opm: number | null;
  /** 매출액증가율 % */
  growth: number | null;
  per: number | null;
}

export interface ThemeDetail {
  no: string;
  name: string;
  /** 테마 개요 */
  desc: string;
  chg: number | null;
  count: number;
  up: number;
  flat: number;
  down: number;
  stocks: ThemeStock[];
}

async function buildDetail(no: string): Promise<ThemeDetail> {
  const html = await eucKr(
    `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${no}`,
    FIELD_COOKIE,
  );

  const tableAt = html.indexOf("type_5");
  const summary = html.slice(0, tableAt < 0 ? html.length : tableAt);
  const table = tableAt < 0 ? "" : html.slice(tableAt);

  // 요약줄 — 테마명 · 개요 · 등락률 · 종목수 · 상승/보합/하락
  const name = /<strong class="info_title">([^<]+)</.exec(summary)?.[1]?.trim() ?? "";
  const desc = strip(/<p class="info_txt">([\s\S]*?)<\/p>/.exec(summary)?.[1] ?? "");
  const sums = [...summary.matchAll(/<td class="number">([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));

  // 시세표 — 머리글을 읽어 이름으로 열을 찾는다.
  // th 첫 칸이 종목명이고 td 에는 편입 사유 칸이 하나 더 끼므로 한 칸 밀린다.
  const ths = [...table.slice(0, 4000).matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    strip(m[1]),
  );
  const colOf = (label: string) => {
    const i = ths.indexOf(label);
    return i < 1 ? -1 : i + 1;
  };
  const col = {
    price: colOf("현재가"),
    chg: colOf("등락률"),
    cap: colOf("시가총액"),
    sales: colOf("매출액"),
    op: colOf("영업이익"),
    growth: colOf("매출액증가율"),
    per: colOf("PER"),
  };

  const stocks: ThemeStock[] = [];
  for (const row of table.split("</tr>")) {
    const head = /code=(\d{6})"[^>]*>([^<]+)</.exec(row);
    if (!head) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const at = (i: number) => (i >= 0 && i < cells.length ? num(strip(cells[i])) : null);

    const sales = at(col.sales);
    const op = at(col.op);
    stocks.push({
      code: head[1],
      name: head[2].trim(),
      why: strip(/<p class="info_txt">([\s\S]*?)<\/p>/.exec(row)?.[1] ?? ""),
      price: at(col.price),
      chg: at(col.chg),
      cap: at(col.cap),
      sales,
      op,
      // 매출이 0 이면 비율이 의미가 없다 (신규 상장·지주사 등)
      opm: sales && op !== null && sales !== 0 ? (op / sales) * 100 : null,
      growth: at(col.growth),
      per: at(col.per),
    });
  }

  // 네이버 요약줄의 종목수와 시세표의 행 수가 어긋날 때가 있다
  // (2차전지: 요약 143, 표 142 — 거래정지 종목이 표에서 빠지는 듯).
  // 헤더에 143 을 띄우고 142 개를 늘어놓으면 읽는 쪽이 틀린 것으로 본다.
  // 그래서 셋 다 파싱 결과에서 직접 센다. 표가 통째로 비면 요약줄로 물러선다.
  const tally = (f: (s: ThemeStock) => boolean) => stocks.filter(f).length;
  const own = stocks.length > 0;

  return {
    no,
    name,
    desc,
    chg: num(sums[0]),
    count: own ? stocks.length : (num(sums[1]) ?? 0),
    up: own ? tally((s) => (s.chg ?? 0) > 0) : (num(sums[2]) ?? 0),
    flat: own ? tally((s) => (s.chg ?? 0) === 0) : (num(sums[3]) ?? 0),
    down: own ? tally((s) => (s.chg ?? 0) < 0) : (num(sums[4]) ?? 0),
    stocks,
  };
}

/** 테마 상세 (5분 캐시) */
export const themeDetail = (no: string) =>
  cached<ThemeDetail>(`themeDetail:v2:${no}`, 300, () => buildDetail(no));

/* ── 종목 → 테마 색인 ─────────────────────────────────────── */

export interface ThemeGroup {
  no: string;
  name: string;
  codes: string[];
}
export interface ThemeIndex {
  groups: ThemeGroup[];
  /** 종목코드 → 소속 테마 no 목록 */
  byCode: Record<string, string[]>;
}

async function build(): Promise<ThemeIndex> {
  const metas = await themeList();
  const groups: ThemeGroup[] = [];
  for (let i = 0; i < metas.length; i += 30) {
    const batch = await Promise.all(
      metas.slice(i, i + 30).map(async (m) => {
        try {
          const html = await eucKr(
            `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${m.no}`,
          );
          const codes = [...new Set([...html.matchAll(/code=(\d{6})"/g)].map((x) => x[1]))];
          return { no: m.no, name: m.name, codes };
        } catch {
          return { no: m.no, name: m.name, codes: [] as string[] };
        }
      }),
    );
    groups.push(...batch.filter((g) => g.codes.length));
  }
  const byCode: Record<string, string[]> = {};
  for (const g of groups) {
    for (const c of g.codes) (byCode[c] ??= []).push(g.no);
  }
  return { groups, byCode };
}

/** 테마 인덱스 (12시간 캐시 — 구성종목은 자주 바뀌지 않음) */
export const themeIndex = () => cached("themeIndex:v1", 43_200, build);

/** 특정 종목이 속한 테마들 (구성종목 적은 = 더 구체적인 순) */
export async function themesOf(code: string): Promise<ThemeGroup[]> {
  const idx = await themeIndex();
  const nos = new Set(idx.byCode[code] ?? []);
  return idx.groups
    .filter((g) => nos.has(g.no))
    .sort((a, b) => a.codes.length - b.codes.length);
}

export async function themeByNo(no: string): Promise<ThemeGroup | undefined> {
  const idx = await themeIndex();
  return idx.groups.find((g) => g.no === no);
}
