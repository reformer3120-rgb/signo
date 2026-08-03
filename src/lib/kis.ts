// KIS (한국투자증권) Open API 어댑터.
// 키가 없으면 hasKIS()=false → 라우트가 폴백/안내로 처리.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { cached, redis } from "./cache";

export function hasKIS(): boolean {
  return !!(process.env.KIS_APP_KEY?.trim() && process.env.KIS_APP_SECRET?.trim());
}

const IS_PROD = (process.env.KIS_ENV ?? "vts").toLowerCase() === "prod";
const DOMAIN = IS_PROD
  ? "https://openapi.koreainvestment.com:9443"
  : "https://openapivts.koreainvestment.com:29443";

const APPKEY = () => process.env.KIS_APP_KEY!.trim();
const APPSECRET = () => process.env.KIS_APP_SECRET!.trim();

// ---- 토큰 (24h 유효) : 메모리 → Redis(있으면) → /tmp 파일 순으로 재발급 최소화 ----
// 로컬은 파일, Vercel 서버리스는 Redis(권장) 또는 /tmp(콜드스타트마다 재발급).
interface Token {
  token: string;
  exp: number; // ms epoch
}
let memToken: Token | null = null;
const TOKEN_FILE = path.join(os.tmpdir(), "signo-kis-token.json");
const REDIS_KEY = "kis:token";

function readFileToken(): Token | null {
  try {
    const t = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")) as Token;
    return t.exp > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}
function writeFileToken(t: Token) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(t));
  } catch {
    /* 읽기전용 FS 무시 */
  }
}

async function getToken(): Promise<string> {
  if (memToken && memToken.exp > Date.now() + 60_000) return memToken.token;

  if (redis) {
    const t = await redis.get<Token>(REDIS_KEY);
    if (t && t.exp > Date.now() + 60_000) {
      memToken = t;
      return t.token;
    }
  } else {
    const f = readFileToken();
    if (f) {
      memToken = f;
      return f.token;
    }
  }

  const res = await fetch(`${DOMAIN}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: APPKEY(),
      appsecret: APPSECRET(),
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`KIS 토큰 실패: ${JSON.stringify(j).slice(0, 200)}`);
  memToken = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 86400) * 1000 };
  if (redis) await redis.set(REDIS_KEY, memToken, { ex: j.expires_in ?? 86400 });
  else writeFileToken(memToken);
  return memToken.token;
}

// ---- 공통 GET 요청 ----
interface KisParams {
  [k: string]: string;
}
export async function kisGet(
  urlPath: string,
  trId: string,
  params: KisParams,
): Promise<Record<string, unknown>> {
  const token = await getToken();
  const qs = new URLSearchParams(params).toString();
  // 초당 호출제한(EGW00201) 대비 재시도
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${DOMAIN}${urlPath}?${qs}`, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey: APPKEY(),
        appsecret: APPSECRET(),
        tr_id: trId,
        custtype: "P",
      },
      cache: "no-store",
    });
    const j = await res.json();
    if (j.msg_cd === "EGW00201" && attempt < 3) {
      await new Promise((r) => setTimeout(r, 600 + attempt * 400));
      continue;
    }
    if (j.rt_cd && j.rt_cd !== "0") {
      throw new Error(`KIS ${trId} 오류: ${j.msg_cd} ${j.msg1}`);
    }
    return j;
  }
  throw new Error(`KIS ${trId} 재시도 초과`);
}

const n = (s?: string) => (s ? Number(String(s).replace(/,/g, "")) || 0 : 0);

// ---- 종목별 투자자 수급 (일별 순매수) ----
export interface InvestorRow {
  date: string;
  close: number;
  개인: number;
  외국인: number;
  기관: number;
}

export async function stockInvestor(code: string): Promise<InvestorRow[]> {
  const j = await kisGet(
    "/uapi/domestic-stock/v1/quotations/inquire-investor",
    "FHKST01010900",
    { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code },
  );
  const out = (j.output as Record<string, string>[]) ?? [];
  return out.map((r) => ({
    date: r.stck_bsop_date,
    close: n(r.stck_clpr),
    개인: n(r.prsn_ntby_qty),
    외국인: n(r.frgn_ntby_qty),
    기관: n(r.orgn_ntby_qty),
  }));
}

// ---- 시장 외국인·기관 순매수 상위 종목 ----
export interface FiRow {
  code: string;
  name: string;
  price: number;
  changePct: number;
  foreign: number; // 외국인 순매수 수량(주)
  inst: number; // 기관 순매수 수량(주)
  net: number;
  foreignValue: number; // 외국인 순매수 대금(백만원)
  instValue: number; // 기관 순매수 대금(백만원)
  netValue: number; // 외국인+기관 순매수 대금(백만원)
  krxVol: number; // KRX 거래량
  unVol: number; // 통합(KRX+NXT) 거래량 — 미조회 시 0
  nxtShare: number; // NXT 거래 비중 % — 미조회 시 -1
  nxtValue?: number; // NXT 거래대금(원) — NXT 전용 모드에서만
}

export async function foreignInstitution(
  market: "ALL" | "KOSPI" | "KOSDAQ" = "ALL",
  enrich = 15,
  dir: "buy" | "sell" = "buy",
): Promise<FiRow[]> {
  const iscd = market === "KOSPI" ? "0001" : market === "KOSDAQ" ? "1001" : "0000";
  const j = await kisGet(
    "/uapi/domestic-stock/v1/quotations/foreign-institution-total",
    "FHPTJ04400000",
    {
      FID_COND_MRKT_DIV_CODE: "V",
      FID_COND_SCR_DIV_CODE: "16449",
      FID_INPUT_ISCD: iscd,
      FID_DIV_CLS_CODE: "0",
      FID_RANK_SORT_CLS_CODE: dir === "sell" ? "1" : "0", // 0=순매수 상위, 1=순매도 상위
      FID_ETC_CLS_CODE: "0",
    },
  );
  const out = (j.output as Record<string, string>[]) ?? [];
  const rows: FiRow[] = out.map((r) => ({
    code: r.mksc_shrn_iscd,
    name: r.hts_kor_isnm,
    price: n(r.stck_prpr),
    changePct: Number(r.prdy_ctrt) || 0,
    foreign: n(r.frgn_ntby_qty),
    inst: n(r.orgn_ntby_qty),
    net: n(r.ntby_qty),
    foreignValue: n(r.frgn_ntby_tr_pbmn),
    instValue: n(r.orgn_ntby_tr_pbmn),
    netValue: n(r.frgn_ntby_tr_pbmn) + n(r.orgn_ntby_tr_pbmn),
    krxVol: n(r.acml_vol),
    unVol: 0,
    nxtShare: -1,
  }));
  // 순매수 대금(외국인+기관) 큰 순 / 순매도는 작은(음수 큰) 순
  rows.sort((a, b) => (dir === "sell" ? a.netValue - b.netValue : b.netValue - a.netValue));

  // 상위 표시분만 통합(KRX+NXT) 거래량 조회 → NXT 비중 산출 (멀티종목 1회 호출)
  const target = rows.slice(0, enrich);
  if (target.length) {
    const quotes = await unifiedQuotes(target.map((r) => r.code));
    for (const r of target) {
      const u = quotes.get(r.code);
      if (!u || u.volume <= 0) continue;
      r.unVol = u.volume;
      const nxt = Math.max(0, u.volume - r.krxVol);
      r.nxtShare = +((nxt / u.volume) * 100).toFixed(1);
    }
  }
  return rows;
}

// ---- 프로그램매매 (시간대별 차익/비차익/전체 순매수, 단위: 백만원) ----
export interface ProgramRow {
  hour: string;
  arb: number; // 차익
  nonArb: number; // 비차익
  whole: number; // 전체
}

export async function programTrade(market: "KOSPI" | "KOSDAQ" = "KOSPI"): Promise<ProgramRow[]> {
  const iscd = market === "KOSPI" ? "0001" : "1001";
  const mkt = market === "KOSPI" ? "K" : "Q";
  const j = await kisGet(
    "/uapi/domestic-stock/v1/quotations/comp-program-trade-today",
    "FHPPG04600101",
    {
      FID_COND_MRKT_DIV_CODE: "J",
      FID_COND_MRKT_DIV_CODE1: "J",
      FID_MRKT_CLS_CODE: mkt,
      FID_INPUT_ISCD: iscd,
      FID_SCTN_CLS_CODE: "0",
      FID_INPUT_HOUR_1: "",
      FID_INPUT_DATE_1: "",
      FID_INPUT_ISCD_1: "",
      FID_MKOP_CLS_CODE: "",
    },
  );
  const out = (j.output as Record<string, string>[]) ?? [];
  return out
    .filter((r) => r.bsop_hour)
    .map((r) => ({
      hour: r.bsop_hour,
      arb: n(r.arbt_smtn_ntby_tr_pbmn),
      nonArb: n(r.nabt_smtn_ntby_tr_pbmn),
      whole: n(r.whol_smtn_ntby_tr_pbmn),
    }));
}

// ---- 주식 현재가 ----
// 거래소 구분: J=KRX, NX=넥스트레이드(NXT), UN=통합(KRX+NXT)
export type Exchange = "J" | "NX" | "UN";

export async function stockPrice(code: string, exchange: Exchange = "J") {
  const j = await kisGet(
    "/uapi/domestic-stock/v1/quotations/inquire-price",
    "FHKST01010100",
    { FID_COND_MRKT_DIV_CODE: exchange, FID_INPUT_ISCD: code },
  );
  const o = (j.output as Record<string, string>) ?? {};
  return {
    price: n(o.stck_prpr),
    changePct: Number(o.prdy_ctrt) || 0,
    volume: n(o.acml_vol),
  };
}

/**
 * 통합(KRX+NXT) 시세 — 종목 단위로 캐시.
 * 시총 상위 '더보기'나 여러 화면에서 같은 종목을 반복 조회하므로 캐시가 크게 유리하다.
 */
export const unifiedQuote = (code: string) =>
  cached(`un:${code}`, 45, () => stockPrice(code, "UN"));

// ---- 지수선물 시세 ----
// 종목코드 = 상품코드(3) + "00000" → 근월물 자동 지정
// 101=코스피200 선물, 105=미니 코스피200, 106=코스닥150 선물
export interface FuturesQuote {
  name: string; // "코스닥150F 202609"
  price: number;
  changePct: number;
  prevClose: number;
}

export async function indexFutures(product: "101" | "105" | "106"): Promise<FuturesQuote | null> {
  try {
    const j = await kisGet(
      "/uapi/domestic-futureoption/v1/quotations/inquire-price",
      "FHMIF10000000",
      { FID_COND_MRKT_DIV_CODE: "F", FID_INPUT_ISCD: `${product}00000` },
    );
    const o1 = (j.output1 ?? {}) as Record<string, string>;
    const o2 = (j.output2 ?? {}) as Record<string, string>;
    const price = n(o1.futs_prpr ?? o2.futs_prpr);
    if (price <= 0) return null;
    const prevClose = n(o1.futs_prdy_clpr ?? o2.futs_prdy_clpr);
    const ctrt = Number(o1.futs_prdy_ctrt ?? o1.prdy_ctrt ?? o2.prdy_ctrt);
    return {
      name: (o1.hts_kor_isnm ?? o2.hts_kor_isnm ?? "").trim(),
      price,
      changePct:
        prevClose > 0
          ? +(((price - prevClose) / prevClose) * 100).toFixed(2)
          : Number.isFinite(ctrt)
            ? ctrt
            : 0,
      prevClose,
    };
  } catch {
    return null;
  }
}

// ---- 거래 세션 판별 (KST) ----
// NXT는 08:00~20:00, KRX 정규장은 09:00~15:30.
export type Session = "PRE" | "REGULAR" | "AFTER" | "CLOSED";

export function currentSession(): Session {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd = g("weekday");
  if (wd === "Sat" || wd === "Sun") return "CLOSED";
  const m = Number(g("hour")) * 60 + Number(g("minute"));
  if (m >= 8 * 60 && m < 9 * 60) return "PRE"; // NXT 프리마켓
  if (m >= 9 * 60 && m <= 15 * 60 + 30) return "REGULAR";
  if (m > 15 * 60 + 30 && m <= 20 * 60) return "AFTER"; // NXT 애프터마켓
  return "CLOSED";
}

// ---- NXT 등락 종목수 (NXT에서 실제 체결된 종목만) ----
export interface NxtBreadth {
  up: number;
  flat: number;
  down: number;
  traded: number; // NXT 체결이 있는 종목 수
  scanned: number;
  value: number; // NXT 거래대금 합계(원)
}

export async function nxtBreadth(codes: string[]): Promise<NxtBreadth> {
  const out: NxtBreadth = { up: 0, flat: 0, down: 0, traded: 0, scanned: codes.length, value: 0 };
  for (let i = 0; i < codes.length; i += 30) {
    const batch = codes.slice(i, i + 30);
    const params: KisParams = {};
    batch.forEach((c, k) => {
      params[`FID_COND_MRKT_DIV_CODE_${k + 1}`] = "NX";
      params[`FID_INPUT_ISCD_${k + 1}`] = c;
    });
    try {
      const j = await kisGet(
        "/uapi/domestic-stock/v1/quotations/intstock-multprice",
        "FHKST11300006",
        params,
      );
      for (const r of ((j.output as Record<string, string>[]) ?? [])) {
        const vol = n(r.acml_vol);
        if (vol <= 0) continue; // NXT 미체결 종목 제외
        out.traded++;
        out.value += n(r.acml_tr_pbmn);
        const price = n(r.inter2_prpr);
        const prev = n(r.inter2_prdy_clpr);
        if (prev <= 0 || price <= 0) continue;
        if (price > prev) out.up++;
        else if (price < prev) out.down++;
        else out.flat++;
      }
    } catch {
      /* 배치 실패 시 건너뜀 */
    }
    if (i + 30 < codes.length) await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

/**
 * NXT 거래 상위 종목 (거래대금 순).
 * KRX 투자자별 순매수 데이터가 없는 시간대(프리마켓 등)에 시장수급 대체용.
 */
export async function nxtActive(
  codes: string[],
  names: Map<string, string>,
  top = 15,
  exchange: "NX" | "UN" = "NX",
): Promise<FiRow[]> {
  const rows: FiRow[] = [];
  for (let i = 0; i < codes.length; i += 30) {
    const batch = codes.slice(i, i + 30);
    const params: KisParams = {};
    batch.forEach((c, k) => {
      params[`FID_COND_MRKT_DIV_CODE_${k + 1}`] = exchange;
      params[`FID_INPUT_ISCD_${k + 1}`] = c;
    });
    try {
      const j = await kisGet(
        "/uapi/domestic-stock/v1/quotations/intstock-multprice",
        "FHKST11300006",
        params,
      );
      for (const r of ((j.output as Record<string, string>[]) ?? [])) {
        const vol = n(r.acml_vol);
        if (vol <= 0) continue;
        const code = r.inter_shrn_iscd;
        const price = n(r.inter2_prpr);
        const prev = n(r.inter2_prdy_clpr);
        rows.push({
          code,
          name: names.get(code) ?? r.inter_kor_isnm ?? code,
          price,
          changePct: prev > 0 && price > 0 ? +(((price - prev) / prev) * 100).toFixed(2) : 0,
          foreign: 0,
          inst: 0,
          net: 0,
          foreignValue: 0,
          instValue: 0,
          netValue: 0,
          krxVol: 0,
          unVol: vol,
          nxtShare: exchange === "NX" ? 100 : -1,
          nxtValue: n(r.acml_tr_pbmn),
        });
      }
    } catch {
      /* 배치 실패 시 건너뜀 */
    }
    if (i + 30 < codes.length) await new Promise((r) => setTimeout(r, 120));
  }
  rows.sort((a, b) => (b.nxtValue ?? 0) - (a.nxtValue ?? 0));
  return rows.slice(0, top);
}

// ---- 거래소별 차트 (KRX / NXT / 통합) ----
export interface KisCandle {
  time: number; // KST 벽시계를 그대로 표시 (기존 네이버 차트와 동일 규칙)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const kstUnix = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  Math.floor(Date.UTC(y, mo - 1, d, h, mi) / 1000);

const ymd = (s: string) => [+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8)] as const;

/** 일/주/월/년봉 — FID_PERIOD_DIV_CODE: D W M Y */
export async function exchangeBars(
  code: string,
  exchange: Exchange,
  period: "D" | "W" | "M" | "Y",
  from: string,
  to: string,
): Promise<KisCandle[]> {
  const j = await kisGet(
    "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
    "FHKST03010100",
    {
      FID_COND_MRKT_DIV_CODE: exchange,
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: from,
      FID_INPUT_DATE_2: to,
      FID_PERIOD_DIV_CODE: period,
      FID_ORG_ADJ_PRC: "0",
    },
  );
  const rows = (j.output2 as Record<string, string>[]) ?? [];
  return rows
    .filter((r) => r.stck_bsop_date && n(r.stck_clpr) > 0)
    .map((r) => {
      const [y, mo, d] = ymd(r.stck_bsop_date);
      const close = n(r.stck_clpr);
      return {
        time: kstUnix(y, mo, d),
        open: n(r.stck_oprc) || close,
        high: n(r.stck_hgpr) || close,
        low: n(r.stck_lwpr) || close,
        close,
        volume: n(r.acml_vol),
      };
    })
    .sort((a, b) => a.time - b.time);
}

/**
 * 분봉 — KIS는 요청 시각 기준 직전 30건(1분봉)만 주므로 시각을 거슬러 올라가며 수집 후 리샘플.
 * NXT는 08:00~20:00까지 거래되므로 그 범위를 커버한다.
 */
export async function exchangeMinutes(
  code: string,
  exchange: Exchange,
  unit: number,
): Promise<KisCandle[]> {
  // 한 번에 30분치를 주므로 08:30~20:00을 30분 간격 창으로 나눠 병렬 조회
  const windows: string[] = [];
  for (let m = 8 * 60 + 30; m <= 20 * 60; m += 30) {
    windows.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`,
    );
  }
  const raw = new Map<number, KisCandle>();
  const fetchWindow = async (hour: string) => {
    try {
      const j = await kisGet(
        "/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice",
        "FHKST03010200",
        {
          FID_COND_MRKT_DIV_CODE: exchange,
          FID_INPUT_ISCD: code,
          FID_INPUT_HOUR_1: hour,
          FID_PW_DATA_INCU_YN: "Y",
          FID_ETC_CLS_CODE: "",
        },
      );
      for (const r of ((j.output2 as Record<string, string>[]) ?? [])) {
        const date = r.stck_bsop_date;
        const t = r.stck_cntg_hour;
        if (!date || !t) continue;
        const close = n(r.stck_prpr);
        if (close <= 0) continue;
        const [y, mo, d] = ymd(date);
        const time = kstUnix(y, mo, d, +t.slice(0, 2), +t.slice(2, 4));
        if (raw.has(time)) continue;
        raw.set(time, {
          time,
          open: n(r.stck_oprc) || close,
          high: n(r.stck_hgpr) || close,
          low: n(r.stck_lwpr) || close,
          close,
          volume: n(r.cntg_vol),
        });
      }
    } catch {
      /* 해당 구간 실패 시 건너뜀 */
    }
  };
  // KIS 초당 호출제한에 맞춰 10건씩 병렬
  for (let i = 0; i < windows.length; i += 10) {
    await Promise.all(windows.slice(i, i + 10).map(fetchWindow));
    if (i + 10 < windows.length) await new Promise((r) => setTimeout(r, 500));
  }
  const list = [...raw.values()].sort((a, b) => a.time - b.time);
  if (unit <= 1) return list;
  // unit분으로 리샘플
  const out: KisCandle[] = [];
  const bucket = unit * 60;
  for (const c of list) {
    const t = Math.floor(c.time / bucket) * bucket;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else {
      out.push({ ...c, time: t });
    }
  }
  return out;
}

// ---- 멀티종목 통합 시세 (한 번에 30종목) ----
export interface UnQuote {
  code: string;
  price: number;
  changePct: number;
  volume: number;
  prevClose: number;
}

/**
 * 여러 종목의 통합(KRX+NXT) 시세를 한 번에 조회.
 * 종목당 개별 호출 대비 호출 수가 1/30로 줄어 로딩이 크게 빨라진다.
 */
export async function unifiedQuotes(codes: string[]): Promise<Map<string, UnQuote>> {
  const map = new Map<string, UnQuote>();
  for (let i = 0; i < codes.length; i += 30) {
    const batch = codes.slice(i, i + 30);
    const params: KisParams = {};
    batch.forEach((c, k) => {
      params[`FID_COND_MRKT_DIV_CODE_${k + 1}`] = "UN";
      params[`FID_INPUT_ISCD_${k + 1}`] = c;
    });
    try {
      const j = await kisGet(
        "/uapi/domestic-stock/v1/quotations/intstock-multprice",
        "FHKST11300006",
        params,
      );
      for (const r of ((j.output as Record<string, string>[]) ?? [])) {
        const code = r.inter_shrn_iscd;
        if (!code) continue;
        const price = n(r.inter2_prpr);
        const prevClose = n(r.inter2_prdy_clpr);
        map.set(code, {
          code,
          price,
          // 전일 종가를 알면 그것으로 계산 (시간외 세션에서도 '전일 대비'로 일관)
          changePct:
            prevClose > 0 && price > 0
              ? +(((price - prevClose) / prevClose) * 100).toFixed(2)
              : Number(r.prdy_ctrt) || 0,
          volume: n(r.acml_vol),
          prevClose,
        });
      }
    } catch {
      /* 배치 실패 시 해당 구간은 원본 값 유지 */
    }
    if (i + 30 < codes.length) await new Promise((r) => setTimeout(r, 120));
  }
  return map;
}

// ---- 등락률 순위 (거래소별) ----
// 통합(UN)은 이 TR에서 미지원 → KRX(J) 또는 NXT(NX)만 가능
export interface RankRow {
  code: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
}

export async function fluctuationRank(
  exchange: "J" | "NX",
  market: "ALL" | "KOSPI" | "KOSDAQ",
  dir: "up" | "down",
): Promise<RankRow[]> {
  const iscd = market === "KOSPI" ? "0001" : market === "KOSDAQ" ? "1001" : "0000";
  const j = await kisGet("/uapi/domestic-stock/v1/ranking/fluctuation", "FHPST01700000", {
    fid_cond_mrkt_div_code: exchange,
    fid_cond_scr_div_code: "20170",
    fid_input_iscd: iscd,
    fid_rank_sort_cls_code: dir === "up" ? "0" : "1",
    fid_input_cnt_1: "0",
    fid_prc_cls_code: "0",
    fid_input_price_1: "",
    fid_input_price_2: "",
    fid_vol_cnt: "",
    fid_trgt_cls_code: "0",
    fid_trgt_exls_cls_code: "0",
    fid_div_cls_code: "0",
    fid_rsfl_rate1: "",
    fid_rsfl_rate2: "",
  });
  const out = (j.output as Record<string, string>[]) ?? [];
  const rows = out.map((r) => ({
    code: r.stck_shrn_iscd ?? r.mksc_shrn_iscd,
    name: r.hts_kor_isnm,
    price: n(r.stck_prpr),
    changePct: Number(r.prdy_ctrt) || 0,
    volume: n(r.acml_vol),
  }));
  // KIS가 반환하는 순위는 기간등락률(prd_rsfl_rate) 기준이라 당일 등락률과 어긋남 → 직접 정렬
  rows.sort((a, b) => (dir === "up" ? b.changePct - a.changePct : a.changePct - b.changePct));
  return rows;
}

// ---- 종목별 외국인·기관 실시간 추정 순매수 ----
// 확정 수급(가집계)은 장 마감 후에만 나오지만, 이 TR은 장중 시간대별 추정치를 제공한다.
// 제공 시점: 09:30 / 10:00 / 11:20 / 13:20 / 14:30 (누적 기준)
const EST_HOURS: Record<string, string> = {
  "1": "09:30",
  "2": "10:00",
  "3": "11:20",
  "4": "13:20",
  "5": "14:30",
};

export interface InvestorEstimate {
  time: string; // "14:30"
  외국인: number; // 추정 순매수 수량(주)
  기관: number;
  합계: number;
}

export async function stockInvestorEstimate(code: string): Promise<InvestorEstimate[]> {
  const j = await kisGet(
    "/uapi/domestic-stock/v1/quotations/investor-trend-estimate",
    "HHPTJ04160200",
    { MKSC_SHRN_ISCD: code },
  );
  const rows = (j.output2 as Record<string, string>[]) ?? [];
  return rows
    .map((r) => ({
      time: EST_HOURS[r.bsop_hour_gb] ?? r.bsop_hour_gb,
      외국인: n(r.frgn_fake_ntby_qty),
      기관: n(r.orgn_fake_ntby_qty),
      합계: n(r.sum_fake_ntby_qty),
    }))
    .filter((r) => r.외국인 !== 0 || r.기관 !== 0)
    .sort((a, b) => a.time.localeCompare(b.time));
}
