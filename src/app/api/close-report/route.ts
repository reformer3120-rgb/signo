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
import { usMarketIndicators, type UsIndicator } from "@/lib/us";
import { indexChart } from "@/lib/yahoo";
import { minute } from "@/lib/naver";
import { hasKIS, foreignInstitution, programTrade } from "@/lib/kis";
import { marketDeposit } from "@/lib/deposit";
import { futuresInvestorFlow } from "@/lib/flow";

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
      stockList("marketValue", m, 20).catch(() => []),
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

  // 30분 간격 장중 흐름 (지수 · 주요 종목)
  const halfHour = async (label: string, bars: { time: number; close: number }[]) => {
    if (!bars.length) return null;
    const today = new Date(bars[bars.length - 1].time * 1000).toISOString().slice(0, 10);
    const pts = bars
      .filter((b) => new Date(b.time * 1000).toISOString().slice(0, 10) === today)
      .map((b) => `${new Date(b.time * 1000).toISOString().slice(11, 16)} ${f(b.close, 2)}`);
    return pts.length ? `  ${label}: ${pts.join(" → ")}` : null;
  };
  const [kospiBars, kosdaqBars, samsungBars, hynixBars] = await Promise.all([
    indexChart("^KS11", "30m").catch(() => []),
    indexChart("^KQ11", "30m").catch(() => []),
    minute("005930", 30).catch(() => []),
    minute("000660", 30).catch(() => []),
  ]);
  // 대시보드의 증시 주변자금 카드와 같은 데이터
  const deposits = await marketDeposit().catch(() => []);
  // 미국 시장지표 화면에만 있는 묶음(유럽 증시·달러인덱스·달러 기준 원자재/환율)도 담는다
  const ui = await usMarketIndicators().catch(() => null);
  // 대시보드 지수·수급 카드와 같은 값 (공용 함수 — 따로 받으면 값이 어긋난다)
  const futFlow = await futuresInvestorFlow().catch(() => null);

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
  if (futFlow) {
    L.push(
      `  선물 수급(계약): 개인 ${sign(futFlow.personal, 0)} / 외국인 ${sign(futFlow.foreign, 0)} / 기관 ${sign(futFlow.institutional, 0)}`,
    );
  }
  L.push("");

  if (deposits.length) {
    const [cur, prev] = deposits;
    L.push("[ 증시 주변자금 ]");
    L.push(`  기준일 ${cur.date}${prev ? ` (전일 ${prev.date} 대비)` : ""} · 단위 억원`);
    for (const it of cur.items)
      L.push(`  ${it.label.padEnd(10)} ${f(it.value).padStart(12)}  ${sign(it.change, 0)}`);
    L.push("");
  }

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
      L.push("  시총 상위 20:");
      b.cap.forEach((s, i) =>
        L.push(`    ${String(i + 1).padStart(2)}. ${s.name}  ${f(s.price)}  ${sign(s.changePct)}%  ${s.marketCap}`),
      );
    }
    L.push("");
  }

  // 장중 흐름 (30분 간격)
  const flowLines = (
    await Promise.all([
      halfHour("코스피", kospiBars),
      halfHour("코스닥", kosdaqBars),
      halfHour("삼성전자", samsungBars),
      halfHour("SK하이닉스", hynixBars),
    ])
  ).filter((x): x is string => !!x);
  if (flowLines.length) {
    L.push("[ 장중 흐름 (30분 간격) ]");
    L.push(...flowLines);
    L.push("");
  }

  // 장내 특이점 — 상·하한가, 급등락 종목 수로 판단
  const notes: string[] = [];
  for (const b of byMarket) {
    const label = b.market === "KOSPI" ? "코스피" : "코스닥";
    if (b.br?.upper) notes.push(`${label} 상한가 ${b.br.upper}종목`);
    if (b.br?.lower) notes.push(`${label} 하한가 ${b.br.lower}종목`);
    const surge = onlyStocks(b.up).filter((s) => s.changePct >= 20).length;
    const plunge = onlyStocks(b.down).filter((s) => s.changePct <= -15).length;
    if (surge) notes.push(`${label} 20%↑ 급등 ${surge}종목`);
    if (plunge) notes.push(`${label} 15%↓ 급락 ${plunge}종목`);
    if (b.br && b.br.up + b.br.down > 0) {
      const ratio = (b.br.up / (b.br.up + b.br.down)) * 100;
      if (ratio >= 75) notes.push(`${label} 상승 종목 편중(${ratio.toFixed(0)}%)`);
      if (ratio <= 25) notes.push(`${label} 하락 종목 편중(${(100 - ratio).toFixed(0)}%)`);
    }
  }
  const q = idx.find((x) => x.name === "코스피");
  if (q && Math.abs(q.changePct) >= 2) notes.push(`코스피 ${sign(q.changePct)}% 급변동`);
  L.push("[ 장내 특이점 ]");
  if (notes.length) L.push(...notes.map((x) => `  · ${x}`));
  else L.push("  특이사항 없음");
  L.push("");

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
    // 미국 시장지표 화면에만 있는 항목을 합친다 (같은 항목이 두 번 나오지 않게)
    const pick = (items: UsIndicator[] | undefined, labels: string[]) =>
      (items ?? []).filter((x) => labels.includes(x.label));
    // 리포트는 값만 쓰므로 스파크라인은 빈 배열로 맞춰 준다
    const plain = (items: UsIndicator[]) =>
      items.map((x) => ({ label: x.label, price: x.price, changePct: x.changePct, spark: [] }));

    L.push("[ 시장지표 ]");
    grp("아시아 증시", mi.asia);
    if (ui?.europe?.length) grp("유럽 증시", plain(ui.europe));
    if (ui?.dollar?.length) grp("달러인덱스 · 변동성", plain(ui.dollar));
    // 지수선물에 러셀2000(미국 화면에만 있음)을 더한다
    grp("지수선물", [...mi.futures, ...plain(pick(ui?.futures, ["러셀2000 선물"]))]);
    grp("환율", mi.fx);
    // 달러 기준 환율은 원화 기준에 없는 교차환율이라 따로 담는다
    if (ui?.fx?.length) grp("환율 (달러 기준)", plain(ui.fx), 4);
    // 원자재에 구리(미국 화면에만 있음)를 더한다
    grp("원자재", [...mi.commodities, ...plain(pick(ui?.commodities, ["구리"]))]);
    grp("가상자산 (원화)", mi.crypto, 0);
    if (ui?.crypto?.length) grp("가상자산 (달러)", plain(ui.crypto), 4);
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
  L.push("본 리포트의 지표는 투자 참고용이며, 투자의 최종 책임은 투자자 본인에게 있습니다.");
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
    // 마감 직후에는 투자자별 수급이 아직 가집계라 값이 바뀐다.
    // 그때 굳혀 버리면 화면은 확정치로 바뀌는데 리포트만 옛 값에 머문다.
    // 수급이 자리를 잡는 18시 이후부터 확정본으로 오래 캐시한다.
    const closed = t.minutes >= 18 * 60;
    const data = await cached(
      `close-report8:${t.date}:${closed ? "final" : Math.floor(t.minutes / 5)}`,
      closed ? 21_600 : 300,
      build,
    );
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
