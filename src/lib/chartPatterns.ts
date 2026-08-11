// 차트 패턴 감지 — 보수적 엔진.
//
// 목표는 많이 찾는 것이 아니라 확실한 것만 중복 없이 찾는 것이다.
// 애매하면 감지하지 않는다. 한 번에 최대 하나만 보고한다.
//
// 감지 대상은 아래 여섯 갈래뿐이다. 목록에 없으면 감지하지 않는다.
//   헤드앤숄더(상단/하단) · 이중천장/이중바닥 · 삼각수렴(상승/하락/대칭)
//   컵앤핸들 · 깃발형/페넌트 · 박스권 돌파
//
// 통과해야 하는 공통 관문
//   1) 패턴 구간이 15봉 이상
//   2) 비교 대상 변곡점끼리 ±1.5% 안에서 수평
//   3) 넥라인·추세선을 '종가 기준'으로 뚜렷하게 이탈한 봉이 존재 (근접은 제외)
//   4) 돌파 봉 거래량이 구간 평균의 1.3배 이상이어야 '완성'
//   5) 확신도 85점 이상
import type { Candle } from "@/lib/types";

// ── 출력 형식 ────────────────────────────────────────────────

export interface KeyPoint {
  index: number;
  type: "고점" | "저점" | "넥라인";
  price: number;
}

export interface PatternReport {
  detected: true;
  pattern: string;
  direction: "상승" | "하락";
  confidence: number;
  key_points: KeyPoint[];
  breakout_index: number | null;
  status: "완성(돌파확인)" | "형성중(거래량조건 미충족)";
  reason_short: string;
}

export type DetectResult = { detected: false } | PatternReport;

/** 화면에 그리기 위한 기하 정보. 명세 JSON 에는 들어가지 않는다 */
export interface PatternRender {
  points: { time: number; price: number }[];
  lines: {
    a: { time: number; price: number };
    b: { time: number; price: number };
    dash?: boolean;
    extend?: boolean;
  }[];
  target?: number;
}

export interface Detection {
  report: PatternReport;
  render: PatternRender;
  /** 중복 판정용 — 패턴을 이루는 변곡점의 봉 번호 */
  anchor: number[];
}

/** 명세 그대로의 JSON. 그리기 정보는 빠진다 */
export const toJson = (d: Detection | null): DetectResult => (d ? d.report : { detected: false });

// ── 기준값 ───────────────────────────────────────────────────

const MIN_BARS = 15; // 패턴 최소 길이
const FLAT_TOL = 0.015; // 수평 판정 ±1.5%
const TOUCH_TOL = 0.01; // 추세선 접점 ±1%
const BREAK_BUF = 0.005; // 근접과 돌파를 가르는 여유 0.5%
const VOL_MIN = 1.3; // 돌파 거래량 배수
const MIN_CONF = 85; // 보고 하한

// ── 스윙 지점 ────────────────────────────────────────────────

export interface Pivot {
  i: number;
  time: number;
  price: number;
  kind: "H" | "L";
}

/** 지그재그 — 직전 극점에서 dev 만큼 되돌려야 그 극점을 확정한다 */
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
  out.push({ i: extI, time: data[extI].time, price: extP, kind: dir === "up" ? "H" : "L" });

  // 첫 극점도 넣는다. 지그재그는 방향이 한 번 꺾여야 확정하므로 시작점이 빠지는데,
  // 시작이 곧 어깨인 모양이 통째로 안 잡힌다.
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

/** 구간 변동폭에 맞춘 되돌림 기준 */
export function autoDev(data: Candle[], from: number, to: number): number {
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i <= to; i++) {
    if (data[i].high > hi) hi = data[i].high;
    if (data[i].low < lo) lo = data[i].low;
  }
  if (!(lo > 0) || !Number.isFinite(hi)) return 0.03;
  return Math.min(0.12, Math.max(0.012, (hi / lo - 1) / 8));
}

// ── 보조 ─────────────────────────────────────────────────────

/** 두 값의 상대 오차 */
const gap = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b);
const P = (p: Pivot) => ({ time: p.time, price: p.price });
const move = (a: Pivot, b: Pivot) => (b.price / a.price - 1) * 100;
const steep = (a: Pivot, b: Pivot) => move(a, b) / Math.max(1, b.i - a.i);

/** 최소제곱 직선 (x = 봉 번호) */
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

/** 추세선에 ±tol 안으로 닿은 점 수 */
const touches = (ps: Pivot[], l: { m: number; c: number }, tol: number) =>
  ps.filter((p) => gap(p.price, at(l, p.i)) <= tol).length;

/**
 * 바닥(천장)이 둥근가 뾰족한가 — 극점 근처에 머문 봉의 비율.
 * 컵은 오래 머물고 V 자는 스쳐 지나간다.
 */
function baseShare(
  data: Candle[],
  i0: number,
  i1: number,
  price: number,
  isLow: boolean,
  zone: number,
) {
  const width = i1 - i0;
  if (width <= 0) return 0;
  const lvl = isLow ? price * (1 + zone) : price * (1 - zone);
  let n = 0;
  for (let i = i0; i <= i1; i++) if (isLow ? data[i].low <= lvl : data[i].high >= lvl) n++;
  return n / width;
}

/**
 * 종가 기준 돌파 봉을 찾는다.
 * 선에 닿기만 한 것은 돌파가 아니므로 0.5% 여유를 둔다.
 */
function breakout(
  data: Candle[],
  line: (i: number) => number,
  from: number,
  to: number,
  dir: "up" | "down",
): number {
  for (let i = Math.max(0, from); i <= to; i++) {
    const lvl = line(i);
    if (!Number.isFinite(lvl) || lvl <= 0) continue;
    if (dir === "up" ? data[i].close > lvl * (1 + BREAK_BUF) : data[i].close < lvl * (1 - BREAK_BUF)) {
      return i;
    }
  }
  return -1;
}

/** 돌파 봉 거래량 ÷ 구간 평균 거래량 */
function volumeRatio(data: Candle[], i0: number, i1: number, bi: number): number {
  let sum = 0;
  let n = 0;
  for (let i = i0; i <= i1; i++) {
    if (i === bi) continue;
    sum += data[i].volume || 0;
    n++;
  }
  const avg = n ? sum / n : 0;
  if (!(avg > 0)) return 0;
  return (data[bi].volume || 0) / avg;
}

// ── 후보 ─────────────────────────────────────────────────────

/** 공통 관문을 통과하기 전의 패턴 후보 */
interface Cand {
  name: string;
  dir: "상승" | "하락";
  pts: Pivot[];
  keyPoints: KeyPoint[];
  /** 넥라인·추세선 */
  line: (i: number) => number;
  breakDir: "up" | "down";
  /** 돌파를 찾기 시작할 봉 */
  searchFrom: number;
  /** 수평 오차 (0 이면 완전 수평) */
  err: number;
  /** 그 패턴에 허용된 수평 오차 */
  tol: number;
  reason: string;
  render: PatternRender;
}

type Matcher = (ps: Pivot[], data: Candle[]) => Cand[];

/**
 * 후보 구간을 만든다.
 * 마지막 변곡점은 돌파 그 자체인 경우가 많다 — 그것까지 넣고 추세선을 맞추면
 * 박스 천장이나 삼각형 변이 돌파 쪽으로 끌려가 모양이 깨진다. 빼고도 본다.
 */
function* windows(ps: Pivot[], min = 5, max = 9): Generator<Pivot[]> {
  for (const drop of [0, 1]) {
    const end = ps.length - drop;
    for (let n = min; n <= Math.min(max, end); n++) yield ps.slice(end - n, end);
  }
}

// ── 1) 헤드앤숄더 ────────────────────────────────────────────

const headShoulders: Matcher = (ps) => {
  const out: Cand[] = [];
  for (let s = 0; s + 4 < ps.length; s++) {
    const [a, b, c, d, e] = ps.slice(s, s + 5);
    const top = a.kind === "H";
    if (!(c.kind === a.kind && e.kind === a.kind)) continue;
    if (b.kind === a.kind || d.kind === a.kind) continue;

    // 어깨·머리가 각각 3봉 이상 떨어져 있어야 한다
    if (c.i - a.i < 3 || e.i - c.i < 3) continue;
    // 머리가 양 어깨보다 2% 이상 튀어나와야 한다
    const headOut = top
      ? c.price >= a.price * 1.02 && c.price >= e.price * 1.02
      : c.price <= a.price * 0.98 && c.price <= e.price * 0.98;
    if (!headOut) continue;
    // 두 어깨가 ±1.5% 안에서 수평
    const err = gap(a.price, e.price);
    if (err > FLAT_TOL) continue;
    // 넥라인이 될 두 골도 수평에 가까워야 한다
    if (gap(b.price, d.price) > FLAT_TOL * 2) continue;

    const m = (d.price - b.price) / Math.max(1, d.i - b.i);
    const line = (i: number) => b.price + m * (i - b.i);
    const neck = (b.price + d.price) / 2;

    out.push({
      name: top ? "헤드앤숄더 상단" : "헤드앤숄더 하단",
      dir: top ? "하락" : "상승",
      pts: [a, b, c, d, e],
      keyPoints: [
        { index: a.i, type: top ? "고점" : "저점", price: a.price },
        { index: c.i, type: top ? "고점" : "저점", price: c.price },
        { index: e.i, type: top ? "고점" : "저점", price: e.price },
        { index: b.i, type: "넥라인", price: b.price },
        { index: d.i, type: "넥라인", price: d.price },
      ],
      line,
      breakDir: top ? "down" : "up",
      searchFrom: e.i,
      err,
      tol: FLAT_TOL,
      reason: top ? "양 어깨 수평, 머리 돌출 후 넥라인 이탈" : "역머리어깨 넥라인 돌파",
      render: {
        points: [a, b, c, d, e].map(P),
        lines: [{ a: P(b), b: P(d), dash: true }],
        target: top ? neck - (c.price - neck) : neck + (neck - c.price),
      },
    });
  }
  return out;
};

// ── 2) 이중천장 / 이중바닥 ───────────────────────────────────

const doubleTB: Matcher = (ps) => {
  const out: Cand[] = [];
  for (let s = 0; s + 2 < ps.length; s++) {
    const [a, b, c] = ps.slice(s, s + 3);
    if (a.kind !== c.kind || b.kind === a.kind) continue;
    const err = gap(a.price, c.price);
    if (err > FLAT_TOL) continue;
    // 두 극점 사이 골이 평균 대비 3% 이상 — 얕으면 그냥 횡보다
    const avg = (a.price + c.price) / 2;
    if (Math.abs(avg - b.price) / avg < 0.03) continue;
    // 바로 옆에 같은 높이의 극점이 또 있으면 되풀이되는 진동이다.
    // 그건 박스권이지 반전 신호인 이중천장/바닥이 아니다.
    const before = ps[s - 2];
    const after = ps[s + 4];
    if (before && before.kind === a.kind && gap(before.price, a.price) <= FLAT_TOL) continue;
    if (after && after.kind === c.kind && gap(after.price, c.price) <= FLAT_TOL) continue;

    const top = a.kind === "H";
    const line = () => b.price;
    out.push({
      name: top ? "이중천장" : "이중바닥",
      dir: top ? "하락" : "상승",
      pts: [a, b, c],
      keyPoints: [
        { index: a.i, type: top ? "고점" : "저점", price: a.price },
        { index: c.i, type: top ? "고점" : "저점", price: c.price },
        { index: b.i, type: "넥라인", price: b.price },
      ],
      line,
      breakDir: top ? "down" : "up",
      searchFrom: c.i,
      err,
      tol: FLAT_TOL,
      reason: top ? "두 고점 수평, 넥라인 이탈" : "두 저점 수평, 넥라인 돌파",
      render: {
        points: [a, b, c].map(P),
        lines: [
          { a: P(a), b: P(c) },
          { a: P(b), b: { time: c.time, price: b.price }, dash: true },
        ],
        target: top ? b.price - (avg - b.price) : b.price + (b.price - avg),
      },
    });
  }
  return out;
};

// ── 3) 삼각수렴 ──────────────────────────────────────────────

const triangle: Matcher = (ps, data) => {
  const out: Cand[] = [];
  for (const use of windows(ps)) {
    const hs = use.filter((p) => p.kind === "H");
    const ls = use.filter((p) => p.kind === "L");
    // 접점 고점 2개 + 저점 2개 이상
    if (hs.length < 2 || ls.length < 2) continue;
    const top = fit(hs);
    const bot = fit(ls);
    if (!top || !bot) continue;
    // 각 추세선에 ±1% 안으로 닿은 점이 2개 이상이어야 한다
    if (touches(hs, top, TOUCH_TOL) < 2 || touches(ls, bot, TOUCH_TOL) < 2) continue;

    const i0 = use[0].i;
    const i1 = use[use.length - 1].i;
    if (i1 - i0 < MIN_BARS) continue;
    const w0 = at(top, i0) - at(bot, i0);
    const w1 = at(top, i1) - at(bot, i1);
    if (!(w0 > 0) || !(w1 > 0) || w1 >= w0 * 0.75) continue; // 수렴해야 한다

    const mid = (at(top, i1) + at(bot, i1)) / 2;
    if (!(mid > 0)) continue;
    const sTop = (top.m / mid) * 100;
    const sBot = (bot.m / mid) * 100;
    const flat = 0.05;

    let name: string | null = null;
    let dir: "상승" | "하락" | null = null;
    let breakDir: "up" | "down" | null = null;
    if (Math.abs(sTop) < flat && sBot > flat) {
      name = "상승 삼각수렴";
      dir = "상승";
      breakDir = "up";
    } else if (Math.abs(sBot) < flat && sTop < -flat) {
      name = "하락 삼각수렴";
      dir = "하락";
      breakDir = "down";
    } else if (sTop < -flat && sBot > flat) {
      name = "대칭 삼각수렴";
    }
    if (!name) continue;

    // 대칭형은 먼저 뚫는 쪽을 따른다
    if (!breakDir) {
      const upAt = breakout(data, (i) => at(top, i), i1, data.length - 1, "up");
      const dnAt = breakout(data, (i) => at(bot, i), i1, data.length - 1, "down");
      if (upAt < 0 && dnAt < 0) continue;
      const upFirst = upAt >= 0 && (dnAt < 0 || upAt <= dnAt);
      breakDir = upFirst ? "up" : "down";
      dir = upFirst ? "상승" : "하락";
    }
    const lineFn = breakDir === "up" ? (i: number) => at(top, i) : (i: number) => at(bot, i);

    const errs = [
      ...hs.map((p) => gap(p.price, at(top, p.i))),
      ...ls.map((p) => gap(p.price, at(bot, p.i))),
    ];
    const err = errs.reduce((x, y) => x + y, 0) / errs.length;

    const end = Math.min(data.length - 1, i1);
    const seg = (l: { m: number; c: number }) => ({
      a: { time: data[i0].time, price: at(l, i0) },
      b: { time: data[end].time, price: at(l, end) },
    });
    out.push({
      name,
      dir: dir!,
      pts: use,
      keyPoints: [
        ...hs.map((p) => ({ index: p.i, type: "고점" as const, price: p.price })),
        ...ls.map((p) => ({ index: p.i, type: "저점" as const, price: p.price })),
      ],
      line: lineFn,
      breakDir,
      searchFrom: i1,
      err,
      tol: TOUCH_TOL,
      reason: "고저 접점이 추세선에 수렴 후 돌파",
      render: {
        points: [],
        lines: [seg(top), seg(bot)],
        target: breakDir === "up" ? at(top, end) + w0 : at(bot, end) - w0,
      },
    });
  }
  return out;
};

// ── 4) 컵앤핸들 ──────────────────────────────────────────────

const cupHandle: Matcher = (ps, data) => {
  const out: Cand[] = [];
  for (let s = 0; s + 3 < ps.length; s++) {
    const [l, b, r] = ps.slice(s, s + 3);
    if (l.kind !== "H" || b.kind !== "L" || r.kind !== "H") continue;
    // 양 테두리가 ±1.5% 안에서 수평
    const err = gap(l.price, r.price);
    if (err > FLAT_TOL) continue;
    // 컵은 20봉 이상
    if (r.i - l.i < 20) continue;

    const rim = Math.min(l.price, r.price);
    const rise = rim - b.price; // 컵 전체 상승폭
    if (!(rise > 0) || rise / rim < 0.12) continue;
    // U 자여야 한다 — 바닥권에 머문 봉이 폭의 4분의 1 이상 (V 자 배제)
    if (baseShare(data, l.i, r.i, b.price, true, (rise / rim) * 0.3) < 0.25) continue;

    // 핸들 — 되돌림이 컵 상승폭의 15~35%
    const h = ps.slice(s + 3).find((p) => p.kind === "L");
    if (!h) continue;
    const back = (r.price - h.price) / rise;
    if (back < 0.15 || back > 0.35) continue;

    out.push({
      name: "컵앤핸들",
      dir: "상승",
      pts: [l, b, r, h],
      keyPoints: [
        { index: l.i, type: "고점", price: l.price },
        { index: b.i, type: "저점", price: b.price },
        { index: r.i, type: "고점", price: r.price },
        { index: h.i, type: "저점", price: h.price },
      ],
      line: () => r.price, // 테두리가 돌파선
      breakDir: "up",
      searchFrom: h.i,
      err,
      tol: FLAT_TOL,
      reason: "U자 컵 후 얕은 핸들, 테두리 돌파",
      render: {
        points: [l, b, r, h].map(P),
        lines: [{ a: P(l), b: P(r), dash: true }],
        target: r.price + rise,
      },
    });
  }
  return out;
};

// ── 5) 깃발형 / 페넌트 ───────────────────────────────────────

const flagPennant: Matcher = (ps, data) => {
  const out: Cand[] = [];
  for (let s = 0; s + 5 < ps.length; s++) {
    const p0 = ps[s];
    const p1 = ps[s + 1];
    const mv = move(p0, p1);
    // 깃대 — 짧은 기간에 크게
    if (Math.abs(mv) < 8 || Math.abs(steep(p0, p1)) < 0.5) continue;

    // 깃대 끝점은 조정 계산에서 뺀다. 넣으면 깃대 바닥이 아래 선을 끌어내려
    // 평행한 통로가 벌어진 것처럼 보인다.
    const rest = ps.slice(s + 2);
    if (rest.length < 4) continue;
    const hs = rest.filter((p) => p.kind === "H");
    const ls = rest.filter((p) => p.kind === "L");
    if (hs.length < 2 || ls.length < 2) continue;
    const top = fit(hs);
    const bot = fit(ls);
    if (!top || !bot) continue;

    const i0 = rest[0].i;
    const i1 = rest[rest.length - 1].i;
    if (i1 - p0.i < MIN_BARS) continue;
    const w0 = at(top, i0) - at(bot, i0);
    const w1 = at(top, i1) - at(bot, i1);
    if (!(w0 > 0) || !(w1 > 0)) continue;
    const poleH = Math.abs(p1.price - p0.price);
    if (Math.max(w0, w1) > poleH * 0.6) continue; // 조정이 깃대만큼 커지면 깃발이 아니다
    if (i1 - i0 > (p1.i - p0.i) * 3) continue; // 너무 끌면 새 추세다

    const mid = (at(top, i1) + at(bot, i1)) / 2;
    if (!(mid > 0)) continue;
    const sTop = (top.m / mid) * 100;
    const sBot = (bot.m / mid) * 100;
    const bull = mv > 0;
    const converge = w1 < w0 * 0.7;

    let name: string | null = null;
    if (converge) name = "페넌트";
    else if (Math.abs(sTop - sBot) < 0.06) {
      // 깃발은 추세와 반대로 기운다
      if (bull && sTop < -0.015) name = "깃발형";
      else if (!bull && sTop > 0.015) name = "깃발형";
    }
    if (!name) continue;

    const breakDir = bull ? "up" : "down";
    const lineFn = bull ? (i: number) => at(top, i) : (i: number) => at(bot, i);
    const errs = [
      ...hs.map((p) => gap(p.price, at(top, p.i))),
      ...ls.map((p) => gap(p.price, at(bot, p.i))),
    ];
    const err = errs.reduce((x, y) => x + y, 0) / errs.length;

    const end = Math.min(data.length - 1, i1);
    const seg = (l: { m: number; c: number }) => ({
      a: { time: data[i0].time, price: at(l, i0) },
      b: { time: data[end].time, price: at(l, end) },
    });
    out.push({
      name,
      dir: bull ? "상승" : "하락",
      pts: [p0, p1, ...rest],
      keyPoints: [
        { index: p0.i, type: p0.kind === "H" ? "고점" : "저점", price: p0.price },
        { index: p1.i, type: p1.kind === "H" ? "고점" : "저점", price: p1.price },
        ...rest.map((p) => ({
          index: p.i,
          type: (p.kind === "H" ? "고점" : "저점") as "고점" | "저점",
          price: p.price,
        })),
      ],
      line: lineFn,
      breakDir,
      searchFrom: i1,
      err,
      tol: TOUCH_TOL,
      reason: converge ? "깃대 후 수렴, 추세방향 돌파" : "깃대 후 반대기울기 통로 돌파",
      render: {
        points: [P(p0), P(p1)],
        lines: [seg(top), seg(bot)],
        target: bull ? at(top, end) + poleH : at(bot, end) - poleH,
      },
    });
  }
  return out;
};

// ── 6) 박스권 돌파 ───────────────────────────────────────────

const boxBreak: Matcher = (ps, data) => {
  const out: Cand[] = [];
  for (const use of windows(ps)) {
    const hs = use.filter((p) => p.kind === "H");
    const ls = use.filter((p) => p.kind === "L");
    if (hs.length < 2 || ls.length < 2) continue;

    const hiAvg = hs.reduce((a, p) => a + p.price, 0) / hs.length;
    const loAvg = ls.reduce((a, p) => a + p.price, 0) / ls.length;
    // 천장끼리·바닥끼리 각각 ±1.5% 안에서 수평이어야 박스다
    const hiErr = Math.max(...hs.map((p) => gap(p.price, hiAvg)));
    const loErr = Math.max(...ls.map((p) => gap(p.price, loAvg)));
    if (hiErr > FLAT_TOL || loErr > FLAT_TOL) continue;
    // 박스가 너무 얇으면 잔물결이다
    const height = hiAvg - loAvg;
    if (!(height / loAvg >= 0.035)) continue;

    const i0 = use[0].i;
    const i1 = use[use.length - 1].i;
    if (i1 - i0 < MIN_BARS) continue;

    const upAt = breakout(data, () => hiAvg, i1, data.length - 1, "up");
    const dnAt = breakout(data, () => loAvg, i1, data.length - 1, "down");
    if (upAt < 0 && dnAt < 0) continue;
    const up = upAt >= 0 && (dnAt < 0 || upAt <= dnAt);

    out.push({
      name: "박스권 돌파",
      dir: up ? "상승" : "하락",
      pts: use,
      keyPoints: [
        ...hs.map((p) => ({ index: p.i, type: "고점" as const, price: p.price })),
        ...ls.map((p) => ({ index: p.i, type: "저점" as const, price: p.price })),
      ],
      line: () => (up ? hiAvg : loAvg),
      breakDir: up ? "up" : "down",
      searchFrom: i1,
      err: Math.max(hiErr, loErr),
      tol: FLAT_TOL,
      reason: "천장·바닥 수평 유지 후 이탈",
      render: {
        points: [],
        lines: [
          { a: { time: data[i0].time, price: hiAvg }, b: { time: data[i1].time, price: hiAvg } },
          { a: { time: data[i0].time, price: loAvg }, b: { time: data[i1].time, price: loAvg } },
        ],
        target: up ? hiAvg + height : loAvg - height,
      },
    });
  }
  return out;
};

const MATCHERS: Matcher[] = [headShoulders, doubleTB, triangle, cupHandle, flagPennant, boxBreak];

// ── 관문 통과 + 확신도 ───────────────────────────────────────

interface Scored extends Detection {
  span: [number, number];
}

/**
 * 후보에 공통 관문을 적용하고 확신도를 매긴다.
 * 하나라도 걸리면 버린다 — 애매한 것을 올려주지 않는다.
 */
function qualify(c: Cand, data: Candle[]): Scored | null {
  const idx = c.pts.map((p) => p.i);
  const i0 = Math.min(...idx);
  const i1 = Math.max(...idx);
  // 관문 1 — 15봉 이상
  if (i1 - i0 + 1 < MIN_BARS) return null;
  // 관문 2 — 수평 오차
  if (c.err > c.tol) return null;
  // 관문 3 — 종가 기준 돌파 봉이 존재해야 한다
  const bi = breakout(data, c.line, c.searchFrom, data.length - 1, c.breakDir);
  if (bi < 0) return null;

  // 관문 4 — 돌파 거래량
  const vr = volumeRatio(data, i0, i1, bi);
  const confirmed = vr >= VOL_MIN;

  let conf = 100;
  conf -= (c.err / c.tol) * 15; // 변곡점 오차가 클수록 감점
  if (confirmed) {
    // 겨우 넘긴 거래량은 감점. 2배를 넘으면 감점 없음
    conf -= Math.max(0, ((2 - Math.min(2, vr)) / 0.7) * 10);
  } else {
    conf -= 15; // 거래량 미확인
  }
  const bars = i1 - i0 + 1;
  if (bars < 25) conf -= (25 - bars) * 0.6; // 짧은 패턴은 신뢰가 덜하다

  return {
    report: {
      detected: true,
      pattern: c.name,
      direction: c.dir,
      confidence: Math.round(Math.max(0, Math.min(100, conf))),
      key_points: c.keyPoints,
      breakout_index: confirmed ? bi : null,
      status: confirmed ? "완성(돌파확인)" : "형성중(거래량조건 미충족)",
      reason_short: c.reason.slice(0, 30),
    },
    render: c.render,
    anchor: idx,
    span: [i0, i1],
  };
}

/** 두 후보가 같은 변곡점에서 나왔는가 */
function overlapRatio(a: number[], b: number[]): number {
  const setB = new Set(b);
  const shared = a.filter((x) => setB.has(x)).length;
  return shared / Math.max(1, Math.min(a.length, b.length));
}

// ── 진입점 ───────────────────────────────────────────────────

/**
 * 보이는 구간에서 패턴 하나를 찾는다.
 * 여러 후보가 조건을 만족하면 확신도가 가장 높은 하나만 남긴다.
 */
export function detectPattern(data: Candle[], from: number, to: number): Detection | null {
  if (!data.length || to - from < MIN_BARS) return null;
  // 구간이 거의 평평하면 무엇을 갖다 대도 맞는 것처럼 보인다
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i <= to; i++) {
    if (data[i].high > hi) hi = data[i].high;
    if (data[i].low < lo) lo = data[i].low;
  }
  if (!(lo > 0) || hi / lo - 1 < 0.012) return null;

  // 되돌림 기준을 두 배율로 본다. 굵게 보면 머리어깨 같은 큰 모양이,
  // 잘게 보면 깃발처럼 큰 움직임 뒤에 붙는 작은 조정이 잡힌다.
  const dev = autoDev(data, from, to);
  const cands: Cand[] = [];
  for (const d of [dev, dev / 2.5]) {
    const ps = pivots(data, from, to, d);
    if (ps.length < 3) continue;
    for (const m of MATCHERS) {
      try {
        cands.push(...m(ps, data));
      } catch {
        /* 한 패턴이 실패해도 나머지는 계속 본다 */
      }
    }
  }

  const scored = cands
    .map((c) => qualify(c, data))
    .filter((x): x is Scored => x !== null)
    .sort((a, b) => b.report.confidence - a.report.confidence);
  if (!scored.length) return null;

  // 같은 자리에서 여러 모양이 동시에 보이면 그만큼 덜 확실하다
  const best = scored[0];
  const rivals = scored
    .slice(1)
    .filter(
      (s) =>
        s.span[0] <= best.span[1] &&
        s.span[1] >= best.span[0] &&
        overlapRatio(s.anchor, best.anchor) < 0.8,
    );
  if (rivals.length) {
    best.report.confidence = Math.round(
      Math.max(0, best.report.confidence - Math.min(12, rivals.length * 4)),
    );
  }

  // 관문 5 — 확신도 85 미만은 보고하지 않는다
  return best.report.confidence >= MIN_CONF ? best : null;
}

// ── 재보고 억제 ──────────────────────────────────────────────
//
// 같은 패턴이 시작 봉만 한두 개 밀려 다시 잡히는 것은 새 사건이 아니다.
// 화면에 계속 그리는 것과는 별개로, 알림·신호로 '보고'할 때만 쓴다.

const lastAnchor = new Map<string, number[]>();

/** 이전 보고와 기준점이 80% 이상 겹치면 새 보고로 치지 않는다 */
export function isNewReport(key: string, d: Detection): boolean {
  const prev = lastAnchor.get(key);
  if (prev && overlapRatio(d.anchor, prev) >= 0.8) return false;
  lastAnchor.set(key, d.anchor);
  return true;
}

export const resetReports = (key?: string) => {
  if (key) lastAnchor.delete(key);
  else lastAnchor.clear();
};
