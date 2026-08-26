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
import type { MaSignal } from "./score";

export interface StockFacts {
  /** 기간 수익률 % */
  ret: { w1: number; m1: number; m3: number; m6: number; y1: number };
  /** 20일선과 60일선의 자리 */
  cross: MaSignal;
  /** 외국인 보유비중 % */
  foreign: number | null;
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
