// 코스피·코스닥 PER·PBR 을 우리가 센다.
//
// ── 왜 직접 세나 ──────────────────────────────────────────
// 지수 PER/PBR 을 그냥 주는 무료 출처가 없다.
//   네이버 지수 API·웹  전일·시가·52주만
//   KRX 정보데이터      공식 수치가 있지만 로그인이 필요하다
// 시가총액과 재무는 이미 갖고 있으니 셀 수 있다.
//
// ── 우리 수치는 KRX 공식치와 다르다 ────────────────────────
// 셋이 구조적으로 다르다. 감추지 말고 화면에 밝힌다.
//   편입 범위   우리 분류표의 2,234종목. KRX 는 전 상장사
//   우선주      우리 표에는 사실상 없다(4종목). KRX 는 포함 → 시총이 덜 잡힌다
//   기준 시점   시총은 지금, 재무는 직전 사업연도 (= 후행 PER)
// 그래서 "코스피 PER 21.4배" 라고 단정하지 않고 SIGNO 산출임을 적는다.
//
// 그래서 절대 수치를 단정하지 않는다. 추세(지난달 대비)나 두 시장 비교로
// 읽는 편이 안전하다.
import RAW from "@/data/valuation.json";
import { cached } from "@/lib/cache";
import { getJson } from "@/lib/naverApi";
import { nominalGDP } from "@/lib/ecos";

interface 재무 { 순: number; 자: number; 시: "Y" | "K"; 해: number }
const DATA = RAW as unknown as Record<string, 재무>;

export type 시장 = "코스피" | "코스닥";
const 이름: Record<string, 시장> = { Y: "코스피", K: "코스닥" };

/** 버핏지수 — 시장 전체 시가총액을 명목 GDP 로 나눈 것 */
export interface 버핏 {
  /** % */
  값: number;
  /** 시가총액 합 (조원) */
  시총: number;
  /** 명목 GDP (조원) */
  gdp: number;
  /** GDP 기준 연도 — 분자는 지금이고 분모는 이 해다 */
  gdp해: number;
}

export interface 시장가치 {
  시장: 시장;
  /** 흑자기업만으로 센 PER — DART 사업보고서(직전 연간) 기준 */
  per: number | null;
  /** 선행 PER — 애널리스트 컨센서스(추정PER)에서 역산 */
  선행per: number | null;
  /** 후행 PER — 최근 4분기(TTM). 선행과 같은 표본이라 견주기 좋다 */
  후행per: number | null;
  /** 선행·후행을 센 표본이 그 시장 시총의 몇 %인가 */
  컨센커버: number | null;
  /** 적자까지 넣어 센 PER — 참고용 */
  perAll: number | null;
  pbr: number | null;
  /** 센 데 들어간 종목 수 */
  종목: number;
  적자: number;
  /** 시가총액 합 (조원) */
  시총: number;
  해: number | null;
}

/**
 * PER 은 흑자기업만으로 센다.
 *
 * 적자를 합계에 넣으면 분모가 깎여 수치가 뒤집힌다. 코스닥은 1,494종목 중
 * 840이 적자라, 전체로 세면 72배가 나오고 흑자만 세면 16배가 나온다.
 * 72배는 "코스닥이 비싸다" 가 아니라 "적자 회사가 많다" 는 뜻이라 PER 이라는
 * 이름으로 부르면 안 된다. KRX 공식 수치도 흑자기업 기준이다.
 *
 * PBR 은 전체로 센다. 자본은 적자여도 남아 있고, 자본잠식(자본 ≤ 0)은
 * 굳힐 때 이미 빼 두었다.
 */
function 세기(codes: string[], cap: Map<string, number>, 시장코드: "Y" | "K"): 시장가치 {
  let 시총 = 0, 자본 = 0, 순이익 = 0, 흑시총 = 0, 흑순이익 = 0;
  let 종목 = 0, 적자 = 0, 해: number | null = null;
  for (const code of codes) {
    const f = DATA[code];
    const c = cap.get(code);
    // 시총을 모르면 그 종목은 분자에서도 빼야 한다. 재무만 넣으면 값이 왜곡된다.
    if (!f || f.시 !== 시장코드 || !c || !(c > 0)) continue;
    종목++;
    해 ??= f.해;
    시총 += c;
    자본 += f.자;
    순이익 += f.순;
    if (f.순 > 0) { 흑시총 += c; 흑순이익 += f.순; } else 적자++;
  }
  const 나누기 = (a: number, b: number) => (b > 0 && a > 0 ? +(a / b).toFixed(2) : null);
  return {
    시장: 이름[시장코드],
    per: 나누기(흑시총, 흑순이익),
    선행per: null, 후행per: null, 컨센커버: null,
    perAll: 나누기(시총, 순이익),
    pbr: 나누기(시총, 자본),
    종목, 적자,
    시총: +(시총 / 1e12).toFixed(0),
    해,
  };
}

/**
 * 시가총액을 시장별로 전 종목 모은다.
 *
 * ── 왜 순위 목록을 통째로 받나 ─────────────────────────────
 * 처음에는 지표 크론이 Redis 에 넣어 둔 것을 되읽었다. 그런데 그것은
 * 크론이 훑은 만큼만 있고(코스피 740 중 664), 무엇보다 **우선주가 없다.**
 * 우리 분류표는 보통주만 다루기 때문이다.
 *
 * 네이버 시총 순위는 우선주까지 다 준다. 페이지당 100종목이라 두 시장
 * 합쳐 44번이면 전부 받는다. 한 시간 캐시라 부담이 없다.
 *
 * ── ETF·ETN 을 반드시 빼야 한다 ───────────────────────────
 * 코스피 목록 2,483건 중 주식은 944뿐이고 나머지는 ETF 1,169 · ETN 370 이다.
 * ETF 시총을 더하면 그 안에 담긴 주식을 두 번 세는 것이 된다.
 * stockEndType 이 "stock" 인 것만 쓴다.
 *
 * ── 우선주는 보통주에 합친다 ──────────────────────────────
 * 우선주도 그 회사에 대한 지분이므로 시가총액에 넣어야 한다. KRX 통계도,
 * 원조 버핏지수(Wilshire 5000)도 넣는다. 빼면 그 회사의 시장가치를 덜
 * 잡는 것이다 — 삼성전자우 하나가 160조다.
 *
 * 다만 분모(순이익·자본)는 회사 하나당 한 번만 세야 하므로, 우선주 시총을
 * 보통주 종목코드에 더해 둔다. 우선주 코드는 보통주 코드의 끝자리를
 * 5·7·9·K 로 바꾼 것이다 — 005935→005930 · 005387→005380 · 00104K→001040.
 */
async function 시총모으기(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const market of ["KOSPI", "KOSDAQ"] as const) {
    for (let p = 1; p <= 30; p++) {
      const d = await getJson(
        `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${p}&pageSize=100`,
      ).catch(() => ({ stocks: [] }));
      const rows = (d.stocks ?? []) as { itemCode?: string; stockEndType?: string; marketValue?: string }[];
      if (!rows.length) break;
      for (const r of rows) {
        // ETF·ETN 은 담긴 주식을 다시 세는 것이라 넣지 않는다
        if (r.stockEndType !== "stock" || !r.itemCode) continue;
        const 억 = Number(String(r.marketValue ?? "").replace(/[^\d]/g, ""));
        if (!Number.isFinite(억) || 억 <= 0) continue;
        // 우선주면 보통주 코드로 옮겨 담는다
        const 코드 = /0$/.test(r.itemCode) ? r.itemCode : r.itemCode.slice(0, 5) + "0";
        map.set(코드, (map.get(코드) ?? 0) + 억 * 1e8);
      }
    }
  }
  return map;
}

/**
 * 선행 PER 을 셀 재료 — 종목별 추정PER·PER 을 시총 상위부터 모은다.
 *
 * ── 종목 수가 아니라 시총으로 봐야 한다 ────────────────────
 * 애널리스트 컨센서스는 종목 수로는 일부에만 있다. 그래서 처음에는
 * "시장 전체를 못 덮으니 선행 PER 은 어렵다" 고 판단했는데 틀렸다.
 * 시장 PER 은 시총 가중이므로 시총 커버리지가 맞는 잣대다.
 *
 *   코스피 상위 154종목  종목 수 88%  ·  시총 98.3%
 *   코스닥 상위 200종목  종목 수 31%  ·  시총 44.6%
 *
 * 코스피는 사실상 다 덮는다. 코스닥은 절반이라 그 사실을 같이 내보낸다.
 *
 * ── 왜 상위만 보나 ────────────────────────────────────────
 * 순위 목록에는 PER 이 없어 종목마다 따로 물어야 한다. 시총 상위 150이면
 * 코스피의 96%가 들어오므로 전 종목을 두드릴 이유가 없다.
 *
 * ── 추정PER 에서 이익을 역산한다 ───────────────────────────
 *   종목별 추정순이익 = 시가총액 ÷ 추정PER
 *   시장 선행 PER    = Σ시가총액 ÷ Σ추정순이익   (컨센서스가 있는 것만)
 */
async function 컨센서스(codes: string[]) {
  let 덮은시총 = 0, 선행이익 = 0, 후행시총 = 0, 후행이익 = 0, 전체시총 = 0;
  const 억 = (s?: string) => {
    if (!s || s === "-") return 0;
    let n = 0;
    const 조 = s.match(/([\d,]+)조/), 어 = s.match(/([\d,]+)억/);
    if (조) n += Number(조[1].replace(/,/g, "")) * 10000;
    if (어) n += Number(어[1].replace(/,/g, ""));
    return n;
  };
  const 수 = (s?: string) => {
    const v = parseFloat(String(s ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(v) && v > 0 ? v : null;
  };

  // 여섯씩 겹쳐 부른다. 하나씩 부르면 150종목에 45초가 걸린다.
  const CONC = 6;
  for (let i = 0; i < codes.length; i += CONC) {
    await Promise.all(codes.slice(i, i + CONC).map(async (c) => {
      const d = await getJson(`https://m.stock.naver.com/api/stock/${c}/integration`).catch(() => null);
      if (!d) return;
      const ti: Record<string, string> = {};
      for (const x of (d.totalInfos ?? []) as { code: string; value: string }[]) ti[x.code] = x.value;
      const cap = 억(ti.marketValue) * 1e8;
      if (!(cap > 0)) return;
      전체시총 += cap;
      const f = 수(ti.cnsPer);
      if (f) { 덮은시총 += cap; 선행이익 += cap / f; }
      const t = 수(ti.per);
      if (t) { 후행시총 += cap; 후행이익 += cap / t; }
    }));
  }
  const 나누기 = (a: number, b: number) => (b > 0 && a > 0 ? +(a / b).toFixed(2) : null);
  return {
    선행per: 나누기(덮은시총, 선행이익),
    후행per: 나누기(후행시총, 후행이익),
    컨센커버: 전체시총 > 0 ? +((100 * 덮은시총) / 전체시총).toFixed(1) : null,
  };
}

/** 시총 상위 코드만 뽑는다 — 컨센서스를 물을 대상 */
async function 상위코드(market: "KOSPI" | "KOSDAQ", n: number): Promise<string[]> {
  const out: string[] = [];
  for (let p = 1; out.length < n && p <= 3; p++) {
    const d = await getJson(
      `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${p}&pageSize=100`,
    ).catch(() => ({ stocks: [] }));
    const rows = (d.stocks ?? []) as { itemCode?: string; stockEndType?: string }[];
    if (!rows.length) break;
    for (const r of rows) {
      // 보통주만 — 우선주는 그 회사의 PER 을 다시 세는 것이 된다
      if (r.stockEndType === "stock" && r.itemCode && /0$/.test(r.itemCode)) out.push(r.itemCode);
    }
  }
  return out.slice(0, n);
}

/**
 * 코스피·코스닥 PER·PBR.
 *
 * 시총은 지표 크론이 채우는 것이라 크론이 아직 안 훑은 종목은 빠진다.
 * 몇 종목으로 셌는지 같이 돌려주므로 화면이 그것을 밝힐 수 있다.
 */
export const marketValue = () =>
  cached<{ 시장들: 시장가치[]; 버핏: 버핏 | null }>("mktval:v4", 6 * 3600, async () => {
    const codes = Object.keys(DATA);
    const cap = await 시총모으기();
    const [kospi, kosdaq] = await Promise.all([
      상위코드("KOSPI", 150).then(컨센서스),
      상위코드("KOSDAQ", 150).then(컨센서스),
    ]);
    const 컨센 = { Y: kospi, K: kosdaq };
    const 시장들 = (["Y", "K"] as const).map((m) => ({ ...세기(codes, cap, m), ...컨센[m] }));

    // 버핏지수 — GDP 를 못 받으면(키 없음) 이것만 빠지고 나머지는 그대로 나온다
    const gdp = await nominalGDP().catch(() => null);
    const 시총합 = 시장들.reduce((a, m) => a + m.시총, 0);
    const 버핏 =
      gdp && gdp.값 > 0 && 시총합 > 0
        ? { 값: +((100 * 시총합) / gdp.값).toFixed(1), 시총: 시총합, gdp: gdp.값, gdp해: gdp.해 }
        : null;
    return { 시장들, 버핏 };
  });
