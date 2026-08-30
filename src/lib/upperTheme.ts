// 윗층 테마 — "지금 왜 같이 움직이는가".
//
// ── 아래층과 무엇이 다른가 ─────────────────────────────────
//   아래층(ownTheme)  무엇으로 버는가   사업보고서 · 분기 갱신 · 한 종목 한 칸
//   윗층(여기)        왜 같이 움직이나  시세 · 주 1회 갱신 · 중복 허용
//
// 층을 가르는 것은 겹침 허용 여부가 아니라 출처와 갱신 주기다.
//
// 자율주행 같은 것은 아래층에 자리가 없다. 매출 항목이 아니라서다 — 현대모비스는
// 자동차부품, 텔레칩스는 팹리스에 이미 들어가 있고, 배타 분류에서는 그것들을
// 다시 모을 수 없다. 윗층은 시세로 판정하므로 모을 수 있다.
//
// ── 판정 기준 ──────────────────────────────────────────────
// 문서로 판정하지 않는다. 둘뿐이다.
//   실재하는가  잔차 상관 — 시장 공통분을 회귀로 걷어낸 뒤에도 같이 움직이는가
//   돈이 왔는가 상대 거래대금 — 최근 10일/직전 50일 배수 ÷ 시장 배수
//
// 근거를 못 대는 것이 허깨비인 것은 아니다. 재 보니 "지역화폐"(0.237)와
// "스페이스X"(0.167)는 실재했고 "CCUS"(-0.029)와 "신규상장"(-0.010)은 아니었다.
// 돈이 들어왔는지가 테마의 실재를 정한다.
//
// ── 고정 명단이 아니라 회전 목록이다 ────────────────────────
// 주 단위로 상위 20 중 15.6개가 유지되고(78%) 한 달이면 절반이 뒤집힌다.
// 그래서 "이 테마가 왜 없냐" 는 물음에는 "지금 안 움직여서" 가 답이다.
//
// 데이터는 scripts/research/theme-upper-board.mjs 가 재고
// scripts/theme/build-upper.mjs 가 src/data/upper.json 으로 굳힌다.
import RAW from "@/data/upper.json";
import { cached } from "@/lib/cache";
import { unifiedQuotes, hasKIS } from "@/lib/kis";
import { krSessionNow } from "@/lib/session";

interface RawUpper {
  id: string;
  name: string;
  /** 지금 판에 올라 있나 — false 면 쉬는 중이다 */
  active: boolean;
  /** 마지막으로 판에 오른 날 */
  lastSeen: string;
  /** 판에 오른 횟수 */
  seen: number;
  src: string;
  w: number;
  su: number;
  score: number;
  codes: string[];
  top: { code: string; name: string }[];
}
const DATA = RAW as unknown as {
  출처: string;
  기준: string;
  만든날: string;
  시장거래대금배수: number;
  themes: RawUpper[];
};

/** 가격제한폭 — 이 밖은 시세가 아니라 데이터 오류다 (아래층과 같은 기준) */
const LIMIT = 30.5;

export interface UpperRow {
  id: string;
  name: string;
  active: boolean;
  lastSeen: string;
  seen: number;
  src: string;
  /** 잔차 상관 — 시장 몫을 걷어낸 뒤 저희끼리 얼마나 같이 움직이나 */
  w: number;
  /** 상대 거래대금 배수 */
  su: number;
  count: number;
  /** 오늘 등락률 — 구성종목의 단순 평균 */
  chg: number | null;
  up: number;
  down: number;
  leaders: { code: string; name: string; chg: number | null }[];
}

export interface UpperDetail extends UpperRow {
  stocks: { code: string; name: string; price: number | null; chg: number | null }[];
}

export const upperMeta = () => ({
  출처: DATA.출처,
  기준: DATA.기준,
  만든날: DATA.만든날,
});

/** 구성종목 시세 — 아래층과 같은 판을 쓴다(세션에 따라 보관 기간을 달리한다) */
async function quotes() {
  const codes = [...new Set(DATA.themes.flatMap((t) => t.codes))];
  const ttl = krSessionNow() === "장마감" ? 1800 : 300;
  return cached<Record<string, { price: number; chg: number }>>(
    `upper:quotes:v1:${codes.length}`,
    ttl,
    async () => {
      if (!hasKIS()) return {};
      const map: Record<string, { price: number; chg: number }> = {};
      for (const [code, q] of await unifiedQuotes(codes)) {
        // 가격제한폭 밖은 시세가 아니라 오류다 (아래층과 같은 기준)
        if (q.price <= 0 || Math.abs(q.changePct) > LIMIT) continue;
        map[code] = { price: q.price, chg: q.changePct };
      }
      return map;
    },
  );
}

function 집계(t: RawUpper, q: Record<string, { price: number; chg: number }>) {
  const rs: number[] = [];
  let up = 0;
  let down = 0;
  for (const c of t.codes) {
    const v = q[c]?.chg;
    if (v === undefined || Math.abs(v) > LIMIT) continue;
    rs.push(v);
    if (v > 0) up++;
    else if (v < 0) down++;
  }
  const chg = rs.length ? +(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2) : null;
  return { chg, up, down };
}

/** 판 — 점수순 */
export async function upperList(): Promise<UpperRow[]> {
  const q = await quotes();
  return DATA.themes.map((t) => {
    const { chg, up, down } = 집계(t, q);
    return {
      id: t.id,
      name: t.name,
      active: t.active ?? true,
      lastSeen: t.lastSeen ?? "",
      seen: t.seen ?? 1,
      src: t.src,
      w: t.w,
      su: t.su,
      count: t.codes.length,
      chg,
      up,
      down,
      // 대표종목은 재는 데 쓴 시총 상위에서 셋
      leaders: t.top.slice(0, 3).map((s) => ({
        code: s.code,
        name: s.name,
        chg: q[s.code]?.chg ?? null,
      })),
    };
  });
}

export async function upperDetail(id: string): Promise<UpperDetail> {
  const t = DATA.themes.find((x) => x.id === id);
  if (!t) throw new Error(`윗층 테마 없음: ${id}`);
  const q = await quotes();
  const { chg, up, down } = 집계(t, q);
  const 이름 = new Map(t.top.map((s) => [s.code, s.name]));
  const stocks = t.codes
    .map((c) => ({
      code: c,
      name: 이름.get(c) ?? c,
      price: q[c]?.price ?? null,
      chg: q[c]?.chg ?? null,
    }))
    .sort((a, b) => (b.chg ?? -999) - (a.chg ?? -999));
  return {
    id: t.id,
    name: t.name,
    active: t.active ?? true,
    lastSeen: t.lastSeen ?? "",
    seen: t.seen ?? 1,
    src: t.src,
    w: t.w,
    su: t.su,
    count: t.codes.length,
    chg,
    up,
    down,
    leaders: t.top.slice(0, 3).map((s) => ({ code: s.code, name: s.name, chg: q[s.code]?.chg ?? null })),
    stocks,
  };
}

/**
 * 이 종목이 든 윗층 테마 — 종목 화면 칩에 쓴다 (중복을 허용하므로 여럿일 수 있다).
 *
 * 쉬는 테마도 돌려준다. "이 종목이 지역화폐였다" 는 사실은 그 테마가 식어도
 * 그대로다 — 테마는 죽었다 살아나고, 돌아왔을 때 처음부터 다시 찾을 이유가 없다.
 * 지금 판에 있는지는 active 로 가른다.
 */
export function upperOfStock(code: string): { id: string; name: string; active: boolean }[] {
  return DATA.themes
    .filter((t) => t.codes.includes(code))
    .map((t) => ({ id: t.id, name: t.name, active: t.active ?? true }));
}
