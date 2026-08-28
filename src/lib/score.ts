/**
 * 섹터 종합평가 채점 규칙 — 한국·미국 공용.
 * 두 시장의 점수를 같은 잣대로 읽을 수 있도록 가중치와 계산식을 한 곳에 둔다.
 */

/** 이평선이 늘어선 순서 — 어느 쪽도 아니면 혼조다 (전환 중이거나 무너지는 중) */
export type MaAlign = "정배열" | "역배열" | "혼조" | "-";
export type MaSignal = "골든크로스" | "데드크로스" | MaAlign;

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
  "시가총액 10 + 주가흐름(기간수익률·이평선) 10 + 배당 3 (100점)";

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

/** 주가흐름 성적표 = 기간수익률 75% + 이평선 읽기 25% (maRead 의 score) */
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

/** 크로스를 "최근 일" 로 볼 거래일 */
const FRESH = 20;

export interface MaRead {
  /** 배지에 적는 것 — 최근 크로스가 있으면 그것, 없으면 배열 상태 */
  signal: MaSignal;
  /** 크로스가 며칠 전인가 (없으면 -1) */
  days: number;
  /** 주가흐름 점수에 들어갈 0~1 */
  score: number;
  /** 이평선이 늘어선 순서 */
  align: MaAlign;
  /** 그 배열이 며칠째인가 */
  alignDays: number;
  /** 배열 판정에 쓴 이평선 — 일봉이 모자라면 120일선은 뺀다 */
  alignOf: number[];
  cross: {
    type: "골든크로스" | "데드크로스";
    days: number;
    /** 추세가 뒷받침하는가 — 아래 휩쏘 거르기를 통과했는가 */
    confirmed: boolean;
    /** 무엇을 보고 그렇게 판정했는지 한 줄 */
    why: string;
  } | null;
  /** 20일선 이격도 % — 양수면 이평선 위 */
  gap20: number | null;
}

/**
 * 이동평균선 읽기 — 배열(상태)과 교차(이벤트)를 따로 낸다.
 *
 * ── 전에 틀렸던 것 ────────────────────────────────────────
 * 20일선과 60일선 둘만 보고 20 > 60 이면 "정배열" 이라 적었다. 정배열은 원래
 * 위에서부터 단기 > 중기 > 장기(5 > 20 > 60 > 120)로 늘어선 것을 말한다.
 * 둘만 보면 5일선이 꺾여 무너지는 중인 종목까지 정배열로 찍히고, 애초에
 * "어느 쪽도 아닌" 혼조 상태를 나타낼 칸이 없었다. 상태를 셋으로 나눈다.
 *
 * ── 휩쏘 거르기 ──────────────────────────────────────────
 * 교차는 후행 지표라 횡보장에서 오신호가 잦다. 그래서 크로스에는 "확인" 을
 * 같이 낸다. 둘 다 만족해야 확인이다.
 *   ① 장기선(60일)이 실제로 방향을 틀었는가 — 20거래일 전과 견준다
 *   ② 교차 무렵 거래가 실렸는가 — 앞선 20일 평균의 1.2배 (거래량을 넘긴 경우만)
 * 거래량을 안 넘기면 ② 는 묻지 않는다. 있는데 미달이면 확인이 아니다.
 *
 * 이격도(gap20)도 같이 낸다. 정배열이어도 20일선에서 크게 떠 있으면 그 자리에서
 * 따라 사는 것은 다른 이야기다.
 */
export function maRead(closes: number[], volumes?: number[]): MaRead {
  const empty: MaRead = {
    signal: "-", days: -1, score: 0.5,
    align: "-", alignDays: 0, alignOf: [], cross: null, gap20: null,
  };
  if (closes.length < 61) return empty;
  const last = closes.length - 1;

  const m5 = movingAvg(closes, 5);
  const m20 = movingAvg(closes, 20);
  const m60 = movingAvg(closes, 60);
  const m120 = closes.length >= 121 ? movingAvg(closes, 120) : null;

  // ── 배열
  const rows = m120 ? [m5, m20, m60, m120] : [m5, m20, m60];
  const alignOf = m120 ? [5, 20, 60, 120] : [5, 20, 60];
  const alignAt = (i: number): MaAlign => {
    const v = rows.map((r) => r[i]);
    if (v.some((x) => x === null)) return "-";
    const n = v as number[];
    let up = true;
    let down = true;
    for (let k = 0; k < n.length - 1; k++) {
      if (!(n[k] > n[k + 1])) up = false;
      if (!(n[k] < n[k + 1])) down = false;
    }
    return up ? "정배열" : down ? "역배열" : "혼조";
  };
  const align = alignAt(last);
  let alignDays = 0;
  for (let i = last; i >= 0 && alignAt(i) === align; i--) alignDays++;

  // ── 교차 (20일선 ↔ 60일선)
  const above = (i: number) =>
    m20[i] !== null && m60[i] !== null && (m20[i] as number) > (m60[i] as number);
  let at = -1;
  for (let i = last; i > 0; i--) {
    if (m20[i] === null || m60[i] === null || m20[i - 1] === null || m60[i - 1] === null) break;
    if (above(i) !== above(i - 1)) { at = i; break; }
  }
  const days = at >= 0 ? last - at : -1;
  const fresh = days >= 0 && days <= FRESH;
  const up = above(last);

  // 휩쏘 거르기
  const back = m60[last - 20];
  const slopeUp = m60[last] !== null && back != null && (m60[last] as number) > back;
  const trendOk = up ? slopeUp : !slopeUp;
  let volRatio: number | null = null;
  if (volumes && volumes.length === closes.length && at >= 5) {
    const around = volumes.slice(Math.max(0, at - 2), at + 3);
    const base = volumes.slice(Math.max(0, at - 22), Math.max(1, at - 2));
    const a = around.reduce((x, y) => x + y, 0) / (around.length || 1);
    const b = base.reduce((x, y) => x + y, 0) / (base.length || 1);
    if (b > 0) volRatio = a / b;
  }
  const volOk = volRatio === null ? null : volRatio >= 1.2;
  const confirmed = trendOk && volOk !== false;

  const why = [
    trendOk ? `60일선 ${up ? "상승" : "하락"} 중` : `60일선은 아직 ${up ? "하락" : "상승"} 중`,
    volRatio === null ? null : `거래량 ${volRatio.toFixed(1)}배`,
  ].filter(Boolean).join(" · ");

  const cross = fresh
    ? { type: (up ? "골든크로스" : "데드크로스") as "골든크로스" | "데드크로스", days, confirmed, why }
    : null;

  // ── 점수. 확인된 크로스에만 온전한 가·감점을 준다.
  const score = cross
    ? up
      ? confirmed ? 1 : 0.75
      : confirmed ? 0 : 0.2
    : align === "정배열" ? 0.75 : align === "역배열" ? 0.25 : 0.5;

  const base20 = m20[last];
  return {
    signal: cross ? cross.type : align,
    days,
    score,
    align,
    alignDays,
    alignOf,
    cross,
    gap20: base20 ? +((closes[last] / base20 - 1) * 100).toFixed(1) : null,
  };
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

/**
 * 종합점수 → 등급 (S+ 최상 ~ E- 최하)
 *
 * 구간은 실제 점수 분포에 맞춰 잡았다. 시총 상위 종목을 표본으로 재보니
 * 32~84 사이에 몰려 있고 중앙값이 50대 중반이었다. 그래서 값이 촘촘한
 * 28~87 구간은 5점 폭으로 잘게 나눠 등급이 실제로 구분되게 하고,
 * 양 끝은 넓게 두었다 — 그 바깥은 아주 드물게만 닿는 자리다.
 *
 *   S+ 88↑   아주 드문 최상위        A  63~67   대형 우량주가 닿는 곳
 *   S  80~87 (SK하이닉스 84)         B  48~52   (현대차·HMM 51)
 *   C  33~37 (SK이노베이션 36)       E  12↓    사실상 바닥
 */
const GRADE_CUTS: [number, string][] = [
  [88, "S+"],
  [80, "S"],
  [74, "S-"],
  [68, "A+"],
  [63, "A"],
  [58, "A-"],
  [53, "B+"],
  [48, "B"],
  [43, "B-"],
  [38, "C+"],
  [33, "C"],
  [28, "C-"],
  [23, "D+"],
  [18, "D"],
  [13, "D-"],
  [8, "E+"],
  [4, "E"],
  [0, "E-"],
];

export function scoreGrade(score: number): string {
  for (const [cut, g] of GRADE_CUTS) if (score >= cut) return g;
  return "E-";
}

/** 등급 배지 색 — S·A 계열은 상승색, B는 중립, C 이하는 하락색 */
export function scoreGradeTone(grade: string): string {
  const head = grade[0];
  if (head === "S") return "border-up/50 bg-up/20 text-up";
  if (head === "A") return "border-up/35 bg-up/10 text-up";
  if (head === "B") return "border-signal/40 bg-signal/10 text-signal";
  if (head === "C") return "border-line bg-canvas/60 text-muted";
  return "border-down/40 bg-down/10 text-down";
}
