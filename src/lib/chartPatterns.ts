// 차트 패턴 자동 탐지.
//
// 화면에 보이는 캔들만 본다. 전체 구간을 뒤지면 5년 전 헤드앤숄더가 걸려
// 지금 판단에 쓸 수 없는 것이 계속 뜬다. 확대·이동하면 그 구간에서 다시 찾는다.
//
// 방법
//   1) 스윙 고점·저점을 뽑는다 (지그재그 — 일정 비율 이상 되돌려야 확정)
//   2) 뽑힌 점들의 배열에 패턴 모양을 맞춰 본다
//   3) 맞은 것의 기준선(넥라인·추세선)과 목표가를 함께 돌려준다
//
// 새 패턴을 넣으려면 MATCHERS 에 함수 하나를 추가한다. 입력은 스윙 점 배열,
// 출력은 Pattern 이다. 다른 곳은 손대지 않아도 된다.
import type { Candle } from "@/lib/types";

/** 스윙 지점 — 지그재그가 확정한 고점/저점 */
export interface Pivot {
  i: number; // 봉 번호
  time: number;
  price: number;
  kind: "H" | "L";
}

export type Bias = "bull" | "bear" | "neutral";

export interface Pattern {
  name: string; // 화면에 띄우는 이름
  bias: Bias; // 상승 / 하락 / 중립
  /** 패턴을 이루는 꼭짓점 — 이어서 골격선을 그린다 */
  points: { time: number; price: number }[];
  /** 기준선 (넥라인·추세선). 두 점을 이어 오른쪽 끝까지 연장해 그린다 */
  lines?: { a: { time: number; price: number }; b: { time: number; price: number }; dash?: boolean }[];
  /** 목표가 — 있으면 가격축에 함께 표시 */
  target?: number;
  /** 0~1. 낮은 것은 걸러낸다 */
  score: number;
  note?: string;
}

// ── 1) 스윙 지점 ──────────────────────────────────────────────

/**
 * 지그재그. 직전 극점에서 dev 비율만큼 되돌려야 그 극점을 확정한다.
 * dev 가 작으면 잔가지가 다 잡히고, 크면 큰 흐름만 남는다.
 */
export function pivots(data: Candle[], from: number, to: number, dev: number): Pivot[] {
  if (to - from < 4) return [];
  const out: Pivot[] = [];
  let dir: "up" | "down" | null = null;
  let extI = from;
  let extP = data[from].close;

  for (let i = from + 1; i <= to; i++) {
    const hi = data[i].high;
    const lo = data[i].low;
    if (dir !== "down" && hi > extP) {
      extP = hi;
      extI = i;
      dir = "up";
    } else if (dir !== "up" && lo < extP) {
      extP = lo;
      extI = i;
      dir = "down";
    }
    if (dir === "up" && lo < extP * (1 - dev)) {
      out.push({ i: extI, time: data[extI].time, price: extP, kind: "H" });
      dir = "down";
      extP = lo;
      extI = i;
    } else if (dir === "down" && hi > extP * (1 + dev)) {
      out.push({ i: extI, time: data[extI].time, price: extP, kind: "L" });
      dir = "up";
      extP = hi;
      extI = i;
    }
  }
  // 마지막 극점도 넣는다 — 아직 확정되지 않았지만 형태 판단에는 필요하다
  out.push({ i: extI, time: data[extI].time, price: extP, kind: dir === "up" ? "H" : "L" });
  return out;
}

/** 화면 구간의 변동폭에 맞춰 되돌림 기준을 정한다 */
export function autoDev(data: Candle[], from: number, to: number): number {
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i <= to; i++) {
    if (data[i].high > hi) hi = data[i].high;
    if (data[i].low < lo) lo = data[i].low;
  }
  if (!(lo > 0) || !Number.isFinite(hi)) return 0.03;
  const span = hi / lo - 1; // 구간 전체 등락폭
  // 전체 폭의 1/8 쯤을 잔가지 기준으로. 너무 잘거나 너무 굵지 않게 자른다
  return Math.min(0.12, Math.max(0.012, span / 8));
}

// ── 2) 보조 ──────────────────────────────────────────────────

const near = (a: number, b: number, tol: number) => Math.abs(a - b) / Math.max(a, b) <= tol;
const P = (p: Pivot) => ({ time: p.time, price: p.price });

/** 최소제곱 직선 — 기울기와 절편 (x 는 봉 번호) */
function fit(pts: Pivot[]): { m: number; c: number } | null {
  if (pts.length < 2) return null;
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) {
    sx += p.i;
    sy += p.price;
    sxx += p.i * p.i;
    sxy += p.i * p.price;
  }
  const d = n * sxx - sx * sx;
  if (!d) return null;
  return { m: (n * sxy - sx * sy) / d, c: (sy * sxx - sx * sxy) / d };
}

const at = (l: { m: number; c: number }, i: number) => l.m * i + l.c;

// ── 3) 패턴 ──────────────────────────────────────────────────

type Matcher = (ps: Pivot[], data: Candle[]) => Pattern | null;

/** 머리어깨형 — 어깨 두 개와 그보다 높은 머리, 두 골을 이은 넥라인 */
const headShoulders: Matcher = (ps) => {
  for (let s = ps.length - 5; s >= 0; s--) {
    const [a, b, c, d, e] = ps.slice(s, s + 5);
    if (!e) continue;
    const top = a.kind === "H";
    if (!(a.kind === (top ? "H" : "L") && c.kind === a.kind && e.kind === a.kind)) continue;
    if (b.kind === a.kind || d.kind === a.kind) continue;

    // 머리가 양 어깨보다 뚜렷하게 튀어나와야 한다
    const headOut = top
      ? c.price > a.price * 1.02 && c.price > e.price * 1.02
      : c.price < a.price * 0.98 && c.price < e.price * 0.98;
    if (!headOut) continue;
    // 두 어깨 높이가 비슷해야 한다
    if (!near(a.price, e.price, 0.06)) continue;
    // 넥라인이 너무 기울면 형태로 보기 어렵다
    if (!near(b.price, d.price, 0.09)) continue;

    const neck = (b.price + d.price) / 2;
    const target = top ? neck - (c.price - neck) : neck + (neck - c.price);
    const shoulderFit = 1 - Math.abs(a.price - e.price) / Math.max(a.price, e.price) / 0.06;
    return {
      name: top ? "머리어깨형" : "역머리어깨형",
      bias: top ? "bear" : "bull",
      points: [a, b, c, d, e].map(P),
      lines: [{ a: P(b), b: P(d), dash: true }],
      target,
      score: 0.55 + 0.35 * Math.max(0, Math.min(1, shoulderFit)),
      note: top ? "넥라인 이탈 시 하락 신호" : "넥라인 돌파 시 상승 신호",
    };
  }
  return null;
};

/** 쌍바닥·쌍봉 — 같은 높이의 극점 둘과 그 사이 되돌림 */
const doubleTB: Matcher = (ps) => {
  for (let s = ps.length - 3; s >= 0; s--) {
    const [a, b, c] = ps.slice(s, s + 3);
    if (!c || a.kind !== c.kind || b.kind === a.kind) continue;
    if (!near(a.price, c.price, 0.035)) continue;
    const top = a.kind === "H";
    // 사이 되돌림이 충분해야 두 개의 봉우리로 보인다
    const depth = Math.abs(a.price - b.price) / a.price;
    if (depth < 0.03) continue;

    const target = top ? b.price - (a.price - b.price) : b.price + (b.price - a.price);
    return {
      name: top ? "쌍봉" : "쌍바닥",
      bias: top ? "bear" : "bull",
      points: [a, b, c].map(P),
      lines: [
        { a: P(a), b: P(c) },
        { a: P(b), b: { time: c.time, price: b.price }, dash: true },
      ],
      target,
      score: 0.5 + 0.3 * Math.max(0, Math.min(1, 1 - Math.abs(a.price - c.price) / a.price / 0.035)),
      note: top ? "목선 이탈 시 하락 신호" : "목선 돌파 시 상승 신호",
    };
  }
  return null;
};

/** 삼중천장·삼중바닥 */
const tripleTB: Matcher = (ps) => {
  for (let s = ps.length - 5; s >= 0; s--) {
    const [a, b, c, d, e] = ps.slice(s, s + 5);
    if (!e) continue;
    if (!(a.kind === c.kind && c.kind === e.kind) || b.kind === a.kind || d.kind === a.kind) continue;
    if (!near(a.price, c.price, 0.03) || !near(c.price, e.price, 0.03)) continue;
    const top = a.kind === "H";
    // 사이 되돌림이 얕으면 봉우리 세 개가 아니라 그냥 옆걸음이다.
    // 이 조건이 없으면 거의 평평한 구간에서도 삼중바닥이 잡힌다.
    const lvl3 = (a.price + c.price + e.price) / 3;
    const depth = Math.max(Math.abs(lvl3 - b.price), Math.abs(lvl3 - d.price)) / lvl3;
    if (depth < 0.03) continue;
    const neck = (b.price + d.price) / 2;
    const lvl = lvl3;
    return {
      name: top ? "삼중천장" : "삼중바닥",
      bias: top ? "bear" : "bull",
      points: [a, b, c, d, e].map(P),
      lines: [
        { a: P(a), b: P(e) },
        { a: P(b), b: P(d), dash: true },
      ],
      target: top ? neck - (lvl - neck) : neck + (neck - lvl),
      score: 0.7,
      note: top ? "세 번 막힌 저항" : "세 번 지켜진 지지",
    };
  }
  return null;
};

/**
 * 삼각형·쐐기·채널 — 고점선과 저점선의 기울기 조합으로 갈린다.
 * 마지막 스윙 5개 이상을 두 선으로 나눠 맞춘다.
 */
const wedgeTriangle: Matcher = (ps, data) => {
  const use = ps.slice(-7);
  const hs = use.filter((p) => p.kind === "H");
  const ls = use.filter((p) => p.kind === "L");
  if (hs.length < 2 || ls.length < 2 || hs.length + ls.length < 5) return null;

  const top = fit(hs);
  const bot = fit(ls);
  if (!top || !bot) return null;

  const i0 = use[0].i;
  const i1 = use[use.length - 1].i;
  const w0 = at(top, i0) - at(bot, i0);
  const w1 = at(top, i1) - at(bot, i1);
  if (!(w0 > 0) || !(w1 > 0)) return null;

  const mid = (at(top, i1) + at(bot, i1)) / 2;
  if (!(mid > 0)) return null;
  // 위아래 폭이 2% 도 안 되면 추세대가 아니라 잔가지다
  if (Math.max(w0, w1) / mid < 0.02) return null;
  // 기울기를 '봉당 몇 %' 로 바꿔 비교한다 — 가격 수준이 달라도 같은 잣대가 된다
  const sTop = (top.m / mid) * 100;
  const sBot = (bot.m / mid) * 100;
  const flat = 0.05; // 이보다 완만하면 수평으로 본다
  const converge = w1 < w0 * 0.75;
  const parallel = Math.abs(sTop - sBot) < 0.04 && !converge;

  let name: string | null = null;
  let bias: Bias = "neutral";
  if (Math.abs(sTop) < flat && sBot > flat) {
    name = "상승삼각형";
    bias = "bull";
  } else if (Math.abs(sBot) < flat && sTop < -flat) {
    name = "하락삼각형";
    bias = "bear";
  } else if (converge && sTop < -flat && sBot > flat) {
    name = "대칭삼각형";
    bias = "neutral";
  } else if (converge && sTop > flat && sBot > flat) {
    name = "상승쐐기";
    bias = "bear"; // 오르면서 좁아지는 쐐기는 하락 반전으로 본다
  } else if (converge && sTop < -flat && sBot < -flat) {
    name = "하락쐐기";
    bias = "bull";
  } else if (parallel && sTop > flat) {
    name = "상승채널";
    bias = "bull";
  } else if (parallel && sTop < -flat) {
    name = "하락채널";
    bias = "bear";
  } else if (parallel) {
    name = "횡보 박스";
    bias = "neutral";
  }
  if (!name) return null;

  const end = Math.min(data.length - 1, i1);
  const lineAt = (l: { m: number; c: number }) => [
    { time: data[i0].time, price: at(l, i0) },
    { time: data[end].time, price: at(l, end) },
  ];
  const [ta, tb] = lineAt(top);
  const [ba, bb] = lineAt(bot);
  return {
    name,
    bias,
    points: [],
    lines: [
      { a: ta, b: tb },
      { a: ba, b: bb },
    ],
    // 삼각형·쐐기는 폭만큼 튀어나간다고 본다
    target: bias === "bull" ? at(top, end) + w0 : bias === "bear" ? at(bot, end) - w0 : undefined,
    score: 0.45 + (converge ? 0.25 : 0.1) + Math.min(0.2, (hs.length + ls.length - 5) * 0.05),
    note: converge ? "수렴 — 이탈 방향으로 움직임이 커진다" : "추세대",
  };
};

const MATCHERS: Matcher[] = [headShoulders, tripleTB, doubleTB, wedgeTriangle];

// ── 4) 진입점 ────────────────────────────────────────────────

/**
 * 보이는 구간에서 패턴을 찾는다.
 * 겹치는 패턴이 여럿이면 점수가 높은 쪽만 남긴다 (화면이 선으로 뒤덮이지 않게).
 */
export function detectPatterns(data: Candle[], from: number, to: number, max = 2): Pattern[] {
  if (!data.length || to - from < 12) return [];
  // 보이는 구간이 거의 평평하면 무엇을 갖다 대도 '맞는' 것처럼 보인다.
  // 없는 패턴을 그럴듯하게 띄우는 쪽이 안 띄우는 쪽보다 위험하다.
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i <= to; i++) {
    if (data[i].high > hi) hi = data[i].high;
    if (data[i].low < lo) lo = data[i].low;
  }
  if (!(lo > 0) || hi / lo - 1 < 0.012) return [];

  const dev = autoDev(data, from, to);
  const ps = pivots(data, from, to, dev);
  if (ps.length < 3) return [];

  const found: Pattern[] = [];
  for (const m of MATCHERS) {
    try {
      const r = m(ps, data);
      if (r && r.score >= 0.5) found.push(r);
    } catch {
      /* 한 패턴이 실패해도 나머지는 계속 찾는다 */
    }
  }
  found.sort((a, b) => b.score - a.score);
  return found.slice(0, max);
}
