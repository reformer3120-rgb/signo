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
}

export async function foreignInstitution(
  market: "ALL" | "KOSPI" | "KOSDAQ" = "ALL",
  enrich = 15,
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
      FID_RANK_SORT_CLS_CODE: "0",
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
  // 순매수 대금(외국인+기관) 큰 순
  rows.sort((a, b) => b.netValue - a.netValue);

  // 상위 표시분만 통합(KRX+NXT) 거래량 조회 → NXT 비중 산출.
  // 이 TR 자체는 KRX 기준이라 순매수 수량은 KRX 값임.
  const target = rows.slice(0, enrich);
  for (let i = 0; i < target.length; i += 4) {
    await Promise.all(
      target.slice(i, i + 4).map(async (r) => {
        try {
          const u = await unifiedQuote(r.code);
          if (u.volume > 0) {
            r.unVol = u.volume;
            const nxt = Math.max(0, u.volume - r.krxVol);
            r.nxtShare = +((nxt / u.volume) * 100).toFixed(1);
          }
        } catch {
          /* 통합 시세 실패 시 KRX 값만 유지 */
        }
      }),
    );
    await new Promise((r) => setTimeout(r, 250));
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
