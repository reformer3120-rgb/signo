// 코스콤 어댑터.
//
// 경로·필드명은 공식 문서에서 확인한 것만 썼다.
//   https://koscom.gitbook.io/open-api/api/marketv3
//
// 인증
//   GET 은 헤더 `apikey: <키>` 로 보낸다. 쿼리스트링(?apikey=)도 되지만
//   URL 에 키가 남아 로그에 찍히므로 헤더를 쓴다.
//   OAuth2 를 쓰는 경우 /auth/oauth/v3/token 으로 access token 을 받아
//   Authorization: Bearer 로 보낸다 (KOSCOM_OAUTH=1).
//
// 게이트웨이
//   운영    https://apigw.koscom.co.kr
//   샌드박스 https://sandbox-apigw.koscom.co.kr
//   실제 주소는 계약 시 안내받은 값으로 KOSCOM_API_BASE 에 넣는다.
//
// 코스콤이 주지 않는 것 — 재무제표 · 컨센서스 · 뉴스 · 분봉 · 장중 추정수급.
// 재무는 DART 로 따로 채운다. PORTING-STOCK-TAB.md §4 참고.
import { cached } from "@/lib/cache";
import { dartFinancials, hasDart } from "./dart";
import type { Candle, Interval, Quote } from "@/lib/types";
import type { Exch, SearchHit, StockDataProvider, TrendRow } from "./types";
import type { InvestorRow } from "@/lib/kis";

const BASE = process.env.KOSCOM_API_BASE ?? "https://apigw.koscom.co.kr";

export const hasKoscom = () => Boolean(process.env.KOSCOM_API_KEY);

// ── 호출 ──────────────────────────────────────────────────────

/** OAuth2 토큰 — 만료 전까지 재사용한다 */
let token: { value: string; until: number } | null = null;

async function bearer(): Promise<string> {
  if (token && Date.now() < token.until) return token.value;
  const id = process.env.KOSCOM_CLIENT_ID ?? "";
  const secret = process.env.KOSCOM_CLIENT_SECRET ?? "";
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch(`${BASE}/auth/oauth/v3/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`코스콤 토큰 발급 실패 ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  // 만료 1분 전에 미리 갱신한다
  token = { value: j.access_token, until: Date.now() + ((j.expires_in ?? 3600) - 60) * 1000 };
  return token.value;
}

async function kos<T>(path: string): Promise<T> {
  const key = process.env.KOSCOM_API_KEY;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.KOSCOM_OAUTH === "1") headers.Authorization = `Bearer ${await bearer()}`;
  else if (key) headers.apikey = key;
  else throw new Error("KOSCOM_API_KEY 가 없다");

  const r = await fetch(`${BASE}${path}`, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`코스콤 ${r.status} ${path}`);
  return r.json() as Promise<T>;
}

const n = (v: unknown): number => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

/** yyyymmdd → UNIX 초 (KST 자정) */
const ymdToSec = (d: string): number =>
  Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) / 1000;

const ymdOffset = (days: number): string => {
  const d = new Date(Date.now() - days * 86400_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
};

// ── 종목 마스터 (코스피/코스닥 판별 + 검색) ──────────────────

type Board = "kospi" | "kosdaq";
interface Listed {
  code: string;
  name: string;
  board: Board;
}

/**
 * 전 종목 목록. 종목코드만으로는 코스피/코스닥이 갈리지 않아
 * (경로가 갈리므로) 하루 한 번 받아 두고 판별에 쓴다. 검색도 여기서 한다.
 *
 * 캐시는 JSON 으로 오간다 — Map 을 그대로 넣으면 `{}` 로 납작해지므로
 * 배열로 저장하고 Map 은 메모리에서만 만든다.
 */
async function listedRows(): Promise<Listed[]> {
  return cached<Listed[]>("koscom:listed", 12 * 3600, async () => {
    const out: Listed[] = [];
    for (const board of ["kospi", "kosdaq"] as Board[]) {
      const d = await kos<{ isuLists?: Record<string, string>[] }>(
        `/v3/market/closed/${board}/lists`,
      );
      for (const x of d.isuLists ?? []) {
        const code = String(x.isuSrtCd ?? "").trim();
        if (!code) continue;
        out.push({ code, name: (x.isuKorAbbr || x.isuKorNm || code).trim(), board });
      }
    }
    return out;
  });
}

let byCode: { at: number; map: Map<string, Listed> } | null = null;

async function listed(): Promise<Map<string, Listed>> {
  if (byCode && Date.now() - byCode.at < 3600_000) return byCode.map;
  const rows = await listedRows();
  byCode = { at: Date.now(), map: new Map(rows.map((r) => [r.code, r])) };
  return byCode.map;
}

async function boardOf(code: string): Promise<Board> {
  const m = await listed();
  return m.get(code)?.board ?? "kospi";
}

// ── 마스터 ────────────────────────────────────────────────────

interface Master {
  isuKorAbbrv?: string;
  trdPrc?: string; // 현재가(종가)
  prevddClsprc?: string; // 전일종가
  opnprc?: string;
  hgprc?: string;
  lwprc?: string;
  accTrdvol?: string;
  mktcap?: string;
  eps?: string;
  per?: string;
  bps?: string;
  pbr?: string;
  divYd?: string; // 배당수익률
  listShrs?: string;
  idxIndMidclssCd?: string; // 업종코드
}

const master = (code: string, board: Board) =>
  cached(`koscom:master:${code}`, 300, () =>
    kos<Master>(`/v3/market/closed/${board}/${code}/master`),
  );

// ── 어댑터 ────────────────────────────────────────────────────

export const koscomProvider: StockDataProvider = {
  name: "koscom",

  // history 는 일/주/월만 준다 (trnsmCycleTpCd D/W/M). 분봉 서비스가 없다.
  intervals: () => ["1D", "1W", "1M"],
  // 코스콤 시세는 KRX 기준. NXT 분리 시세는 카탈로그에 없다.
  exchanges: () => ["KRX"],

  async quote(code, name): Promise<Quote> {
    const board = await boardOf(code);
    const d = await master(code, board);
    const price = n(d.trdPrc);
    const prev = n(d.prevddClsprc);
    const change = prev > 0 ? price - prev : 0;
    return {
      symbol: code,
      name: (d.isuKorAbbrv || name || code).trim(),
      price,
      change,
      changePct: prev > 0 ? (change / prev) * 100 : 0,
      volume: n(d.accTrdvol),
      currency: "KRW",
    };
  },

  async candles(code, interval: Interval): Promise<Candle[]> {
    const cycle = interval === "1W" ? "W" : interval === "1M" ? "M" : "D";
    if (!["1D", "1W", "1M"].includes(interval)) {
      throw new Error(`코스콤은 ${interval} 봉을 주지 않는다 (일·주·월만)`);
    }
    const board = await boardOf(code);
    const span = interval === "1D" ? 400 : interval === "1W" ? 1200 : 3600;
    const ttl = interval === "1D" ? 300 : 900;
    return cached(`koscom:hist:${code}:${interval}`, ttl, async () => {
      const d = await kos<{ hisLists?: Record<string, string>[] }>(
        `/v3/market/closed/${board}/${code}/history` +
          `?trnsmCycleTpCd=${cycle}&inqStrtDd=${ymdOffset(span)}&inqEndDd=${ymdOffset(0)}&reqCnt=500`,
      );
      return (d.hisLists ?? [])
        .filter((r) => r.trdDd && n(r.trdPrc) > 0)
        .map((r) => ({
          time: ymdToSec(r.trdDd),
          open: n(r.opnprc),
          high: n(r.hgprc),
          low: n(r.lwprc),
          close: n(r.trdPrc),
          volume: n(r.accTrdvol),
        }))
        .sort((a, b) => a.time - b.time);
    });
  },

  async investorDaily(code): Promise<InvestorRow[]> {
    // 투자자코드 — 8 기관계 · 10 개인 · 11 외국인 (코드표 확인)
    // 주의: 이 엔드포인트는 조회일 하루치만 준다. 전일 및 당일 15:30 이후 제공.
    // 일별 시계열을 쌓으려면 매일 한 번 받아 저장하는 크론이 필요하다.
    const board = await boardOf(code);
    return cached(`koscom:inv:${code}`, 600, async () => {
      const d = await kos<{ invstLists?: Record<string, string>[] }>(
        `/v3/market/investors/${board}/${code}/investors`,
      );
      const net = (cd: string) => {
        const r = (d.invstLists ?? []).find((x) => String(x.invstCd).trim() === cd);
        return r ? n(r.bidTrdvol) - n(r.askTrdvol) : 0;
      };
      const rows = d.invstLists ?? [];
      if (!rows.length) return [];
      const m = await master(code, board);
      return [
        {
          date: ymdOffset(0),
          close: n(m.trdPrc),
          개인: net("10"),
          외국인: net("11"),
          기관: net("8"),
        },
      ];
    });
  },

  // 코스콤은 장중 추정 수급을 주지 않는다 (투자자 데이터는 15:30 이후 확정치).
  // 빈 배열이면 화면의 '당일 실시간' 탭이 스스로 숨는다.
  investorIntraday: async () => [],

  async investorTrend(code): Promise<TrendRow[]> {
    // foreignhistory 는 외국인 '보유비중' 시계열이라 순매수(TrendRow)와 성격이 다르다.
    // 순매수 추이가 필요하면 investorDaily 를 매일 쌓아야 한다 (위 주석 참고).
    void code;
    return [];
  },

  async detail(code) {
    const board = await boardOf(code);
    const [m, fr, hist] = await Promise.all([
      master(code, board),
      // 외국인 보유비중 — 최근 1건
      kos<{ hisLists?: Record<string, string>[] }>(
        `/v3/market/closed/${board}/${code}/foreignhistory` +
          `?inqStrtDd=${ymdOffset(10)}&inqEndDd=${ymdOffset(0)}&reqCnt=1`,
      ).catch(() => ({ hisLists: [] as Record<string, string>[] })),
      // 52주 최고·최저는 selectivemaster 에도 있지만, 일봉에서 직접 구하면
      // 필드 유무에 기대지 않아도 되고 값이 항상 맞는다
      koscomProvider.candles(code, "1D").catch(() => [] as Candle[]),
    ]);

    const yr = hist.slice(-250);
    const high52 = yr.length ? Math.max(...yr.map((c) => c.high)) : 0;
    const low52 = yr.length ? Math.min(...yr.map((c) => c.low)) : 0;
    const rate = n(fr.hisLists?.[0]?.FornHdVolRt);
    const capEok = n(m.mktcap) / 1e8; // 원 → 억원. 단위가 다르면 여기만 고친다

    return {
      code,
      name: (m.isuKorAbbrv || code).trim(),
      industryCode: String(m.idxIndMidclssCd ?? ""),
      price: n(m.trdPrc),
      per: n(m.per),
      pbr: n(m.pbr),
      eps: n(m.eps),
      bps: n(m.bps),
      cnsPer: 0, // 코스콤 미제공 — 컨센서스 서비스 없음
      marketCap: capEok,
      marketCapText: "",
      foreignRate: rate ? String(rate) : "",
      high52,
      low52,
      dividendYield: n(m.divYd),
      priceTarget: 0, // 코스콤 미제공
      upside: 0, //  ''
      recommMean: 0, //  ''
    };
  },

  async sectorRank(code, groupKey) {
    // 업종 구성종목은 lists + master 의 업종코드로 만들 수 있지만, 종합평가 점수는
    // 비교군 전체의 ROE·부채비율·성장률이 있어야 매겨진다. 코스콤에는 재무가 없다.
    // DART 키가 없으면 반쪽 점수가 나가지 않도록 막는다.
    void code;
    void groupKey;
    if (!hasDart()) {
      throw new Error("재무 출처가 없어 종합평가를 매길 수 없다 — DART_API_KEY 를 넣을 것");
    }
    // TODO: lists + master(업종코드)로 비교군을 만들고 dartFinancials 로 지표를 채운 뒤
    //       lib/score.ts 의 채점을 그대로 태운다. 비교군 전체를 매번 조회하면
    //       DART 하루 2만 건에 걸리므로, 크론(/api/cron/metrics)으로 미리 모아 둘 것.
    throw new Error("sectorRank 미구현 — PORTING-STOCK-TAB.md §6 참고");
  },

  // 재무는 코스콤에 없다. DART 로 메운다 (없으면 카드가 스스로 숨는다).
  financials: (code, period) =>
    hasDart() ? dartFinancials(code, period) : Promise.resolve({ periods: [], rows: [] }),
  // 뉴스는 코스콤 카탈로그에 서비스 자체가 없다.
  news: async () => [],

  async search(query): Promise<SearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    const m = await listed();
    const hits: SearchHit[] = [];
    for (const x of m.values()) {
      if (x.code.startsWith(q) || x.name.includes(q)) {
        hits.push({ code: x.code, name: x.name, market: x.board.toUpperCase() });
        if (hits.length >= 20) break;
      }
    }
    return hits;
  },
};

/** 화면에 "이 출처는 여기까지" 를 알리는 표 */
export const koscomCapabilities = {
  분봉: false,
  장중수급: false,
  재무제표: hasDart(), // DART 키가 있으면 채워진다
  뉴스: false,
  컨센서스: false,
  배당: true, // master.divYd
  거래소구분: false,
};
