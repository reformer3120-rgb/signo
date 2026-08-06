// 지수선물 투자자 수급 — 화면과 마감 리포트가 같은 값을 보도록 한 곳에서만 받아온다.
import { cached } from "./cache";
import { indexTrend } from "./naverApi";
import { currentSession } from "./kis";

export interface FutFlow {
  personal: number;
  foreign: number;
  institutional: number;
}

/**
 * 코스피200 선물 투자자 수급 (계약).
 *
 * 예전에는 대시보드와 마감 리포트가 각자 받아 각자 캐시하는 바람에 값이 어긋났다.
 * 마감 직후의 가집계를 리포트가 오래 붙들고 있는 동안 화면만 확정치로 바뀐 것이다.
 * 같은 키·같은 주기로 캐시해 두 화면이 갈라지지 않게 한다.
 *
 * 네이버는 코스피200 선물(FUT)만 투자자별로 제공한다.
 */
export async function futuresInvestorFlow(): Promise<FutFlow | null> {
  const ses = currentSession();
  return cached(`futflow:${ses}`, 60, async () => {
    try {
      const f = await indexTrend("FUT");
      return { personal: f.personal, foreign: f.foreign, institutional: f.institutional };
    } catch {
      return null;
    }
  });
}
