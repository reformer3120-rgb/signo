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
  /**
   * 기준선 (넥라인·추세선). 기본은 오른쪽 끝까지 연장해 그린다 —
   * 어디서 이탈·돌파하는지 보이게 하기 위해서다.
   * 다이아몬드처럼 닫힌 도형은 extend:false 로 두 점만 잇는다.
   */
  lines?: {
    a: { time: number; price: number };
    b: { time: number; price: number };
    dash?: boolean;
    extend?: boolean;
  }[];
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

  // 첫 극점도 넣는다. 지그재그는 방향이 한 번 꺾여야 극점을 확정하므로
  // 시작점이 통째로 빠진다 — V자나 컵처럼 시작이 곧 어깨인 모양이 안 잡힌다.
  if (out.length && out[0].i > from) {
    const firstIsLow = out[0].kind === "L";
    out.unshift({
      i: from,
      time: data[from].time,
      price: firstIsLow ? data[from].high : data[from].low,
      kind: firstIsLow ? "H" : "L",
    });
  }
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

/** 두 점 사이 변화율 (%) */
const move = (a: Pivot, b: Pivot) => (b.price / a.price - 1) * 100;
/** 봉당 변화율 (%) — 가파른 정도. 가격 수준이 달라도 같은 잣대가 된다 */
const steep = (a: Pivot, b: Pivot) => move(a, b) / Math.max(1, b.i - a.i);

/**
 * 바닥(또는 천장)이 둥근가 뾰족한가.
 * 극점에서 zone 만큼 떨어진 값 안에 머문 봉이 구간의 몇 할인지 돌려준다.
 * 컵은 오래 머물고(둥글다) V 자는 스쳐 지나간다(뾰족하다).
 */
function baseShare(
  data: Candle[],
  i0: number,
  i1: number,
  price: number,
  isLow: boolean,
  zone: number,
): number {
  const width = i1 - i0;
  if (width <= 0) return 0;
  const lvl = isLow ? price * (1 + zone) : price * (1 - zone);
  let n = 0;
  for (let i = i0; i <= i1; i++) {
    if (isLow ? data[i].low <= lvl : data[i].high >= lvl) n++;
  }
  return n / width;
}

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
    name = "박스권";
    bias = "neutral";
  }
  if (!name) return null;
  // 박스권은 잔물결만 있어도 모양이 맞아 버린다. 폭 기준을 따로 높인다
  if (name === "박스권" && Math.max(w0, w1) / mid < 0.035) return null;

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

/**
 * 깃발·페넌트 — 가파른 한 방향 움직임(깃대) 뒤에 붙는 짧은 숨고르기.
 * 깃발은 추세와 반대로 기운 평행 통로, 페넌트는 좁아지는 삼각형이다.
 * 둘 다 원래 가던 방향으로 이어진다고 본다.
 */
const flagPennant: Matcher = (ps, data) => {
  for (let s = ps.length - 6; s >= 0; s--) {
    const p0 = ps[s];
    const p1 = ps[s + 1];
    if (!p1) continue;
    const mv = move(p0, p1);
    // 깃대 — 짧은 기간에 크게 움직여야 한다
    if (Math.abs(mv) < 8 || Math.abs(steep(p0, p1)) < 0.5) continue;

    // 깃대 끝점은 숨고르기 계산에서 뺀다. 넣으면 깃대 바닥이 통로 아래쪽
    // 선을 끌어내려 기울기가 뒤틀리고, 평행한 통로가 벌어진 것처럼 보인다.
    const rest = ps.slice(s + 2);
    if (rest.length < 4) continue; // 숨고르기 스윙이 4개 이상
    const hs = rest.filter((p) => p.kind === "H");
    const ls = rest.filter((p) => p.kind === "L");
    if (hs.length < 2 || ls.length < 2) continue;
    const top = fit(hs);
    const bot = fit(ls);
    if (!top || !bot) continue;

    const i0 = rest[0].i;
    const i1 = rest[rest.length - 1].i;
    const w0 = at(top, i0) - at(bot, i0);
    const w1 = at(top, i1) - at(bot, i1);
    if (!(w0 > 0) || !(w1 > 0)) continue;
    const poleH = Math.abs(p1.price - p0.price);
    // 숨고르기가 깃대만큼 커지면 더 이상 깃발이 아니다
    if (Math.max(w0, w1) > poleH * 0.6) continue;
    // 깃대보다 오래 끌면 깃발이 아니라 새 추세다
    if (i1 - i0 > (p1.i - p0.i) * 3) continue;

    const mid = (at(top, i1) + at(bot, i1)) / 2;
    if (!(mid > 0)) continue;
    const sTop = (top.m / mid) * 100;
    const sBot = (bot.m / mid) * 100;
    const bull = mv > 0;
    const converge = w1 < w0 * 0.7;

    let name: string | null = null;
    if (converge) name = bull ? "상승 페넌트" : "하락 페넌트";
    else if (Math.abs(sTop - sBot) < 0.06) {
      // 깃발은 추세와 반대로 기운다
      if (bull && sTop < -0.015) name = "상승깃발";
      else if (!bull && sTop > 0.015) name = "하락깃발";
    }
    if (!name) continue;

    const end = Math.min(data.length - 1, i1);
    const lineAt = (l: { m: number; c: number }) => ({
      a: { time: data[i0].time, price: at(l, i0) },
      b: { time: data[end].time, price: at(l, end) },
    });
    return {
      name,
      bias: bull ? "bull" : "bear",
      points: [P(p0), P(p1)],
      lines: [lineAt(top), lineAt(bot)],
      // 목표는 깃대 길이만큼 더 간다고 본다
      target: bull ? at(top, end) + poleH : at(bot, end) - poleH,
      score: 0.68 + (converge ? 0.14 : 0.12),
      note: "깃대만큼 더 간다고 본다",
    };
  }
  return null;
};

/** 다이아몬드 — 흔들림이 커졌다가 다시 좁아지는 마름모 */
const diamond: Matcher = (ps) => {
  const use = ps.slice(-9);
  if (use.length < 7) return null;

  const amp: number[] = [];
  for (let i = 0; i + 1 < use.length; i++) amp.push(Math.abs(use[i + 1].price - use[i].price));
  const peak = amp.indexOf(Math.max(...amp));
  if (peak <= 0 || peak >= amp.length - 1) return null;
  // 앞에서는 커지고 뒤에서는 작아져야 마름모다
  for (let i = 1; i <= peak; i++) if (amp[i] < amp[i - 1] * 0.85) return null;
  for (let i = peak + 1; i < amp.length; i++) if (amp[i] > amp[i - 1] * 1.15) return null;
  // 넓어졌다 좁아지는 폭이 뚜렷해야 한다
  if (amp[peak] < amp[0] * 1.35 || amp[peak] < amp[amp.length - 1] * 1.35) return null;

  const hi = use.reduce((m, p) => (p.price > m.price ? p : m), use[0]);
  const lo = use.reduce((m, p) => (p.price < m.price ? p : m), use[0]);
  const height = hi.price - lo.price;
  if (!(height / lo.price > 0.05)) return null;

  // 꼭짓점이 구간 가운데 있어야 마름모로 보인다
  const left = use[0];
  const right = use[use.length - 1];
  const span = right.i - left.i;
  const midish = (p: Pivot) => Math.abs(p.i - (left.i + right.i) / 2) < span * 0.35;
  if (!midish(hi) && !midish(lo)) return null;

  // 고점이 가운데면 천장형(하락 반전), 저점이 가운데면 바닥형(상승 반전)
  const top = midish(hi);
  const seg = (a: Pivot, b: Pivot) => ({ a: P(a), b: P(b), extend: false });
  return {
    name: top ? "다이아몬드 천장" : "다이아몬드 바닥",
    bias: top ? "bear" : "bull",
    points: [],
    lines: [seg(left, hi), seg(hi, right), seg(right, lo), seg(lo, left)],
    target: top ? lo.price - height : hi.price + height,
    score: 0.62,
    note: "높이만큼 움직인다고 본다",
  };
};

/**
 * 컵앤핸들 — 둥근 바닥으로 회복한 뒤 테두리 아래에서 얕게 쉬어 가는 모양.
 * V 자와 갈리는 지점은 '바닥에 얼마나 머물렀나'다.
 */
const cupHandle: Matcher = (ps, data) => {
  for (let s = ps.length - 3; s >= 0; s--) {
    const [l, b, r] = ps.slice(s, s + 3);
    if (!r || l.kind !== "H" || b.kind !== "L" || r.kind !== "H") continue;
    // 양쪽 테두리 높이가 비슷해야 컵이다
    if (!near(l.price, r.price, 0.1)) continue;
    const rim = Math.min(l.price, r.price);
    const depth = (rim - b.price) / rim;
    if (depth < 0.12 || depth > 0.6) continue;
    const width = r.i - l.i;
    if (width < 15) continue; // 너무 짧으면 컵이라 부르기 어렵다
    // 둥근가 — 바닥권에 머문 봉이 폭의 4분의 1은 되어야 한다
    if (baseShare(data, l.i, r.i, b.price, true, depth * 0.3) < 0.25) continue;

    // 손잡이 — 오른쪽 테두리 뒤의 얕은 되돌림
    const after = ps.slice(s + 3);
    const h = after.find((p) => p.kind === "L");
    const hd = h ? (r.price - h.price) / r.price : NaN;
    const hasHandle = !!h && hd > 0 && hd <= depth / 3;

    return {
      name: hasHandle ? "컵앤핸들" : "컵형",
      bias: "bull",
      points: hasHandle ? [P(l), P(b), P(r), P(h!)] : [P(l), P(b), P(r)],
      lines: [{ a: P(l), b: P(r), dash: true }],
      target: r.price + (rim - b.price),
      score: hasHandle ? 0.84 : 0.58,
      note: hasHandle ? "테두리 돌파 시 상승 신호" : "손잡이를 기다리는 자리",
    };
  }
  return null;
};

/** V자 반등·V자 천장 — 가파르게 갔다가 곧바로 되돌아오는 뾰족한 반전 */
const vReversal: Matcher = (ps, data) => {
  for (let s = ps.length - 3; s >= 0; s--) {
    const [a, m, b] = ps.slice(s, s + 3);
    if (!b || m.kind === a.kind || a.kind !== b.kind) continue;
    const leg1 = Math.abs(move(a, m));
    const leg2 = Math.abs(move(m, b));
    if (leg1 < 10 || leg2 < 10) continue;
    // 양쪽 다 가팔라야 한다
    if (Math.abs(steep(a, m)) < 0.7 || Math.abs(steep(m, b)) < 0.7) continue;
    // 되돌린 정도가 비슷해야 V 자
    if (leg2 < leg1 * 0.6) continue;
    // 뾰족한가 — 극점 근처에 오래 머물면 그건 컵이다
    const bottom = m.kind === "L";
    if (baseShare(data, a.i, b.i, m.price, bottom, 0.03) > 0.2) continue;

    return {
      name: bottom ? "V자 반등" : "V자 천장",
      bias: bottom ? "bull" : "bear",
      points: [P(a), P(m), P(b)],
      lines: [{ a: P(a), b: P(b), dash: true }],
      target: bottom ? a.price : a.price,
      score: 0.6,
      note: bottom ? "직전 고점까지 되돌림 여지" : "직전 저점까지 되돌림 여지",
    };
  }
  return null;
};

const MATCHERS: Matcher[] = [
  headShoulders,
  tripleTB,
  doubleTB,
  cupHandle,
  diamond,
  flagPennant,
  vReversal,
  wedgeTriangle,
];

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

  // 되돌림 기준을 두 배율로 본다.
  // 굵게 보면 머리어깨·다이아몬드 같은 큰 모양이 잡히고, 잘게 보면 깃발·페넌트
  // 처럼 큰 움직임 뒤에 붙는 작은 조정이 잡힌다. 한 배율만 쓰면 둘 중 하나는
  // 원리상 못 본다 — 깃발의 조정폭은 깃대보다 훨씬 작기 때문이다.
  const dev = autoDev(data, from, to);
  const found: Pattern[] = [];
  for (const d of [dev, dev / 2.5]) {
    const ps = pivots(data, from, to, d);
    if (ps.length < 3) continue;
    for (const m of MATCHERS) {
      try {
        const r = m(ps, data);
        if (r && r.score >= 0.5) found.push(r);
      } catch {
        /* 한 패턴이 실패해도 나머지는 계속 찾는다 */
      }
    }
  }
  // 두 배율에서 같은 이름이 나오면 점수가 높은 쪽만 남긴다
  const best = new Map<string, Pattern>();
  for (const p of found) {
    const cur = best.get(p.name);
    if (!cur || p.score > cur.score) best.set(p.name, p);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, max);
}
