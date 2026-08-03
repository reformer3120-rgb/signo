import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import {
  usIndices,
  usSectors,
  usMovers,
  usMarketCap,
  usMarketIndicators,
  type UsIndicator,
  type UsQuote,
} from "@/lib/us";
import { koName } from "@/lib/usKo";

export const revalidate = 0;
export const maxDuration = 60;

const f = (n: number, d = 2) =>
  n.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (n: number, d = 2) => `${n > 0 ? "+" : ""}${f(n, d)}`;
const cap = (v: number) =>
  v >= 1e12 ? `${(v / 1e12).toFixed(2)}T$` : v >= 1e9 ? `${(v / 1e9).toFixed(0)}B$` : `${v}`;
const nm = (s: UsQuote) => `${koName(s.symbol) ?? s.name}(${s.symbol})`;

/** 뉴욕 현지 시각 */
function nyNow() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}
function kstNow() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}

async function build() {
  const t = nyNow();
  const [indices, sectors, gainers, losers, actives, caps, ind] = await Promise.all([
    usIndices().catch(() => []),
    usSectors().catch(() => []),
    usMovers("gainers", 10).catch(() => []),
    usMovers("losers", 10).catch(() => []),
    usMovers("actives", 10).catch(() => []),
    usMarketCap(15).catch(() => []),
    usMarketIndicators().catch(() => null),
  ]);

  const L: string[] = [];
  L.push("SIGNO 미국증시 마감 리포트");
  L.push(`${t.date} ${t.time} 뉴욕 · 작성 ${kstNow()} KST`);
  L.push("=".repeat(50), "");

  if (indices.length) {
    L.push("[ 지수 ]");
    for (const q of indices) L.push(`  ${q.name.padEnd(12)} ${f(q.price).padStart(12)}  ${sign(q.changePct)}%`);
    L.push("");
  }

  if (sectors.length) {
    L.push("[ 섹터 강약 ]");
    L.push(`  강세: ${sectors.slice(0, 4).map((s) => `${s.name} ${sign(s.changePct)}%`).join(", ")}`);
    L.push(`  약세: ${sectors.slice(-4).reverse().map((s) => `${s.name} ${sign(s.changePct)}%`).join(", ")}`);
    L.push("");
  }

  const movers = (title: string, rows: UsQuote[]) => {
    if (!rows.length) return;
    L.push(`[ ${title} ]`);
    rows.slice(0, 8).forEach((s, i) =>
      L.push(`  ${String(i + 1).padStart(2)}. ${nm(s).padEnd(28)} ${f(s.price).padStart(10)}  ${sign(s.changePct)}%`),
    );
    L.push("");
  };
  movers("상승률 상위", gainers);
  movers("하락률 상위", losers);
  movers("거래 활발", actives);

  if (caps.length) {
    L.push("[ 시가총액 상위 ]");
    caps.forEach((s, i) =>
      L.push(
        `  ${String(i + 1).padStart(2)}. ${nm(s).padEnd(28)} ${f(s.price).padStart(10)}  ${sign(s.changePct).padStart(8)}%  ${cap(s.marketCap)}`,
      ),
    );
    L.push("");
  }

  if (ind) {
    const grp = (title: string, items: UsIndicator[], d = 2) => {
      if (!items.length) return;
      L.push(`  ${title}`);
      for (const x of items)
        L.push(`    ${x.label.padEnd(18)} ${f(x.price, x.unit === "%" ? 3 : d).padStart(12)}  ${sign(x.changePct)}%`);
    };
    L.push("[ 시장지표 ]");
    grp("미국 국채금리", ind.yields);
    grp("달러 · 변동성", ind.dollar);
    grp("지수선물", ind.futures);
    grp("원자재", ind.commodities);
    grp("환율", ind.fx, 4);
    grp("가상자산", ind.crypto, 0);
    L.push("");
  }

  L.push("-".repeat(50));
  L.push("SIGNO · 데이터: 야후 파이낸스");
  return { text: L.join("\n"), date: t.date, time: t.time };
}

export async function GET() {
  try {
    const data = await cached(`us-report:${nyNow().date}:${Math.floor(Date.now() / 300_000)}`, 300, build);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
