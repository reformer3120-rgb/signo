/**
 * 섹터 종합평가 채점 규칙 — 한국·미국 공용.
 * 두 시장의 점수를 같은 잣대로 읽을 수 있도록 가중치와 계산식을 한 곳에 둔다.
 */

export type MaSignal = "골든크로스" | "정배열" | "역배열" | "데드크로스" | "-";

/** 종합점수 가중치 (합 = 1) */
export const WEIGHTS = {
  재무: 0.28,
  밸류: 0.22,
  성장: 0.15,
  기관: 0.12, // 한국=외국인 보유비중, 미국=기관 보유비중
  시총: 0.1,
  모멘텀: 0.1,
  배당: 0.03,
} as const;

/** 화면에 적는 가중치 설명 (한국·미국 공통) */
export const WEIGHT_NOTE =
  "재무건전성(ROE·부채·이익률) 28 + 밸류(PER·PBR·EPS) 22 + 성장성 15 + %HOLDER% 12 + " +
  "시가총액 10 + 주가흐름(기간수익률·골든크로스) 10 + 배당 3 (100점)";

export function totalScore(p: {
  재무: number;
  밸류: number;
  성장: number;
  시총: number;
  모멘텀: number;
  기관: number;
  배당: number;
}): number {
  return Math.round(
    (p.재무 * WEIGHTS.재무 +
      p.밸류 * WEIGHTS.밸류 +
      p.성장 * WEIGHTS.성장 +
      p.시총 * WEIGHTS.시총 +
      p.모멘텀 * WEIGHTS.모멘텀 +
      p.기관 * WEIGHTS.기관 +
      p.배당 * WEIGHTS.배당) *
      100,
  );
}

/** 재무건전성 = ROE 50% + 부채비율(낮을수록) 30% + 영업이익률 20% */
export const finScore = (roeN: number, debtN: number, opN: number) =>
  roeN * 0.5 + debtN * 0.3 + opN * 0.2;

/** 밸류 = PER(낮을수록) 40% + PBR(낮을수록) 35% + EPS 25% */
export const valueScore = (perN: number, pbrN: number, epsN: number) =>
  perN * 0.4 + pbrN * 0.35 + epsN * 0.25;

/** 주가흐름 성적표 = 기간수익률 75% + 이동평균 교차 신호 25% */
export const trendScore = (
  r: { w1: number; m1: number; m3: number; m6: number; y1: number },
  crossScore: number,
) => (r.w1 * 0.15 + r.m1 * 0.3 + r.m3 * 0.25 + r.m6 * 0.2 + r.y1 * 0.1) * 0.75 + crossScore * 0.25;

/**
 * 정규화 함수.
 * 기준(min/max)은 '비교군 고정 멤버'로만 만든다 — 검색한 종목이 무엇이냐에 따라
 * 기준이 흔들려 같은 업종인데 순위가 매번 달라지는 것을 막기 위함.
 * 기준 밖의 값(검색 종목이 최댓값을 넘는 등)은 0~1로 클램프.
 */
export function dimScaler(baseVals: number[], dir: "hi" | "lo"): (v: number) => number {
  const valid = baseVals.filter((v) => Number.isFinite(v));
  if (!valid.length) return () => 0.5;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  return (v: number) => {
    if (!Number.isFinite(v)) return 0;
    const t = Math.min(1, Math.max(0, (v - min) / range));
    return dir === "hi" ? t : 1 - t;
  };
}

export function movingAvg(closes: number[], p: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= p) sum -= closes[i - p];
    out.push(i >= p - 1 ? sum / p : null);
  }
  return out;
}

/**
 * 20일선과 60일선의 교차 상태.
 * 골든크로스 = 최근 20거래일 내 20일선이 60일선을 상향 돌파(가장 강한 신호)
 * 정배열 = 20일선이 60일선 위 / 역배열 = 아래 / 데드크로스 = 최근 하향 돌파
 */
export function maCross(closes: number[]): { signal: MaSignal; days: number; score: number } {
  if (closes.length < 61) return { signal: "-", days: -1, score: 0.5 };
  const s = movingAvg(closes, 20);
  const l = movingAvg(closes, 60);
  const above = (i: number) => s[i] !== null && l[i] !== null && (s[i] as number) > (l[i] as number);
  const last = closes.length - 1;
  // 가장 최근 교차 시점 찾기
  let cross = -1;
  for (let i = last; i > 0; i--) {
    if (s[i] === null || l[i] === null || s[i - 1] === null || l[i - 1] === null) break;
    if (above(i) !== above(i - 1)) {
      cross = last - i;
      break;
    }
  }
  const up = above(last);
  const fresh = cross >= 0 && cross <= 20;
  if (up) {
    // 갓 만들어진 골든크로스일수록 가점 ↑
    return {
      signal: fresh ? "골든크로스" : "정배열",
      days: cross,
      score: fresh ? 1 - (cross / 20) * 0.2 : 0.7,
    };
  }
  return { signal: fresh ? "데드크로스" : "역배열", days: cross, score: fresh ? 0.05 : 0.25 };
}

/** n거래일 전 대비 수익률 % */
export function pctBack(closes: number[], back: number): number {
  const last = closes[closes.length - 1];
  const idx = closes.length - 1 - back;
  const base = idx >= 0 ? closes[idx] : closes[0];
  return base > 0 ? +(((last - base) / base) * 100).toFixed(2) : 0;
}

/** 종가 배열에서 1일·1주·1달·3달·6달·1년 수익률 */
export function periodReturns(closes: number[]) {
  if (closes.length < 2) return { d1: 0, w1: 0, m1: 0, m3: 0, m6: 0, y1: 0 };
  return {
    d1: pctBack(closes, 1),
    w1: pctBack(closes, 5),
    m1: pctBack(closes, 20),
    m3: pctBack(closes, 60),
    m6: pctBack(closes, 120),
    y1: pctBack(closes, 245),
  };
}

export function gradeOf(s: number): string {
  if (s >= 85) return "A+";
  if (s >= 70) return "A";
  if (s >= 55) return "B";
  if (s >= 40) return "C";
  return "D";
}
