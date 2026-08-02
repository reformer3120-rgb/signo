import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import {
  indices,
  indexTrend,
  sectors,
  stockList,
  bonds,
  highLow,
  type Market,
} from "@/lib/naverApi";
import { breadth } from "@/lib/naver";
import { marketIndicators } from "@/lib/marketIndex";
import { hasKIS, foreignInstitution, programTrade } from "@/lib/kis";

export const revalidate = 0;
export const maxDuration = 60;

// 특징주와 동일 기준: ETF·ETN·레버리지 등 파생상품 제외 → 개별종목만
const ETF_BRAND =
  /^(KODEX|TIGER|KBSTAR|KOSEF|ARIRANG|HANARO|RISE|SOL|ACE|PLUS|KINDEX|TIMEFOLIO|TREX|FOCUS|KIWOOM|WOORI|1Q|HK|BNK|WON|히어로즈|마이티|파워)\s/i;
const KW = /레버리지|인버스|2X|3X|곱버스|ETN|ETF|선물|국고채|커버드콜|합성|리츠|액티브|금리/i;
const onlyStocks = <T extends { name: string }>(rows: T[]) =>
  rows.filter((s) => !KW.test(s.name) && !ETF_BRAND.test(s.name));

const f = (n: number, d = 0) =>
  n.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (n: number, d = 2) => `${n > 0 ? "+" : ""}${f(n, d)}`;
// 억원 단위 순매수 (네이버 지수 수급은 억원)
const eok = (n: number) => `${n > 0 ? "+" : ""}${f(n)}억`;

function seoulParts() {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const KR: Record<string, string> = { Sun: "일", Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토" };
  return {
    date: `${g("year")}-${g("month")}-${g("day")}`,
    weekday: KR[g("weekday")] ?? g("weekday"),
    time: `${g("hour")}:${g("minute")}`,
    minutes: Number(g("hour")) * 60 + Number(g("minute")),
  };
}

async function build() {
  const t = seoulParts();
  const kis = hasKIS();
  const [idx, sec, bond, mi, fi, prgKospi, prgKosdaq, ...rest] = await Promise.all([
    indices().catch(() => []),
    sectors().catch(() => []),
    bonds().catch(() => []),
    marketIndicators().catch(() => null),
    kis ? foreignInstitution("ALL", 0).catch(() => []) : Promise.resolve([]),
    kis ? programTrade("KOSPI").catch(() => []) : Promise.resolve([]),
    kis ? programTrade("KOSDAQ").catch(() => []) : Promise.resolve([]),
    ...(["KOSPI", "KOSDAQ"] as Market[]).flatMap((m) => [
      indexTrend(m).catch(() => null),
      breadth(m).catch(() => null),
      stockList("marketValue", m, 10).catch(() => []),
      stockList("up", m, 100).catch(() => []),
      stockList("down", m, 100).catch(() => []),
      highLow(m, "high", 200).catch(() => []),
      highLow(m, "low", 200).catch(() => []),
    ]),
  ]);
  const per = 7;
  const byMarket = (["KOSPI", "KOSDAQ"] as Market[]).map((m, i) => ({
    market: m,
    flow: rest[i * per] as Awaited<ReturnType<typeof indexTrend>> | null,
    br: rest[i * per + 1] as Awaited<ReturnType<typeof breadth>> | null,
    cap: rest[i * per + 2] as Awaited<ReturnType<typeof stockList>>,
    up: rest[i * per + 3] as Awaited<ReturnType<typeof stockList>>,
    down: rest[i * per + 4] as Awaited<ReturnType<typeof stockList>>,
    high: rest[i * per + 5] as Awaited<ReturnType<typeof highLow>>,
    low: rest[i * per + 6] as Awaited<ReturnType<typeof highLow>>,
  }));

  const L: string[] = [];
  L.push(`SIGNO 장 마감 리포트`);
  L.push(`${t.date} (${t.weekday}) ${t.time} KST 기준`);
  L.push("=".repeat(46), "");

  L.push("[ 지수 ]");
  for (const q of idx) L.push(`  ${q.name.padEnd(4)} ${f(q.price, 2)}  ${sign(q.changePct)}%`);
  // 프로그램매매 (KIS, 백만원 → 억원)
  const prg = (rows: Awaited<ReturnType<typeof programTrade>>) => {
    const last = rows[rows.length - 1];
    return last ? `${eok(Math.round((last.whole * 1e6) / 1e8))}` : null;
  };
  const pk = prg(prgKospi);
  const pq = prg(prgKosdaq);
  if (pk || pq) {
    L.push(`  프로그램 순매수: 코스피 ${pk ?? "-"} / 코스닥 ${pq ?? "-"}`);
  }
  L.push("");

  for (const b of byMarket) {
    const label = b.market === "KOSPI" ? "코스피" : "코스닥";
    L.push(`[ ${label} ]`);
    if (b.br) {
      L.push(
        `  등락: 상승 ${f(b.br.up)}(상한 ${b.br.upper}) / 보합 ${f(b.br.flat)} / 하락 ${f(b.br.down)}(하한 ${b.br.lower})`,
      );
    }
    if (b.flow) {
      L.push(
        `  수급: 개인 ${eok(b.flow.personal)} / 외국인 ${eok(b.flow.foreign)} / 기관 ${eok(b.flow.institutional)}`,
      );
    }
    const up5 = onlyStocks(b.up).slice(0, 5);
    const down5 = onlyStocks(b.down).slice(0, 5);
    if (up5.length) {
      L.push(`  상승 TOP5: ${up5.map((s) => `${s.name} ${sign(s.changePct)}%`).join(", ")}`);
    }
    if (down5.length) {
      L.push(`  하락 TOP5: ${down5.map((s) => `${s.name} ${sign(s.changePct)}%`).join(", ")}`);
    }
    L.push(
      `  신고가(${b.high.length}): ${b.high.slice(0, 8).map((s) => s.name).join(", ") || "없음"}`,
    );
    L.push(
      `  신저가(${b.low.length}): ${b.low.slice(0, 8).map((s) => s.name).join(", ") || "없음"}`,
    );
    if (b.cap.length) {
      L.push("  시총 상위 10:");
      b.cap.forEach((s, i) =>
        L.push(`    ${String(i + 1).padStart(2)}. ${s.name}  ${f(s.price)}  ${sign(s.changePct)}%  ${s.marketCap}`),
      );
    }
    L.push("");
  }

  if (fi.length) {
    L.push("[ 시장 수급 · 외국인·기관 순매수 상위 ]");
    L.push("  (순매수 대금 기준, 억원 · KRX+NXT 합산)");
    const eokFromMillion = (v: number) => `${v > 0 ? "+" : ""}${f(Math.round(v / 100))}`;
    fi.slice(0, 10).forEach((r, i) =>
      L.push(
        `    ${String(i + 1).padStart(2)}. ${r.name.padEnd(12)} ${f(r.price).padStart(9)} ${sign(r.changePct).padStart(7)}%  외인 ${eokFromMillion(r.foreignValue).padStart(9)}  기관 ${eokFromMillion(r.instValue).padStart(9)}`,
      ),
    );
    L.push("");
  }

  if (sec.length) {
    const sorted = [...sec].sort((a, b) => b.changeRate - a.changeRate);
    L.push("[ 섹터 강약 ]");
    L.push(`  강세: ${sorted.slice(0, 5).map((s) => `${s.name} ${sign(s.changeRate)}%`).join(", ")}`);
    L.push(`  약세: ${sorted.slice(-5).reverse().map((s) => `${s.name} ${sign(s.changeRate)}%`).join(", ")}`);
    L.push("");
  }

  if (mi) {
    const grp = (title: string, items: typeof mi.fx, digits = 2) => {
      if (!items.length) return;
      L.push(`  ${title}`);
      for (const it of items)
        L.push(`    ${it.label.padEnd(18)} ${f(it.price, digits).padStart(14)}  ${sign(it.changePct)}%`);
    };
    L.push("[ 시장지표 ]");
    grp("환율", mi.fx);
    grp("원자재", mi.commodities);
    grp("가상자산 (원화)", mi.crypto, 0);
    grp("선물", mi.futures);
    L.push("");
  }

  if (bond.length) {
    L.push("[ 국채 금리 ]");
    for (const row of bond) {
      const cells = Object.entries(row.yields)
        .map(([k, v]) => `${k} ${f(v.value, 3)}(${sign(v.change, 3)})`)
        .join("  ");
      if (cells) L.push(`  ${row.country}: ${cells}`);
    }
    L.push("");
  }

  L.push("-".repeat(46));
  L.push("SIGNO · 데이터: 네이버 · KIS");
  return {
    text: L.join("\n"),
    date: t.date,
    time: t.time,
    closed: t.minutes >= 15 * 60 + 40, // 15:40 이후 = 마감 데이터 확정
  };
}

export async function GET() {
  try {
    const t = seoulParts();
    // 마감 후에는 당일 확정본이므로 오래 캐시, 장중에는 짧게
    const closed = t.minutes >= 15 * 60 + 40;
    const data = await cached(
      `close-report:${t.date}:${closed ? "final" : Math.floor(t.minutes / 5)}`,
      closed ? 21_600 : 300,
      build,
    );
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
