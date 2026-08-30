// 종목 한 줄 소개에 쓰는 사실 묶음. 서버 전용.
//
// ── 왜 따로 두나 ───────────────────────────────────────────
// 종합점수(baseline.ts)는 분포를 만들기 위한 것이라 0~1 로 환산된 값만 담는다.
// 화면에는 환산 전의 날것이 필요하다 — "1개월 +8.2%", "외국인 5.6%",
// "목표주가 11,000원" 처럼 사람이 읽는 값이다.
//
// 이것을 화면에서 종목마다 조회하면 테마 상세 한 판에 쉰 번을 부르게 된다.
// 그런데 지표 크론(collectMetrics)이 이미 종목마다 상세·재무·일봉을 받고 있다.
// 거기서 한 번 더 저장해 두면 조회가 늘지 않는다. 화면은 한꺼번에 읽어 간다.
//
// 없을 수 있다. 크론이 아직 안 훑은 종목은 비어 있고, 화면은 그 칸을 지운다.
import { redis } from "./cache";
import type { MaAlign, MaSignal } from "./score";

export interface StockFacts {
  /** 기간 수익률 % */
  ret: { w1: number; m1: number; m3: number; m6: number; y1: number };
  /** 배지에 적는 값 — 최근 크로스가 있으면 그것, 없으면 배열 상태 */
  cross: MaSignal;
  /** 이평선 배열 (5>20>60>120). 크로스가 겹쳐 있어도 상태는 따로 봐야 한다 */
  align?: MaAlign;
  /** 그 배열이 며칠째 */
  alignDays?: number;
  /** 크로스가 추세의 뒷받침을 받는가. 크로스가 아니면 null */
  crossOk?: boolean | null;
  /** 크로스가 며칠 전인가 — 0 이면 직전 정규장에 났다 (없으면 -1) */
  crossDays?: number;
  /** 20일선 이격도 % */
  gap20?: number | null;
  /** 외국인 보유비중 % */
  foreign: number | null;
  /**
   * 최근 5거래일 매수 우위 주체 — "기관" · "외국인" · "개인" · "-"
   *
   * 테마 화면의 종목 카드에 적는다. 74종목짜리 테마에서 종목마다 수급을
   * 부르면 수십 번을 두드리게 되므로, 이평선·외국인비중과 같이 크론이
   * 미리 모아 둔다.
   */
  bias?: "개인" | "외국인" | "기관" | "-" | null;
  /** 애널리스트 목표주가 평균 (커버리지가 있는 종목만) */
  target: number | null;
  /** 목표주가 상승여력 % */
  upside: number | null;
  /** 투자의견 평균 1(매도)~5(매수) */
  recomm: number | null;
  /** 언제 모았나 (YYYY-MM-DD) */
  at: string;
}

// 지표(mx:)와 같은 기간만 둔다. 한쪽만 남아 있으면 화면이 어긋난다.
const TTL = 7 * 24 * 3600;
const KEY = (code: string) => `sx:${code}`;

export async function saveFacts(code: string, f: StockFacts) {
  if (!redis) return;
  await redis.set(KEY(code), f, { ex: TTL }).catch(() => {});
}

/** 여러 종목을 한꺼번에. 없는 종목은 키가 빠진 채로 온다. */
export async function factsFor(codes: string[]): Promise<Record<string, StockFacts>> {
  const out: Record<string, StockFacts> = {};
  if (!redis || !codes.length) return out;
  for (let i = 0; i < codes.length; i += 50) {
    const part = codes.slice(i, i + 50);
    const hit = await redis.mget<(StockFacts | null)[]>(...part.map(KEY)).catch(() => null);
    if (!hit) continue;
    part.forEach((c, k) => {
      const v = hit[k];
      if (v && v.ret) out[c] = v;
    });
  }
  return out;
}
