// Yahoo Finance — 지수/환율/원자재/가상자산/미국 국채. 서버 전용.
import YahooFinance from "yahoo-finance2";
import type { FxRate, Quote } from "./types";

export const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/**
 * 여러 종목 시세를 빠짐없이 받아온다.
 *
 * 야후는 한 번에 여러 종목을 물으면 일부를 말없이 빼고 준다. 서버(배포 환경)에서
 * 특히 심해서, 시총 상위에 일라이릴리·머크·화이자가 통째로 빠지고 섹터 평가에서
 * 검색한 종목이 사라지는 일이 있었다. 로컬에서는 잘 나와 눈치채기 어렵다.
 *
 * 그래서 받은 결과에서 빠진 종목을 찾아 다시 묻는다.
 *   1차 40개씩 묶어 조회 → 빠진 것만 10개씩 재조회 → 그래도 없으면 한 종목씩
 */
export async function quoteAll(
  symbols: string[],
  opts: { withMarketCap?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const want = [...new Set(symbols.filter(Boolean))];
  const got = new Map<string, Record<string, unknown>>();

  const ask = async (list: string[]) => {
    if (!list.length) return;
    try {
      const r = await yahooFinance.quote(list);
      for (const x of (Array.isArray(r) ? r : [r]) as Record<string, unknown>[]) {
        if (x?.symbol) got.set(String(x.symbol), x);
      }
    } catch {
      /* 묶음이 통째로 실패해도 아래 재시도에서 건진다 */
    }
  };

  for (let i = 0; i < want.length; i += 40) await ask(want.slice(i, i + 40));

  let missing = want.filter((s) => !got.has(s));
  if (missing.length) {
    for (let i = 0; i < missing.length; i += 10) await ask(missing.slice(i, i + 10));
    missing = want.filter((s) => !got.has(s));
  }
  // 마지막으로 한 종목씩 — 정말 없는 종목까지 계속 묻지 않도록 상한을 둔다
  for (const s of missing.slice(0, 25)) await ask([s]);

  if (opts.withMarketCap) await repairMarketCap(got);
  return want.map((s) => got.get(s)).filter((x): x is Record<string, unknown> => !!x);
}

/**
 * 시가총액이 비어 온 종목을 메운다.
 *
 * 야후는 배포 서버(데이터센터 IP)에서 일부 종목의 시가총액과 발행주식수를
 * 통째로 빼고 준다. 주가·PER 은 정상으로 오는데 시총만 없다. 실제로 화이자·
 * 일라이릴리·머크가 이래서 시총 상위와 섹터 평가에서 사라졌었다.
 * 상세조회로 한 번 더 물어보고, 그래도 없으면 주식수 × 주가로 직접 계산한다.
 */
async function repairMarketCap(got: Map<string, Record<string, unknown>>) {
  const broken = [...got.entries()]
    .filter(([, x]) => !(Number(x.marketCap) > 0) && Number(x.regularMarketPrice) > 0)
    .slice(0, 20); // 상한 — 지수처럼 원래 시총이 없는 것까지 계속 묻지 않도록
  if (!broken.length) return;
  await Promise.all(
    broken.map(async ([sym, x]) => {
      try {
        const d = await yahooFinance.quoteSummary(sym, {
          modules: ["price", "summaryDetail", "defaultKeyStatistics"],
        });
        const p = (d.price ?? {}) as Record<string, unknown>;
        const sd = (d.summaryDetail ?? {}) as Record<string, unknown>;
        const ks = (d.defaultKeyStatistics ?? {}) as Record<string, unknown>;
        const price = Number(x.regularMarketPrice) || Number(p.regularMarketPrice) || 0;
        const shares = Number(ks.sharesOutstanding) || Number(ks.floatShares) || 0;
        const cap =
          Number(p.marketCap) || Number(sd.marketCap) || (shares && price ? shares * price : 0);
        if (cap > 0) got.set(sym, { ...x, marketCap: cap });
      } catch {
        /* 못 메우면 그대로 둔다 */
      }
    }),
  );
}

interface YQ {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
}

export async function quotes(symbols: string[]): Promise<YQ[]> {
  return (await quoteAll(symbols)) as YQ[];
}

/** 코스피/코스닥 지수 */
export async function indices(): Promise<Quote[]> {
  const rows = await quotes(["^KS11", "^KQ11"]);
  const names: Record<string, string> = { "^KS11": "코스피", "^KQ11": "코스닥" };
  return rows.map((r) => ({
    symbol: r.symbol ?? "",
    name: names[r.symbol ?? ""] ?? r.symbol ?? "",
    price: r.regularMarketPrice ?? 0,
    change: r.regularMarketChange ?? 0,
    changePct: r.regularMarketChangePercent ?? 0,
    volume: r.regularMarketVolume,
  }));
}

/** 환율 (엔은 100엔 기준으로 환산) */
export async function fx(): Promise<FxRate[]> {
  const map: { sym: string; label: string; mult: number }[] = [
    { sym: "KRW=X", label: "달러 USD/KRW", mult: 1 },
    { sym: "EURKRW=X", label: "유로 EUR/KRW", mult: 1 },
    { sym: "JPYKRW=X", label: "엔 JPY/KRW · 100엔", mult: 100 },
    { sym: "CNYKRW=X", label: "위안 CNY/KRW", mult: 1 },
  ];
  const rows = await quotes(map.map((m) => m.sym));
  return map.map((m) => {
    const r = rows.find((x) => x.symbol === m.sym);
    return {
      label: m.label,
      price: (r?.regularMarketPrice ?? 0) * m.mult,
      changePct: r?.regularMarketChangePercent ?? 0,
    };
  });
}

export interface Spark {
  price: number;
  changePct: number;
  spark: number[];
}

/** 스파크라인용: 최근 종가 시계열 + 현재가/등락률 (mult로 단위 환산) */
export async function spark(symbol: string, mult = 1): Promise<Spark> {
  const period1 = new Date(Date.now() - 50 * 86400_000);
  const r = await yahooFinance.chart(symbol, { period1, interval: "1d" });
  const bars = (r.quotes ?? [])
    .filter((q) => q.close != null && q.date != null)
    .map((q) => ({ date: q.date as Date, close: q.close as number }));
  const closes = bars.map((q) => q.close);
  const meta = (r.meta ?? {}) as { regularMarketPrice?: number; previousClose?: number };
  const rmp = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
  // 등락률은 '전 거래일 종가' 기준.
  // 마지막 봉이 '현재 진행 중인 세션'이면 그 직전 봉이 전 거래일 종가다.
  // (현재가와 마지막 종가는 미세하게 다를 수 있어 값이 아닌 봉 날짜로 판정)
  const lastBar = bars[bars.length - 1];
  const ageHours = lastBar ? (Date.now() - new Date(lastBar.date).getTime()) / 3_600_000 : 999;
  const prev =
    meta.previousClose ??
    (ageHours < 30 ? (closes[closes.length - 2] ?? rmp) : (closes[closes.length - 1] ?? rmp));
  return {
    price: rmp * mult,
    changePct: prev ? (rmp / prev - 1) * 100 : 0,
    spark: closes.slice(-30).map((c) => c * mult),
  };
}

/** 미국 국채 만기별 금리 (2/5/10/30년) — 3년은 Yahoo 미제공 */
export async function usYields(): Promise<Record<string, { value: number; changePct: number }>> {
  const map: Record<string, string> = { "2YY=F": "2Y", "^FVX": "5Y", "^TNX": "10Y", "^TYX": "30Y" };
  const rows = await quotes(Object.keys(map));
  const out: Record<string, { value: number; changePct: number }> = {};
  for (const r of rows) {
    const m = map[r.symbol ?? ""];
    if (m) out[m] = { value: r.regularMarketPrice ?? 0, changePct: r.regularMarketChangePercent ?? 0 };
  }
  return out;
}

type ChartInterval = "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1wk" | "1mo";

/** 지수 캔들 (봉주기별). kind: min|1D|1W|1M|1Y */
export async function indexChart(symbol: string, kind: string = "1D") {
  const now = Date.now();
  const D = 86400_000;
  let interval: ChartInterval = "1d";
  let period1 = new Date(now - 400 * D);
  const MIN: Record<string, number> = { "1m": 5, "5m": 12, "15m": 30, "30m": 45, "60m": 90 };
  if (kind in MIN) {
    interval = kind as ChartInterval;
    period1 = new Date(now - MIN[kind] * D);
  } else if (kind === "min") {
    interval = "5m";
    period1 = new Date(now - 12 * D);
  } else if (kind === "1W") {
    interval = "1wk";
    period1 = new Date(now - 3 * 365 * D);
  } else if (kind === "1M" || kind === "1Y") {
    interval = "1mo";
    period1 = new Date(now - 12 * 365 * D);
  }
  const r = await yahooFinance.chart(symbol, { period1, interval });
  const KST = 9 * 3600; // lightweight-charts는 UTC 표시 → KST 벽시계로 보이게 +9h (종목 차트와 통일)
  let out = (r.quotes ?? [])
    .filter((q) => q.close != null && q.open != null)
    .map((q) => ({
      time: Math.floor(new Date(q.date).getTime() / 1000) + KST,
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: (q.volume as number) ?? 0,
    }));
  if (kind === "1Y") {
    const byYear = new Map<number, (typeof out)[number]>();
    for (const c of out) {
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
    out = [...byYear.values()].sort((a, b) => a.time - b.time);
  }
  return out;
}

async function group(map: Record<string, string>): Promise<Quote[]> {
  const rows = await quotes(Object.keys(map));
  const order = Object.keys(map);
  return rows
    .map((r) => ({
      symbol: r.symbol ?? "",
      name: map[r.symbol ?? ""] ?? r.symbol ?? "",
      price: r.regularMarketPrice ?? 0,
      change: r.regularMarketChange ?? 0,
      changePct: r.regularMarketChangePercent ?? 0,
    }))
    .sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol));
}

/** 원자재 (금·은·WTI·브렌트·천연가스) */
export async function commodities(): Promise<Quote[]> {
  return group({
    "GC=F": "금",
    "SI=F": "은",
    "CL=F": "WTI 원유",
    "BZ=F": "브렌트유",
    "NG=F": "천연가스",
  });
}

/** 가상자산 (비트코인·이더리움·리플) */
export async function crypto(): Promise<Quote[]> {
  return group({
    "BTC-USD": "비트코인",
    "ETH-USD": "이더리움",
    "XRP-USD": "리플",
  });
}
