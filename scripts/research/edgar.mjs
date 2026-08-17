// SEC EDGAR 공시 재무 — 시점 그대로(point-in-time).
//
// 왜 야후가 아니라 EDGAR 인가
//   야후가 주는 재무 지표(ROE·부채비율·PER…)는 전부 '오늘' 값이다. 그걸로 과거
//   주가를 맞히면 아직 공시되지 않은 실적을 미리 아는 셈이라 검증이 통째로
//   거짓이 된다. EDGAR 은 각 수치에 **공시일(filed)** 이 붙어 있어, 그날까지
//   실제로 공개돼 있던 것만 골라 쓸 수 있다.
//   (결산일에서 공시일까지 보통 34일 걸린다 — 그 사이엔 아무도 모르는 값이다)
//
// 이용 규칙
//   SEC 는 User-Agent 에 연락처를 요구하고 초당 10건으로 제한한다.
//   EDGAR_UA 환경변수에 "이름 메일주소" 를 넣어 두는 것을 권한다.
import fs from "node:fs";
import path from "node:path";

const UA = process.env.EDGAR_UA ?? "SIGNO research (set EDGAR_UA env)";
const HEADERS = { "User-Agent": UA, Accept: "application/json" };
const CACHE = path.join(process.cwd(), ".cache", "edgar");

fs.mkdirSync(CACHE, { recursive: true });

// SEC 는 초당 10건까지만 받는다. 넘기면 차단당한다.
let lastCall = 0;
async function polite(url) {
  const wait = Math.max(0, 110 - (Date.now() - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`EDGAR ${r.status} ${url}`);
  return r.json();
}

/** 디스크 캐시 — 공시 자료는 자주 바뀌지 않으므로 오래 둬도 된다 */
async function cached(name, ttlDays, fn) {
  const f = path.join(CACHE, `${name}.json`);
  try {
    const st = fs.statSync(f);
    if (Date.now() - st.mtimeMs < ttlDays * 86400_000) {
      return JSON.parse(fs.readFileSync(f, "utf8"));
    }
  } catch {
    /* 캐시 없음 */
  }
  const v = await fn();
  fs.writeFileSync(f, JSON.stringify(v));
  return v;
}

/** 티커 → CIK(10자리). 상장사 1만여 개 */
export async function tickerMap() {
  const j = await cached("tickers", 7, () =>
    polite("https://www.sec.gov/files/company_tickers.json"),
  );
  const m = {};
  for (const v of Object.values(j)) {
    m[String(v.ticker).toUpperCase()] = String(v.cik_str).padStart(10, "0");
  }
  return m;
}

/** 회사 전체 공시 수치 */
export async function companyFacts(cik) {
  return cached(`facts-${cik}`, 7, () =>
    polite(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`),
  );
}

// ── 개념 이름 ────────────────────────────────────────────────
// 같은 항목을 회사·연도마다 다른 태그로 올린다. 앞에서부터 찾아 처음 걸리는 것을 쓴다.
const CONCEPTS = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
  ],
  opInc: ["OperatingIncomeLoss"],
  netInc: ["NetIncomeLoss", "ProfitLoss"],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ],
  liabilities: ["Liabilities"],
  shares: [
    "CommonStockSharesOutstanding",
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "CommonStockSharesIssued",
  ],
  eps: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
};

const days = (a, b) => (new Date(b) - new Date(a)) / 86400_000;

/** 한 개념의 관측치를 모은다. flow=true 면 기간 항목(연간분만), false 면 시점 항목 */
function pick(facts, names, flow) {
  for (const n of names) {
    const node = facts.facts?.["us-gaap"]?.[n];
    if (!node) continue;
    const unit = node.units?.USD ?? node.units?.shares ?? node.units?.["USD/shares"];
    if (!unit) continue;
    const rows = unit
      .filter((x) => x.form === "10-K" || x.form === "10-K/A")
      .filter((x) => {
        if (!flow) return true;
        // 기간 항목은 1년치만 쓴다. 분기와 섞이면 매출이 4분의 1로 잡힌다.
        return x.start && days(x.start, x.end) > 330 && days(x.start, x.end) < 400;
      })
      .map((x) => ({ end: x.end, filed: x.filed, v: x.val }))
      .sort((a, b) => (a.end < b.end ? -1 : 1));
    if (rows.length) return rows;
  }
  return [];
}

/**
 * 연간 재무 시계열. 각 줄에 결산일(end)과 공시일(filed)이 함께 붙는다.
 *
 * 연간만 쓰는 이유 — 분기는 4분기 값을 따로 안 올리는 회사가 많아
 * (연간에서 1~3분기를 빼야 나온다) 계산이 어긋나기 쉽다. 재무 지표는
 * 원래 천천히 움직이므로 연 1회 갱신으로도 요인 검증에는 충분하다.
 */
export function annualSeries(facts) {
  const g = {
    revenue: pick(facts, CONCEPTS.revenue, true),
    opInc: pick(facts, CONCEPTS.opInc, true),
    netInc: pick(facts, CONCEPTS.netInc, true),
    eps: pick(facts, CONCEPTS.eps, true),
    equity: pick(facts, CONCEPTS.equity, false),
    liabilities: pick(facts, CONCEPTS.liabilities, false),
    shares: pick(facts, CONCEPTS.shares, false),
  };
  // 결산일을 기준으로 묶는다
  const ends = [...new Set(g.revenue.map((x) => x.end))].sort();
  const near = (rows, end) => {
    // 같은 결산일, 없으면 그 이전 가장 가까운 것 (재무상태표는 분기 공시에도 실린다)
    let best = null;
    for (const r of rows) {
      if (r.end <= end && (!best || r.end > best.end)) best = r;
    }
    return best;
  };
  const out = [];
  for (const end of ends) {
    const rev = g.revenue.find((x) => x.end === end);
    if (!rev) continue;
    const row = {
      end,
      filed: rev.filed,
      revenue: rev.v,
      opInc: g.opInc.find((x) => x.end === end)?.v ?? NaN,
      netInc: g.netInc.find((x) => x.end === end)?.v ?? NaN,
      eps: g.eps.find((x) => x.end === end)?.v ?? NaN,
      equity: near(g.equity, end)?.v ?? NaN,
      liabilities: near(g.liabilities, end)?.v ?? NaN,
      shares: near(g.shares, end)?.v ?? NaN,
    };
    // 공시일은 이 줄을 이루는 값들 중 가장 늦은 것으로 잡는다 (그때야 다 알려진다)
    for (const k of ["opInc", "netInc", "eps"]) {
      const f = g[k]?.find?.((x) => x.end === end)?.filed;
      if (f && f > row.filed) row.filed = f;
    }
    out.push(row);
  }
  return out;
}

/**
 * 그 날짜에 실제로 공개돼 있던 최신 재무 한 줄.
 * filed 로 거르는 것이 핵심 — end 로 거르면 아직 공시 전인 실적을 쓰게 된다.
 */
export function asOf(series, dateISO) {
  let best = null;
  for (const r of series) {
    if (r.filed <= dateISO && (!best || r.filed > best.filed)) best = r;
  }
  return best;
}

/** 직전 회계연도 — 성장률 계산용 */
export function priorOf(series, row) {
  if (!row) return null;
  let best = null;
  for (const r of series) {
    if (r.end < row.end && (!best || r.end > best.end)) best = r;
  }
  return best;
}
