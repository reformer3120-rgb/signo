// 시장지표: 환율 · 원자재 · 가상자산 · 선물. 서버 전용.
// /api/market 과 마감리포트가 공유.
import { spark } from "./yahoo";
import { daily } from "./naver";

export interface MarketItem {
  label: string;
  price: number;
  changePct: number;
  spark: number[];
}
export interface MarketIndicators {
  fx: MarketItem[];
  commodities: MarketItem[];
  crypto: MarketItem[];
  futures: MarketItem[];
}

// 환율은 국내 고시환율(네이버/하나은행) 기준 — 전 거래일 대비 등락이 국내 표기와 일치한다.
// 스파크라인 모양만 야후 시계열을 사용.
const FX_KR: [string, string, string, number][] = [
  ["달러 USD/KRW", "FX_USDKRW", "KRW=X", 1],
  ["유로 EUR/KRW", "FX_EURKRW", "EURKRW=X", 1],
  ["엔 JPY/KRW · 100엔", "FX_JPYKRW", "JPYKRW=X", 100],
  ["위안 CNY/KRW", "FX_CNYKRW", "CNY=X", 0],
];

const NAVER_H = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  Referer: "https://m.stock.naver.com/",
  Accept: "application/json",
};

async function naverFx(code: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const r = await fetch(`https://api.stock.naver.com/marketindex/exchange/${code}`, {
      headers: NAVER_H,
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    const e = j.exchangeInfo ?? {};
    const price = Number(String(e.closePrice ?? "").replace(/,/g, "")) || 0;
    const changePct = Number(e.fluctuationsRatio) || 0;
    return price > 0 ? { price, changePct } : null;
  } catch {
    return null;
  }
}
const COMM: [string, string][] = [
  ["금", "GC=F"],
  ["은", "SI=F"],
  ["WTI 원유", "CL=F"],
  ["브렌트유", "BZ=F"],
  ["천연가스", "NG=F"],
];
const CRYPTO: [string, string][] = [
  ["비트코인", "BTC-USD"],
  ["이더리움", "ETH-USD"],
  ["리플", "XRP-USD"],
];
// 글로벌 지수선물 (야후)
const FUT_GLOBAL: [string, string][] = [
  ["나스닥 선물", "NQ=F"],
  ["다우 선물", "YM=F"],
  ["S&P500 선물", "ES=F"],
  ["니케이 선물", "NKD=F"],
];

export async function marketIndicators(): Promise<MarketIndicators> {
  const fx = await Promise.all(
    FX_KR.map(async ([label, nCode, ySym, mult]) => {
      const [kr, yh] = await Promise.all([
        naverFx(nCode),
        spark(ySym, mult || 1).catch(() => ({ price: 0, changePct: 0, spark: [] as number[] })),
      ]);
      // 스파크라인은 야후 시계열을 국내 고시가 수준으로 맞춰 표시
      let sparkline = yh.spark;
      if (kr && yh.price > 0 && sparkline.length) {
        const scale = kr.price / yh.price;
        sparkline = sparkline.map((v) => +(v * scale).toFixed(2));
      }
      return {
        label,
        price: kr?.price ?? yh.price,
        changePct: kr?.changePct ?? yh.changePct,
        spark: sparkline,
      };
    }),
  );
  const usdkrw = fx.find((f) => f.label.startsWith("달러"))?.price || 1;
  const [commodities, crypto] = await Promise.all([
    Promise.all(COMM.map(async ([label, sym]) => ({ label, ...(await spark(sym)) }))),
    Promise.all(CRYPTO.map(async ([label, sym]) => ({ label, ...(await spark(sym, usdkrw)) }))),
  ]);
  // 선물: 코스피200(네이버 FUT) + 글로벌 지수선물(야후)
  let futures: MarketItem[] = [];
  try {
    const d = await daily("FUT", 35);
    const c = d.map((x) => x.close);
    const price = c[c.length - 1] ?? 0;
    const prev = c[c.length - 2] ?? price;
    if (price)
      futures.push({
        label: "코스피200 선물",
        price,
        changePct: prev ? (price / prev - 1) * 100 : 0,
        spark: c.slice(-30),
      });
  } catch {
    /* 코스피200 선물 실패 시 생략 */
  }
  const globalFut = await Promise.all(
    FUT_GLOBAL.map(async ([label, sym]) => {
      try {
        return { label, ...(await spark(sym)) };
      } catch {
        return null;
      }
    }),
  );
  futures = [...futures, ...globalFut.filter((x): x is MarketItem => !!x && x.price > 0)];
  return { fx, commodities, crypto, futures };
}
