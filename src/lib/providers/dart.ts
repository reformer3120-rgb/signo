// DART 재무 어댑터 — 코스콤에 없는 재무제표를 메운다.
//
// 코스콤은 시세·수급·업종 벤더라 재무제표가 없다. 종합평가 100점 중
// 재무건전성 28 + 성장성 15 = 43점이 여기에 걸려 있어, 이것 없이는
// 종합평가·업종순위 카드를 띄울 수 없다.
//
//   https://opendart.fss.or.kr  (무료, 개인도 발급 가능, 하루 2만 건)
//
// 주의 — DART 는 종목코드가 아니라 고유번호(corp_code, 8자리)로 조회한다.
// 대응표는 corpCode.xml 을 ZIP 으로만 주므로 풀어서 캐시해 둔다.
import { cached } from "@/lib/cache";
import { inflateRawSync } from "zlib";
import type { Financials } from "@/lib/naverApi";

const BASE = "https://opendart.fss.or.kr/api";

export const hasDart = () => Boolean(process.env.DART_API_KEY);

const key = () => {
  const k = process.env.DART_API_KEY;
  if (!k) throw new Error("DART_API_KEY 가 없다");
  return k;
};

// ── 종목코드 → 고유번호 ───────────────────────────────────────

/**
 * 단일 엔트리 ZIP 에서 파일 하나를 꺼낸다.
 * corpCode.xml 하나만 들어 있는 ZIP 이라 로컬 헤더만 읽으면 된다.
 */
function unzipSingle(buf: Buffer): string {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("ZIP 이 아니다");
  const method = buf.readUInt16LE(8);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  let size = buf.readUInt32LE(18); // 압축 크기
  // 스트리밍으로 만든 ZIP 은 크기를 0 으로 두고 뒤에 적는다 — 그때는 끝까지 준다
  if (size === 0) size = buf.length - start;
  const body = buf.subarray(start, start + size);
  if (method === 0) return body.toString("utf8"); // 무압축
  if (method === 8) return inflateRawSync(body).toString("utf8"); // deflate
  throw new Error(`ZIP 압축방식 ${method} 은 처리하지 않는다`);
}

/** 종목코드 → 고유번호. 상장사만 담는다 (stock_code 가 빈 곳은 비상장) */
async function corpCodes(): Promise<Record<string, string>> {
  return cached<Record<string, string>>("dart:corpcode", 7 * 24 * 3600, async () => {
    const r = await fetch(`${BASE}/corpCode.xml?crtfc_key=${key()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`DART corpCode ${r.status}`);
    const xml = unzipSingle(Buffer.from(await r.arrayBuffer()));
    const out: Record<string, string> = {};
    for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
      const seg = m[1];
      const corp = seg.match(/<corp_code>(.*?)<\/corp_code>/)?.[1]?.trim();
      const stock = seg.match(/<stock_code>(.*?)<\/stock_code>/)?.[1]?.trim();
      if (corp && stock && stock.length === 6) out[stock] = corp;
    }
    return out;
  });
}

// ── 재무제표 ──────────────────────────────────────────────────

interface Acnt {
  fs_div?: string; // CFS 연결 / OFS 별도
  sj_div?: string; // BS 재무상태표 / IS 손익계산서
  account_nm?: string;
  /** 당기 금액. 분기·반기 보고서에서는 그 분기 3개월치다(누적이 아니다). */
  thstrm_amount?: string;
  /** 당기 누적. 분기·반기 보고서에만 있다. */
  thstrm_add_amount?: string;
}

const won = (v?: string) => {
  const x = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(x) ? x : NaN;
};

/**
 * 한 보고서에서 필요한 계정만 뽑는다. 연결(CFS) 우선, 없으면 별도(OFS).
 *
 * 금액과 누적금액을 따로 담는다. 4분기를 만들 때 3분기 누적이 필요해서다.
 */
function pick(rows: Acnt[]): { 금액: Record<string, number>; 누적: Record<string, number> } {
  const pref = rows.some((r) => r.fs_div === "CFS") ? "CFS" : "OFS";
  const 금액: Record<string, number> = {};
  const 누적: Record<string, number> = {};
  for (const r of rows) {
    if (r.fs_div !== pref) continue;
    const name = (r.account_nm ?? "").replace(/\s/g, "");
    const v = won(r.thstrm_amount);
    if (Number.isFinite(v) && !(name in 금액)) 금액[name] = v;
    const a = won(r.thstrm_add_amount);
    if (Number.isFinite(a) && !(name in 누적)) 누적[name] = a;
  }
  return { 금액, 누적 };
}

/**
 * 흐름 항목 — 기간 동안 쌓인 값이라 더하고 뺄 수 있다.
 *
 * 잔액 항목(부채총계·자본총계)과 갈라 두어야 한다. 4분기를 만들 때
 * "연간 − 3분기누적" 을 쓰는데, 그것을 잔액에 적용하면 연말 부채에서
 * 9월 부채를 빼는 꼴이 되어 아무 뜻도 없는 수가 나온다.
 */
const 흐름 = ["매출액", "수익(매출액)", "영업이익", "영업이익(손실)", "당기순이익", "당기순이익(손실)"];

async function report(corp: string, year: number, reprt: string): Promise<Acnt[]> {
  const u =
    `${BASE}/fnlttSinglAcnt.json?crtfc_key=${key()}` +
    `&corp_code=${corp}&bsns_year=${year}&reprt_code=${reprt}`;
  const r = await fetch(u, { cache: "no-store" });
  if (!r.ok) return [];
  const j = (await r.json()) as { status?: string; list?: Acnt[] };
  // 013 = 조회 결과 없음 (아직 공시 전). 오류가 아니므로 조용히 넘긴다.
  if (j.status !== "000") return [];
  return j.list ?? [];
}

/**
 * 종목의 재무제표를 화면이 쓰는 형태로 돌려준다.
 *
 * 점수 산식(lib/score.ts)이 찾는 행 제목이 정해져 있다 —
 * "매출액" "영업이익" "ROE" "부채비율" "영업이익률".
 * DART 주요계정은 원장 금액만 주므로 비율 셋은 여기서 만든다.
 */
export async function dartFinancials(
  code: string,
  period: "annual" | "quarter" = "annual",
): Promise<Financials> {
  const map = await corpCodes();
  const corp = map[code];
  if (!corp) return { periods: [], rows: [] };

  return cached<Financials>(`dart:fin:${code}:${period}`, 24 * 3600, async () => {
    const thisYear = new Date().getUTCFullYear();

    // ── 4분기 보고서는 없다 ─────────────────────────────────
    // DART 가 주는 것은 1분기·반기·3분기·사업보고서 넷이고, 사업보고서는
    // 연간이다. 그것을 12월 분기 자리에 그대로 넣으면 삼성전자 2025년이
    // 938,374억이어야 할 자리에 3,336,059억(연간)이 뜬다 — 3.6배다.
    //
    // 그래서 4분기는 만들어 낸다.  4Q = 연간 − 3분기누적
    //
    //   2025 삼성전자   1Q 791,405  2Q 745,663  3Q 860,617   (셋의 합 2,397,685)
    //                   3Q 누적 2,397,686 · 연간 3,336,059
    //                   → 4Q 938,373   (네이버가 내놓는 938,374 와 같다)
    //
    // 뺄셈은 흐름 항목에만 쓴다. 부채총계·자본총계는 잔액이라 연말 값을
    // 그대로 쓴다 — 12월 부채에서 9월 부채를 빼면 아무 뜻도 없는 수다.
    const 분기 = [
      { rc: "11013", label: "03" },
      { rc: "11012", label: "06" },
      { rc: "11014", label: "09" },
    ];
    const jobs: { year: number; reprt: string; title: string }[] = [];
    if (period === "annual") {
      for (let y = thisYear - 4; y <= thisYear; y++) {
        jobs.push({ year: y, reprt: "11011", title: `${y}.12` });
      }
    } else {
      for (let y = thisYear - 1; y <= thisYear; y++) {
        for (const q of 분기) jobs.push({ year: y, reprt: q.rc, title: `${y}.${q.label}` });
        // 4분기를 만들려면 연간이 필요하다. 자리는 뒤에서 채운다.
        jobs.push({ year: y, reprt: "11011", title: `${y}.12` });
      }
    }

    const got = await Promise.all(
      jobs.map(async (j) => ({ ...j, ...pick(await report(corp, j.year, j.reprt)) })),
    );

    if (period === "quarter") {
      for (const g of got) {
        if (g.reprt !== "11011") continue;
        const 삼분기 = got.find((x) => x.year === g.year && x.reprt === "11014");
        // 3분기 누적이 없으면 4분기를 셀 수 없다. 연간을 분기인 척 내놓느니
        // 그 칸을 비운다.
        if (!삼분기 || !Object.keys(삼분기.누적).length) { g.금액 = {}; continue; }
        for (const k of 흐름) {
          const 연간 = g.금액[k];
          const 누적 = 삼분기.누적[k];
          g.금액[k] =
            Number.isFinite(연간) && Number.isFinite(누적) ? 연간 - 누적 : NaN;
        }
      }
    }

    const live = got.filter((g) => Object.values(g.금액).some((v) => Number.isFinite(v)));
    if (!live.length) return { periods: [], rows: [] };

    const 억 = (v: number) => (Number.isFinite(v) ? Math.round(v / 1e8) : NaN);
    const rate = (a: number, b: number) =>
      Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? +((a / b) * 100).toFixed(2) : NaN;

    const 매출 = live.map((g) => g.금액["매출액"] ?? g.금액["수익(매출액)"] ?? NaN);
    const 영익 = live.map((g) => g.금액["영업이익"] ?? g.금액["영업이익(손실)"] ?? NaN);
    const 순익 = live.map((g) => g.금액["당기순이익"] ?? g.금액["당기순이익(손실)"] ?? NaN);
    const 부채 = live.map((g) => g.금액["부채총계"] ?? NaN);
    const 자본 = live.map((g) => g.금액["자본총계"] ?? NaN);

    const txt = (xs: number[]) =>
      xs.map((v) => (Number.isFinite(v) ? v.toLocaleString("ko-KR") : null));

    return {
      periods: live.map((g) => ({ title: g.title, cns: false })), // DART 는 확정치만 (추정 없음)
      rows: [
        { title: "매출액", values: txt(매출.map(억)) },
        { title: "영업이익", values: txt(영익.map(억)) },
        { title: "당기순이익", values: txt(순익.map(억)) },
        { title: "부채총계", values: txt(부채.map(억)) },
        { title: "자본총계", values: txt(자본.map(억)) },
        // 아래 셋은 점수 산식이 이름으로 찾는다. 이름을 바꾸면 점수가 비어 버린다.
        { title: "영업이익률", values: txt(영익.map((v, i) => rate(v, 매출[i]))) },
        { title: "부채비율", values: txt(부채.map((v, i) => rate(v, 자본[i]))) },
        { title: "ROE", values: txt(순익.map((v, i) => rate(v, 자본[i]))) },
      ],
    };
  });
}
