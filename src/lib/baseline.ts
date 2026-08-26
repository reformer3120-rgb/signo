// 시장 전체 기준선 — 종합평가 점수를 비교군과 무관하게 고정하기 위한 분포. 서버 전용.
//
// 왜 필요한가
//   점수를 비교군 안에서만 정규화하면 같은 종목이 어느 그룹에 묶이느냐에 따라
//   점수가 크게 흔들린다(삼성전자가 43점에서 81점까지). 그래서 '시장 전체'라는
//   고정된 잣대를 따로 두고, 그 잣대로 매긴 점수를 절대점수로 쓴다.
//
// 어떻게 만드나
//   시총 상위 종목들의 지표 분포(하위 10% ~ 상위 90% 지점)를 기준선으로 삼는다.
//   최저·최고 대신 10/90 백분위를 쓰는 이유는 이상치 한 종목이 잣대를 통째로
//   왜곡하는 것을 막기 위해서다.
//
// 비용
//   종목당 상세·재무·일봉 3회 조회가 필요해 한 번에 다 받을 수 없다.
//   종목별 지표를 오래 보관해 두고 호출마다 조금씩 채운다. 몇 번 쓰다 보면
//   기준선이 완성되고, 그 뒤로는 추가 조회가 없다.
import { redis } from "./cache";
import { finScore, totalScore, valueScore } from "./score";

/** 절대점수에 쓰는 지표 묶음 — 한 종목 몫 */
export interface StockMetrics {
  roe: number;
  debt: number;
  opMargin: number;
  growth: number;
  per: number;
  pbr: number;
  eps: number;
  div: number;
  cap: number; // log10 시가총액
  foreign: number;
  trend: number; // 0~1 로 이미 환산된 주가흐름 성적
}

export type Dim = keyof StockMetrics;

/** 값이 클수록 좋은가, 작을수록 좋은가 */
export const DIM_DIR: Record<Dim, "hi" | "lo"> = {
  roe: "hi",
  debt: "lo",
  opMargin: "hi",
  growth: "hi",
  per: "lo",
  pbr: "lo",
  eps: "hi",
  div: "hi",
  cap: "hi",
  foreign: "hi",
  trend: "hi",
};

export interface Baseline {
  /** 지표별 [하위 10%, 상위 90%] 지점 */
  bounds: Partial<Record<Dim, [number, number]>>;
  /** 기준선을 만드는 데 쓴 종목 수 */
  samples: number;
}

// 종목별 지표 보관 기간.
// 크론 한 번(50초)에 200종목쯤 채운다. 대상을 시총 상위 600에서 테마 편입
// 2,600종목으로 넓히면서 하루 열 번 돌리게 했으니 하루 2,000종목쯤 지나간다.
// 보관을 이보다 짧게 잡으면 만료가 채우는 속도를 앞질러 빈 종목이 계속 남는다.
const METRIC_TTL = 7 * 24 * 3600;
const KEY = (code: string) => `mx:${code}`;
/** 기준선으로 인정할 최소 표본 — 이보다 적으면 잣대로 쓰지 않는다 */
export const MIN_SAMPLES = 25;

/** 백분위 지점 (0~1) */
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export async function saveMetrics(code: string, m: StockMetrics) {
  if (!redis) return;
  await redis.set(KEY(code), m, { ex: METRIC_TTL }).catch(() => {});
}

/** 보관해 둔 지표들을 모아 기준선을 만든다. 표본이 모자라면 samples 로 알린다. */
export async function marketBaseline(universe: string[]): Promise<Baseline> {
  if (!redis) return { bounds: {}, samples: 0 };
  const rows: StockMetrics[] = [];
  for (let i = 0; i < universe.length; i += 50) {
    const part = universe.slice(i, i + 50);
    const hit = await redis
      .mget<(StockMetrics | null)[]>(...part.map(KEY))
      .catch(() => null);
    if (hit) for (const m of hit) if (m && Number.isFinite(m.cap)) rows.push(m);
  }
  const bounds: Baseline["bounds"] = {};
  if (rows.length >= MIN_SAMPLES) {
    for (const dim of Object.keys(DIM_DIR) as Dim[]) {
      const vals = rows.map((r) => r[dim]).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (vals.length >= MIN_SAMPLES) bounds[dim] = [quantile(vals, 0.1), quantile(vals, 0.9)];
    }
  }
  return { bounds, samples: rows.length };
}

/** 아직 지표를 모아두지 않은 종목 — 호출마다 조금씩 채우기 위해 */
export async function missingFrom(universe: string[], limit: number): Promise<string[]> {
  if (!redis) return [];
  const out: string[] = [];
  for (let i = 0; i < universe.length && out.length < limit; i += 50) {
    const part = universe.slice(i, i + 50);
    const hit = await redis.mget<(StockMetrics | null)[]>(...part.map(KEY)).catch(() => null);
    if (!hit) continue;
    part.forEach((c, k) => {
      if (!hit[k] && out.length < limit) out.push(c);
    });
  }
  return out;
}

/**
 * 기준선으로 만든 정규화 함수.
 * 기준선 밖의 값은 0~1로 자른다 — 시장 최고 수준을 넘어서도 100점이 상한.
 */
export function baselineScaler(b: Baseline, dim: Dim): ((v: number) => number) | null {
  const bd = b.bounds[dim];
  if (!bd) return null;
  const [lo, hi] = bd;
  const range = hi - lo || 1;
  const dir = DIM_DIR[dim];
  return (v: number) => {
    if (!Number.isFinite(v)) return 0;
    const t = Math.min(1, Math.max(0, (v - lo) / range));
    return dir === "hi" ? t : 1 - t;
  };
}

/**
 * 보관해 둔 지표로 종합평가 점수를 계산한다.
 * 섹터평가와 같은 잣대·같은 가중치를 쓰므로 두 화면의 등급이 어긋나지 않는다.
 * 아직 지표를 모아두지 않은 종목은 null.
 */
export async function scoresFor(
  codes: string[],
  base: Baseline,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!redis || base.samples < MIN_SAMPLES || !codes.length) return out;
  const want = [...new Set(codes.filter(Boolean))];
  for (let i = 0; i < want.length; i += 50) {
    const part = want.slice(i, i + 50);
    const hit = await redis.mget<(StockMetrics | null)[]>(...part.map(KEY)).catch(() => null);
    if (!hit) continue;
    part.forEach((code, k) => {
      const m = hit[k];
      if (!m) return;
      const S = (d: Dim) => {
        const f = baselineScaler(base, d);
        return f ? f(m[d]) : 0.5;
      };
      out[code] = totalScore({
        재무: finScore(S("roe"), S("debt"), S("opMargin")),
        밸류: valueScore(S("per"), S("pbr"), S("eps")),
        성장: S("growth"),
        시총: S("cap"),
        모멘텀: S("trend"),
        기관: S("foreign"),
        배당: S("div"),
      });
    });
  }
  return out;
}
