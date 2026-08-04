import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import {
  usIndices,
  usSectors,
  usMovers,
  usMarketCap,
  usMarketIndicators,
  usHalfHourly,
  type UsIndicator,
  type UsQuote,
} from "@/lib/us";
import { koName } from "@/lib/usKo";
import { bonds } from "@/lib/naverApi";

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
  // 시장지표 화면과 같은 4개국 국채금리 (한국·일본·미국·유럽)
  const bondRows = await bonds().catch(() => []);
  // 당일 30분 간격 장중 흐름 — 3대 지수와 SK하이닉스 ADR
  const FLOW: [string, string][] = [
    ["^DJI", "다우존스"],
    ["^IXIC", "나스닥"],
    ["^GSPC", "S&P 500"],
    ["SKHY", "SK하이닉스 ADR"],
  ];
  const flows = await Promise.all(FLOW.map(([sym]) => usHalfHourly(sym)));

  const L: string[] = [];
  L.push("SIGNO 미국증시 마감 리포트");
  L.push(`${t.date} ${t.time} 뉴욕 · 작성 ${kstNow()} KST`);
  L.push("=".repeat(50), "");

  if (indices.length) {
    L.push("[ 지수 ]");
    for (const q of indices) L.push(`  ${q.name.padEnd(12)} ${f(q.price).padStart(12)}  ${sign(q.changePct)}%`);
    L.push("");
  }

  // ADR은 프리마켓(04:00~)에도 거래돼 지수와 시간축이 어긋난다 → 정규장만
  const flowLines = FLOW.map(([, label], i) => {
    const pts = flows[i].filter((p) => p.time >= "09:30" && p.time <= "16:00");
    if (!pts.length) return null;
    return `  ${label}: ${pts.map((p) => `${p.time} ${f(p.close)}`).join(" → ")}`;
  }).filter((x): x is string => x !== null);
  if (flowLines.length) {
    L.push("[ 장중 흐름 (30분 간격) ]");
    L.push(...flowLines, "");
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
    // 값의 크기에 따라 소수 자릿수를 정한다 — 비트코인(6만$)과 리플(1$ 미만)이
    // 한 묶음에 있어 자릿수를 고정하면 작은 값이 통째로 잘려 나간다
    const digitsFor = (v: number) => (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 2 : 4);
    const grp = (title: string, items: UsIndicator[], d?: number) => {
      if (!items.length) return;
      L.push(`  ${title}`);
      for (const x of items) {
        const dg = x.unit === "%" ? 3 : (d ?? digitsFor(x.price));
        L.push(`    ${x.label.padEnd(18)} ${f(x.price, dg).padStart(12)}  ${sign(x.changePct)}%`);
      }
    };
    // 화면과 같은 순서: 증시 → 지수 → 지수선물 → 환율 → 원자재 → 가상자산
    L.push("[ 시장지표 ]");
    grp("유럽 증시", ind.europe);
    grp("달러인덱스 · 변동성", ind.dollar);
    grp("지수선물", ind.futures);
    grp("환율", ind.fx, 4);
    grp("원자재", ind.commodities);
    grp("가상자산", ind.crypto);
    L.push("");
  }

  if (bondRows.length) {
    L.push("[ 국채 금리 ]");
    for (const row of bondRows) {
      const cells = Object.entries(row.yields)
        .map(([k, v]) => `${k} ${f(v.value, 3)}(${sign(v.change, 3)})`)
        .join("  ");
      if (cells) L.push(`  ${row.country}: ${cells}`);
    }
    L.push("");
  }

  L.push("-".repeat(50));
  L.push("SIGNO · 데이터: 야후 파이낸스 · 국채금리 네이버");
  L.push("본 리포트의 지표는 투자 참고용이며, 투자의 최종 책임은 투자자 본인에게 있습니다.");
  return { text: L.join("\n"), date: t.date, time: t.time };
}

export async function GET() {
  try {
    const data = await cached(`us-report5:${nyNow().date}:${Math.floor(Date.now() / 300_000)}`, 300, build);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
