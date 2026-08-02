import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { spark } from "@/lib/yahoo";
import { daily } from "@/lib/naver";

export const revalidate = 0;
export const maxDuration = 60;

const FX: [string, string, number][] = [
  ["달러 USD/KRW", "KRW=X", 1],
  ["유로 EUR/KRW", "EURKRW=X", 1],
  ["엔 JPY/KRW · 100엔", "JPYKRW=X", 100],
];
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

async function build() {
  const fxBase = await Promise.all(FX.map(async ([label, sym, m]) => ({ label, ...(await spark(sym, m)) })));
  // 위안/원 = USD/KRW ÷ USD/CNY (CNYKRW=X는 야후 데이터 희박)
  const usdkrwItem = fxBase.find((f) => f.label.startsWith("달러"))!;
  const usdcny = await spark("CNY=X");
  const kS = usdkrwItem.spark;
  const cS = usdcny.spark;
  const n = Math.min(kS.length, cS.length);
  const cnySpark = Array.from({ length: n }, (_, i) => +(kS[kS.length - n + i] / cS[cS.length - n + i]).toFixed(2));
  const cnyPrev = cnySpark[cnySpark.length - 2] ?? cnySpark[cnySpark.length - 1] ?? 0;
  const cnyPrice = +(usdkrwItem.price / (usdcny.price || 1)).toFixed(2);
  const cny = {
    label: "위안 CNY/KRW",
    price: cnyPrice,
    changePct: cnyPrev ? (cnyPrice / cnyPrev - 1) * 100 : 0,
    spark: cnySpark,
  };
  const fx = [...fxBase, cny];
  const usdkrw = usdkrwItem.price || 1;
  const [commodities, crypto] = await Promise.all([
    Promise.all(COMM.map(async ([label, sym]) => ({ label, ...(await spark(sym)) }))),
    Promise.all(CRYPTO.map(async ([label, sym]) => ({ label, ...(await spark(sym, usdkrw)) }))),
  ]);
  // 코스피200 선물 (네이버 FUT). 코스닥 선물은 무료 심볼 미확보.
  let futures: { label: string; price: number; changePct: number; spark: number[] }[] = [];
  try {
    const d = await daily("FUT", 35);
    const c = d.map((x) => x.close);
    const price = c[c.length - 1] ?? 0;
    const prev = c[c.length - 2] ?? price;
    futures = [{ label: "코스피200 선물", price, changePct: prev ? (price / prev - 1) * 100 : 0, spark: c.slice(-30) }];
  } catch {
    futures = [];
  }
  return { fx, commodities, crypto, futures };
}

export async function GET() {
  try {
    const data = await cached("market:spark", 60, build);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
