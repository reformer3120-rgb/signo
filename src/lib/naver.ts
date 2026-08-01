// 네이버 금융 (fchart) — 폴백 데이터 소스. 서버 전용.
import type { Candle, Quote } from "./types";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" };

async function fetchEucKr(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  const buf = await res.arrayBuffer();
  return new TextDecoder("euc-kr").decode(buf);
}

function items(xml: string): string[][] {
  const out: string[][] = [];
  const re = /data="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1].split("|"));
  return out;
}

const kstToUnix = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  Math.floor(Date.UTC(y, mo - 1, d, h, mi) / 1000); // KST 벽시계를 그대로 표시

/** 일/주/월봉 (네이버 fchart는 실제 OHLC 제공) — tf: day|week|month */
export async function bars(code: string, tf: "day" | "week" | "month", count = 250): Promise<Candle[]> {
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=${tf}&count=${count}&requestType=0`;
  const xml = await fetchEucKr(url);
  const rows: Candle[] = [];
  for (const p of items(xml)) {
    if (p.length < 6) continue;
    const t = p[0];
    const close = Number(p[4]);
    if (!Number.isFinite(close)) continue;
    rows.push({
      time: kstToUnix(+t.slice(0, 4), +t.slice(4, 6), +t.slice(6, 8)),
      open: Number(p[1]) || close,
      high: Number(p[2]) || close,
      low: Number(p[3]) || close,
      close,
      volume: Number(p[5]) || 0,
    });
  }
  return rows.sort((a, b) => a.time - b.time);
}

export const daily = (code: string, count = 250) => bars(code, "day", count);

/** 연봉 (네이버 미지원 → 월봉을 연 단위로 집계) */
export async function yearly(code: string): Promise<Candle[]> {
  const months = await bars(code, "month", 600);
  const byYear = new Map<number, Candle>();
  for (const c of months) {
    const y = new Date(c.time * 1000).getUTCFullYear();
    const cur = byYear.get(y);
    if (!cur) byYear.set(y, { ...c, time: Math.floor(Date.UTC(y, 0, 1) / 1000) });
    else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  return [...byYear.values()].sort((a, b) => a.time - b.time);
}

/**
 * 분봉: 네이버 분데이터는 분당 '종가 + 당일 누적거래량'만 제공.
 * → 누적을 분당으로 diff, 종가 시계열을 unit분 OHLC로 리샘플.
 */
export async function minute(code: string, unit: number): Promise<Candle[]> {
  const count = Math.max(1500, Math.min(unit * 300, 8000));
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=minute&count=${count}&requestType=0`;
  const xml = await fetchEucKr(url);

  // 1) 파싱: {t, close, cumVol}
  const raw: { t: number; day: string; close: number; cvol: number }[] = [];
  for (const p of items(xml)) {
    if (p.length < 6) continue;
    const s = p[0];
    const close = Number(p[4]);
    if (!Number.isFinite(close)) continue;
    raw.push({
      t: kstToUnix(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)),
      day: s.slice(0, 8),
      close,
      cvol: Number(p[5]) || 0,
    });
  }
  raw.sort((a, b) => a.t - b.t);

  // 2) 당일 누적 → 분당 거래량
  const prevByDay = new Map<string, number>();
  const perMin = raw.map((r) => {
    const prev = prevByDay.get(r.day);
    const v = prev === undefined ? r.cvol : Math.max(0, r.cvol - prev);
    prevByDay.set(r.day, r.cvol);
    return { t: r.t, close: r.close, vol: v };
  });

  // 3) unit분 OHLC 리샘플
  const bucket = unit * 60;
  const map = new Map<number, Candle>();
  for (const r of perMin) {
    const key = Math.floor(r.t / bucket) * bucket;
    const c = map.get(key);
    if (!c) map.set(key, { time: key, open: r.close, high: r.close, low: r.close, close: r.close, volume: r.vol });
    else {
      c.high = Math.max(c.high, r.close);
      c.low = Math.min(c.low, r.close);
      c.close = r.close;
      c.volume += r.vol;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

// ---- 종목 일별 외국인/기관 순매매 (장기, item/frgn 페이지네이션) ----
export interface FrgnRow {
  date: string;
  org: number; // 기관 순매매
  frgn: number; // 외국인 순매매
}

async function frgnPage(code: string, page: number): Promise<FrgnRow[]> {
  const html = await fetchEucKr(`https://finance.naver.com/item/frgn.naver?code=${code}&page=${page}`);
  const rows: FrgnRow[] = [];
  // 각 데이터 행: 날짜 span + 이후 숫자 span들 (종가,전일비,등락률,거래량,기관,외국인,보유)
  const re = /<span class="tah p10 gray03">(\d{4})\.(\d{2})\.(\d{2})<\/span>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const date = `${m[1]}${m[2]}${m[3]}`;
    // 모든 tah 값 중 순수 정수만 (등락률/보유비율 % 제외)
    const raw = [...m[4].matchAll(/<span class="tah[^"]*"[^>]*>\s*([\-\+\d,%.]+)/g)].map((x) => x[1]);
    const nums = raw
      .filter((s) => /^[-+]?[\d,]+$/.test(s))
      .map((s) => Number(s.replace(/[,+]/g, "")));
    // nums: [종가, 전일비, 거래량, 기관, 외국인, 외국인보유]
    if (nums.length >= 3) {
      rows.push({ date, org: nums[nums.length - 3], frgn: nums[nums.length - 2] });
    }
  }
  return rows;
}

/** 최근 days 거래일치 외국인/기관 순매매 (필요한 페이지만) */
export async function frgnDaily(code: string, days: number): Promise<FrgnRow[]> {
  const pages = Math.min(Math.ceil(days / 20) + 1, 15);
  const all: FrgnRow[] = [];
  for (let p = 1; p <= pages; p++) {
    const rows = await frgnPage(code, p);
    if (!rows.length) break;
    all.push(...rows);
  }
  return all.slice(0, days);
}

// ---- 등락 종목수 (sise_index 페이지) ----
export interface Breadth {
  upper: number; // 상한
  up: number;
  flat: number; // 보합
  down: number;
  lower: number; // 하한
}

export async function breadth(market: "KOSPI" | "KOSDAQ"): Promise<Breadth> {
  const html = await fetchEucKr(`https://finance.naver.com/sise/sise_index.naver?code=${market}`);
  const txt = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const g = (label: string) => {
    const m = txt.match(new RegExp(label + "\\s*([\\d,]+)"));
    return m ? Number(m[1].replace(/,/g, "")) : 0;
  };
  return {
    upper: g("상한종목수"),
    up: g("상승종목수"),
    flat: g("보합종목수"),
    down: g("하락종목수"),
    lower: g("하한종목수"),
  };
}

// ---- 금리 (네이버 marketindex, 국내 국고채/CD/콜 등) ----
export interface Rate {
  label: string;
  value: number; // %
  change: number;
  changePct: number;
  date: string;
}

async function rateOf(cd: string, label: string): Promise<Rate | null> {
  const html = await fetchEucKr(
    `https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=${cd}`,
  );
  const tr = html.match(/<tr class="(up|down|nc)">([\s\S]*?)<\/tr>/);
  if (!tr) return null;
  const dir = tr[1] === "down" ? -1 : 1;
  const block = tr[2];
  const date = (block.match(/class="date">\s*([\d.]+)/) || [])[1] ?? "";
  const nums = [...block.matchAll(/class="num">([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  const f = (s: string) => parseFloat((s || "").replace(/[^0-9.]/g, "")) || 0;
  return {
    label,
    value: f(nums[0]),
    change: dir * f(nums[1]),
    changePct: dir * f(nums[2]),
    date,
  };
}

const RATE_CODES: [string, string][] = [
  ["IRR_GOVT03Y", "국고채 3년"],
  ["IRR_CORP03Y", "회사채 3년(AA-)"],
  ["IRR_CD91", "CD 91일"],
  ["IRR_CALL", "콜금리"],
];

export async function rates(): Promise<Rate[]> {
  const out = await Promise.all(RATE_CODES.map(([cd, label]) => rateOf(cd, label)));
  return out.filter((r): r is Rate => r !== null);
}

/** 간이 시세 (일봉 최근 2개로 등락 계산) */
export async function quote(code: string, name = code): Promise<Quote> {
  const d = await daily(code, 3);
  const last = d[d.length - 1];
  const prev = d[d.length - 2] ?? last;
  const change = last.close - prev.close;
  return {
    symbol: code,
    name,
    price: last.close,
    change,
    changePct: prev.close ? (change / prev.close) * 100 : 0,
    volume: last.volume,
    currency: "KRW",
  };
}
