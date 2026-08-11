// 차트 그리기 도구 — 추세선 · 수평선 · 피보나치 되돌림.
//
// lightweight-charts 에는 그리기 도구가 없다. 차트 위에 투명 캔버스를 얹고,
// 차트의 좌표 변환(시간·가격 ↔ 픽셀)으로 직접 그린다. 확대·이동하면 차트가
// 알려주는 범위 변경 이벤트에 맞춰 다시 그려서 캔들에 붙어 다닌다.
//
// 저장 — 그림은 픽셀이 아니라 (봉 시각, 가격) 로 기억한다. 픽셀로 저장하면
// 확대·이동·재접속에서 전부 어긋난다. localStorage 에 종목·봉주기별로 남겨
// 화면을 나갔다 와도 유지된다.
import type { CandlestickData, IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/types";
import { detectPatterns, type Pattern } from "@/lib/chartPatterns";

type Pt = { time: number; price: number };
type Drawing =
  | { kind: "trend"; a: Pt; b: Pt }
  | { kind: "hline"; price: number }
  | { kind: "fib"; a: Pt; b: Pt };

type Tool = "trend" | "hline" | "fib" | "erase" | "move" | null;

/** 잡을 수 있는 부분 — 양 끝점이냐 선 전체냐 */
type Grab = { index: number; part: "a" | "b" | "body" };

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const load = (key: string): Drawing[] => {
  try {
    const raw = localStorage.getItem(`signo:draw:${key}`);
    return raw ? (JSON.parse(raw) as Drawing[]) : [];
  } catch {
    return [];
  }
};
const save = (key: string, ds: Drawing[]) => {
  try {
    if (ds.length) localStorage.setItem(`signo:draw:${key}`, JSON.stringify(ds));
    else localStorage.removeItem(`signo:draw:${key}`);
  } catch {
    /* 저장이 막혀도 그리기는 동작해야 한다 */
  }
};

/** 점-선분 거리 (지우개 판정용) */
function distSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const ICONS: Record<string, string> = {
  move:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18"/><path d="M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/></svg>',
  trend:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="1.6" fill="currentColor"/><circle cx="20" cy="4" r="1.6" fill="currentColor"/></svg>',
  hline:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
  fib:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="5" x2="21" y2="5"/><line x1="3" y1="10.5" x2="15" y2="10.5"/><line x1="3" y1="15" x2="18" y2="15"/><line x1="3" y1="19.5" x2="21" y2="19.5"/></svg>',
  erase:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H8.5l-4.2-4.2a2 2 0 0 1 0-2.8L13.5 3.8a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L12 19"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  pattern:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l4-6 3 3 4-8 3 5 4-3"/><circle cx="7" cy="11" r="1.3" fill="currentColor" stroke="none"/><circle cx="14" cy="6" r="1.3" fill="currentColor" stroke="none"/></svg>',
  clear:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
};

const TIP: Record<string, string> = {
  move: "이동 — 그려 둔 선을 끌어 옮긴다 (끝점을 잡으면 그 점만)",
  trend: "추세선 — 시작점, 끝점 두 번 클릭",
  hline: "수평선 — 가격 위치를 클릭",
  fib: "피보나치 되돌림 — 고점과 저점을 두 번 클릭",
  erase: "지우개 — 지울 선을 클릭",
  clear: "모두 지우기",
  pattern: "패턴 자동 탐지 — 화면에 보이는 캔들에서 찾는다",
};

export function attachDraw(opts: {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  container: HTMLElement;
  data: Candle[];
  storageKey: string;
  precision: number;
  dark: boolean;
}): () => void {
  const { chart, series, container, data, storageKey, precision, dark } = opts;
  if (!data.length) return () => {};

  const ts = chart.timeScale();
  let drawings = load(storageKey);
  let tool: Tool = null;
  let pending: Pt | null = null; // 두 점짜리 도구의 첫 점
  let hover: { x: number; y: number } | null = null;
  let highlight = -1; // 마우스가 올라간 그림 — 잡을 수 있다는 표시로 손잡이를 띄운다

  // ── 색 ──
  const cTrend = "#F2A93B";
  const cHline = dark ? "#b18cff" : "#8250df";
  const cFib = dark ? "#5fb3a1" : "#2E8B74";
  const cFibFaint = dark ? "rgba(95,179,161,.10)" : "rgba(46,139,116,.07)";

  // ── 캔버스 ──
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:3;";
  container.appendChild(canvas);

  // ── 도구막대 ──
  const bar = document.createElement("div");
  bar.style.cssText = "position:absolute;left:6px;top:6px;z-index:4;display:flex;flex-direction:column;gap:4px;";
  const btns = new Map<string, HTMLButtonElement>();
  const mkBtn = (id: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = ICONS[id];
    b.title = TIP[id];
    b.style.cssText =
      "display:grid;place-items:center;width:26px;height:26px;border-radius:8px;cursor:pointer;" +
      `border:1px solid ${dark ? "rgba(255,255,255,.14)" : "rgba(20,22,60,.14)"};` +
      `background:${dark ? "rgba(30,32,54,.92)" : "rgba(255,255,255,.92)"};` +
      `color:${dark ? "#9aa0b4" : "#6b7086"};`;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    bar.appendChild(b);
    btns.set(id, b);
    return b;
  };
  const setTool = (next: Tool) => {
    tool = tool === next ? null : next;
    pending = null;
    hover = null;
    canvas.style.pointerEvents = tool ? "auto" : "none";
    canvas.style.cursor =
      tool === "erase" ? "pointer" : tool === "move" ? "grab" : tool ? "crosshair" : "default";
    for (const [id, b] of btns) {
      if (id === "pattern") continue; // 패턴은 도구가 아니라 켜고 끄는 표시라 따로 관리
      paint(b, id === tool);
    }
    redraw();
  };
  const paint = (b: HTMLButtonElement, on: boolean) => {
    b.style.color = on ? "#fff" : dark ? "#9aa0b4" : "#6b7086";
    b.style.background = on ? "#3844BE" : dark ? "rgba(30,32,54,.92)" : "rgba(255,255,255,.92)";
    b.style.borderColor = on ? "#3844BE" : dark ? "rgba(255,255,255,.14)" : "rgba(20,22,60,.14)";
  };
  mkBtn("move", () => setTool("move"));
  mkBtn("trend", () => setTool("trend"));
  mkBtn("hline", () => setTool("hline"));
  mkBtn("fib", () => setTool("fib"));
  mkBtn("erase", () => setTool("erase"));
  mkBtn("clear", () => {
    drawings = [];
    save(storageKey, drawings);
    setTool(null);
  });
  // 패턴 표시는 차트마다가 아니라 사람마다의 취향이라 한 번 켜면 어디서나 켜진다
  let showPatterns = (() => {
    try {
      return localStorage.getItem("signo:draw:patterns") === "1";
    } catch {
      return false;
    }
  })();
  let patterns: Pattern[] = [];
  const patBtn = mkBtn("pattern", () => {
    showPatterns = !showPatterns;
    try {
      localStorage.setItem("signo:draw:patterns", showPatterns ? "1" : "0");
    } catch {
      /* 저장이 막혀도 이번 화면에서는 동작한다 */
    }
    paint(patBtn, showPatterns);
    findPatterns();
  });
  container.appendChild(bar);

  // ── 좌표 변환 ──
  // 시간 → x: 봉 번호를 이진탐색으로 찾아 logical 좌표로 푼다.
  // timeToCoordinate 는 화면 밖이나 데이터에 없는 시각에서 null 을 주는 일이
  // 있어, 봉 번호 기반이 확대·이동 중에도 안정적이다.
  const idxOf = (time: number): number => {
    let lo = 0;
    let hi = data.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (data[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    // 정확히 없으면 가까운 쪽 (분봉이 갱신되어 시각이 밀린 경우)
    if (lo > 0 && Math.abs(data[lo - 1].time - time) < Math.abs(data[lo].time - time)) return lo - 1;
    return lo;
  };
  const xOf = (time: number): number | null => ts.logicalToCoordinate(idxOf(time) as never);
  const yOf = (price: number): number | null => series.priceToCoordinate(price);

  const priceText = (v: number) =>
    v.toLocaleString("ko-KR", { minimumFractionDigits: precision, maximumFractionDigits: precision });

  // ── 그리기 ──
  const paneHeight = (): number => {
    try {
      const h = chart.panes()[0]?.getHeight();
      if (h && h > 0) return h;
    } catch {
      /* 구버전 호환 */
    }
    return container.clientHeight;
  };

  const label = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
  ) => {
    ctx.font = "10px monospace";
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y - 7, w, 14, 3);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x + 4, y + 3.5);
  };

  function drawOne(ctx: CanvasRenderingContext2D, d: Drawing, W: number) {
    if (d.kind === "hline") {
      const y = yOf(d.price);
      if (y == null) return;
      ctx.strokeStyle = cHline;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      label(ctx, priceText(d.price), 34, y, cHline);
      return;
    }
    const x1 = xOf(d.a.time);
    const y1 = yOf(d.a.price);
    const x2 = xOf(d.b.time);
    const y2 = yOf(d.b.price);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return;

    if (d.kind === "trend") {
      ctx.strokeStyle = cTrend;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // 기울기를 이어 오른쪽 끝까지 점선 연장 — 앞으로의 경로를 가늠하는 용도
      if (x2 !== x1) {
        const slope = (y2 - y1) / (x2 - x1);
        const [fx, fy] = x2 > x1 ? [x2, y2] : [x1, y1];
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(W, fy + slope * (W - fx));
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      for (const [px, py] of [
        [x1, y1],
        [x2, y2],
      ] as const) {
        ctx.fillStyle = cTrend;
        ctx.beginPath();
        ctx.arc(px, py, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // fib — 두 가격 사이를 되돌림 수준으로 나눈다. 왼쪽 점부터 오른쪽 끝까지 긋는다
    const left = Math.min(x1, x2);
    const hiP = Math.max(d.a.price, d.b.price);
    const loP = Math.min(d.a.price, d.b.price);
    // 0% 가 시작(두 번째 클릭 쪽), 100% 가 기준(첫 클릭 쪽)이 되도록 b→a 방향
    const range = d.b.price - d.a.price;
    let prevY: number | null = null;
    for (const lv of FIB_LEVELS) {
      const price = d.b.price - range * lv;
      const y = yOf(price);
      if (y == null) continue;
      if (prevY != null) {
        ctx.fillStyle = cFibFaint;
        ctx.fillRect(left, Math.min(prevY, y), W - left, Math.abs(y - prevY));
      }
      ctx.strokeStyle = cFib;
      ctx.lineWidth = lv === 0 || lv === 1 ? 1.3 : 0.8;
      ctx.setLineDash(lv === 0.5 ? [3, 3] : []);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, `${(lv * 100).toFixed(1)}%  ${priceText(price)}`, left + 2, y, cFib);
      prevY = y;
    }
    void hiP;
    void loP;
  }

  /** 잡을 수 있다는 표시 — 끝점에 흰 테두리 손잡이를 띄운다 */
  function handles(ctx: CanvasRenderingContext2D, d: Drawing, W: number) {
    const pts: [number | null, number | null][] =
      d.kind === "hline"
        ? [[W / 2, yOf(d.price)]]
        : [
            [xOf(d.a.time), yOf(d.a.price)],
            [xOf(d.b.time), yOf(d.b.price)],
          ];
    for (const [x, y] of pts) {
      if (x == null || y == null) continue;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#3844BE";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ── 패턴 ──

  const cBull = dark ? "#ff8f8f" : "#E23D3D";
  const cBear = dark ? "#7fbcff" : "#2E77C9";
  const cFlat = dark ? "#9aa0b4" : "#6b7086";
  const biasColor = (b: Pattern["bias"]) => (b === "bull" ? cBull : b === "bear" ? cBear : cFlat);

  /**
   * 보이는 구간이 바뀔 때마다 다시 찾는다. 스크롤 중에 매 프레임 돌리면
   * 무거우니 잠깐 멈춘 뒤에 계산한다.
   */
  let findTimer: ReturnType<typeof setTimeout> | null = null;
  function findPatterns() {
    if (findTimer) clearTimeout(findTimer);
    if (!showPatterns) {
      patterns = [];
      redraw();
      return;
    }
    findTimer = setTimeout(() => {
      const r = ts.getVisibleLogicalRange();
      const from = Math.max(0, Math.floor(r?.from ?? 0));
      const to = Math.min(data.length - 1, Math.ceil(r?.to ?? data.length - 1));
      patterns = to > from ? detectPatterns(data, from, to) : [];
      redraw();
    }, 120);
  }

  function drawPattern(ctx: CanvasRenderingContext2D, p: Pattern, W: number, slot: number) {
    const color = biasColor(p.bias);
    ctx.save();

    // 골격선 — 꼭짓점을 차례로 잇는다
    const pts = p.points
      .map((q) => [xOf(q.time), yOf(q.price)] as const)
      .filter((q): q is readonly [number, number] => q[0] != null && q[1] != null);
    if (pts.length >= 2) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      for (const [x, y] of pts) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 기준선 — 오른쪽 끝까지 연장해 어디서 이탈·돌파하는지 보이게
    for (const ln of p.lines ?? []) {
      const x1 = xOf(ln.a.time), y1 = yOf(ln.a.price);
      const x2 = xOf(ln.b.time), y2 = yOf(ln.b.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.85;
      ctx.setLineDash(ln.dash ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      if (x2 !== x1) {
        const slope = (y2 - y1) / (x2 - x1);
        ctx.lineTo(W, y1 + slope * (W - x1));
      } else ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 목표가
    if (p.target != null) {
      const y = yOf(p.target);
      if (y != null && y > 0 && y < paneHeight()) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        label(ctx, `목표 ${priceText(p.target)}`, W - 108, y, color);
      }
    }

    // 이름표 — 오른쪽 위에 쌓는다
    ctx.globalAlpha = 1;
    ctx.font = "11px monospace";
    const arrow = p.bias === "bull" ? "▲" : p.bias === "bear" ? "▼" : "◆";
    const text = `${arrow} ${p.name}`;
    const w = ctx.measureText(text).width + 12;
    const bx = W - w - 6;
    const by = 8 + slot * 22;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, 17, 4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(text, bx + 6, by + 12);
    ctx.restore();
  }

  function redraw() {
    const W = ts.width();
    const H = paneHeight();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 자동 탐지 패턴을 먼저 깔고 그 위에 사용자가 그린 것을 올린다
    patterns.forEach((p, i) => drawPattern(ctx, p, W, i));
    drawings.forEach((d, i) => {
      drawOne(ctx, d, W);
      if (i === highlight) handles(ctx, d, W);
    });
    // 첫 점을 찍고 움직이는 중이면 미리보기
    if (pending && hover && (tool === "trend" || tool === "fib")) {
      const cur = ptAt(hover.x, hover.y);
      if (cur) {
        ctx.globalAlpha = 0.7;
        drawOne(ctx, { kind: tool, a: pending, b: cur } as Drawing, W);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** 픽셀 → (봉 시각, 가격). 봉 중심에 스냅한다 */
  function ptAt(x: number, y: number): Pt | null {
    const logical = ts.coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (logical == null || price == null) return null;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(logical as number)));
    return { time: data[idx].time, price: price as number };
  }

  // ── 잡기 판정 ──

  /** 끝점 판정 — 먼저 걸리면 그 점만 움직인다 */
  function grabEnd(d: Drawing, x: number, y: number): "a" | "b" | null {
    if (d.kind === "hline") return null;
    const pts: [("a" | "b"), number | null, number | null][] = [
      ["a", xOf(d.a.time), yOf(d.a.price)],
      ["b", xOf(d.b.time), yOf(d.b.price)],
    ];
    for (const [part, px, py] of pts) {
      if (px != null && py != null && Math.hypot(x - px, y - py) <= 9) return part;
    }
    return null;
  }

  /** 선 전체 판정 — 8px 안에 걸리는 가장 가까운 그림 */
  function hitTest(x: number, y: number): number {
    const W = ts.width();
    let best = -1;
    let bestD = 8;
    drawings.forEach((d, i) => {
      let dist = Infinity;
      if (d.kind === "hline") {
        const yy = yOf(d.price);
        if (yy != null) dist = Math.abs(y - yy);
      } else if (d.kind === "trend") {
        const x1 = xOf(d.a.time), y1 = yOf(d.a.price), x2 = xOf(d.b.time), y2 = yOf(d.b.price);
        if (x1 != null && y1 != null && x2 != null && y2 != null) {
          dist = distSeg(x, y, x1, y1, x2, y2);
          // 연장 구간도 잡을 수 있게
          if (x2 !== x1) {
            const slope = (y2 - y1) / (x2 - x1);
            const [fx, fy] = x2 > x1 ? [x2, y2] : [x1, y1];
            dist = Math.min(dist, distSeg(x, y, fx, fy, W, fy + slope * (W - fx)));
          }
        }
      } else {
        const x1 = xOf(d.a.time), x2 = xOf(d.b.time);
        const left = x1 != null && x2 != null ? Math.min(x1, x2) : 0;
        const range = d.b.price - d.a.price;
        for (const lv of FIB_LEVELS) {
          const yy = yOf(d.b.price - range * lv);
          if (yy != null && x >= left) dist = Math.min(dist, Math.abs(y - yy));
        }
      }
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    });
    return best;
  }

  /** 이 지점에서 무엇을 잡을 수 있나 */
  function grabAt(x: number, y: number): Grab | null {
    // 끝점이 우선 — 선 위에 겹쳐 있어도 점을 집으려는 의도로 본다
    for (let i = drawings.length - 1; i >= 0; i--) {
      const part = grabEnd(drawings[i], x, y);
      if (part) return { index: i, part };
    }
    const i = hitTest(x, y);
    return i >= 0 ? { index: i, part: "body" } : null;
  }

  // ── 입력 ──

  let drag: (Grab & { last: Pt }) | null = null;

  const xy = (e: MouseEvent | PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /**
   * 도구를 고르지 않았을 때도 선 위에 오면 잡을 수 있어야 한다.
   * 그런데 캔버스가 입력을 계속 가로채면 차트를 못 움직인다.
   * 그래서 선 근처에 있을 때만 캔버스가 입력을 받고, 벗어나면 통과시킨다.
   * (터치에는 마우스오버가 없으므로 '이동' 도구를 눌러 쓰면 된다)
   */
  const updateGrabbable = (x: number, y: number) => {
    if (tool) return; // 도구를 고른 상태에서는 그 도구가 주인
    const g = grabAt(x, y);
    canvas.style.pointerEvents = g ? "auto" : "none";
    canvas.style.cursor = g ? (g.part === "body" ? "move" : "grab") : "default";
    if ((g?.index ?? -1) !== highlight) {
      highlight = g?.index ?? -1;
      redraw();
    }
  };

  const onContainerMove = (e: MouseEvent) => {
    if (drag) return;
    const { x, y } = xy(e);
    updateGrabbable(x, y);
  };

  const onDown = (e: PointerEvent) => {
    if (tool && tool !== "move") return; // 그리기 도구는 click 으로 처리
    const { x, y } = xy(e);
    const g = grabAt(x, y);
    if (!g) return;
    const p = ptAt(x, y);
    if (!p) return;
    drag = { ...g, last: p };
    highlight = g.index;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
    e.preventDefault();
    e.stopPropagation();
  };

  const onDragMove = (e: PointerEvent) => {
    if (!drag) return;
    const { x, y } = xy(e);
    const p = ptAt(x, y);
    if (!p) return;
    const d = drawings[drag.index];
    if (!d) return;

    if (d.kind === "hline") {
      d.price = p.price;
    } else if (drag.part === "a") {
      d.a = p;
    } else if (drag.part === "b") {
      d.b = p;
    } else {
      // 전체 이동 — 마지막 위치에서 움직인 만큼 두 점을 같이 민다.
      // 시간은 봉 번호 차이로 밀어야 봉 간격이 일정하지 않아도 어긋나지 않는다
      const di = idxOf(p.time) - idxOf(drag.last.time);
      const dp = p.price - drag.last.price;
      const shift = (q: Pt): Pt => {
        const j = Math.max(0, Math.min(data.length - 1, idxOf(q.time) + di));
        return { time: data[j].time, price: q.price + dp };
      };
      d.a = shift(d.a);
      d.b = shift(d.b);
    }
    drag.last = p;
    redraw();
    e.preventDefault();
  };

  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    save(storageKey, drawings);
    drag = null;
    canvas.releasePointerCapture?.(e.pointerId);
    const { x, y } = xy(e);
    if (tool === "move") canvas.style.cursor = "grab";
    else updateGrabbable(x, y);
  };

  const onClick = (e: MouseEvent) => {
    if (!tool || tool === "move") return;
    const { x, y } = xy(e);

    if (tool === "erase") {
      const hit = hitTest(x, y);
      if (hit >= 0) {
        drawings.splice(hit, 1);
        highlight = -1;
        save(storageKey, drawings);
        redraw();
      }
      return;
    }
    const p = ptAt(x, y);
    if (!p) return;
    if (tool === "hline") {
      drawings.push({ kind: "hline", price: p.price });
      save(storageKey, drawings);
      setTool(null);
      return;
    }
    if (!pending) {
      pending = p;
      redraw();
      return;
    }
    drawings.push({ kind: tool, a: pending, b: p } as Drawing);
    save(storageKey, drawings);
    setTool(null); // 하나 그리면 선택 모드로 — 연달아 그리려면 다시 누른다
  };

  const onMove = (e: MouseEvent) => {
    if (!tool || tool === "move") return;
    hover = xy(e);
    if (pending) redraw();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (drag) {
      drag = null;
      redraw();
    } else if (tool) setTool(null);
  };

  canvas.addEventListener("click", onClick);
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onDragMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  container.addEventListener("mousemove", onContainerMove);
  window.addEventListener("keydown", onKey);

  // 확대·이동·크기 변경마다 다시 그린다. 패턴은 보이는 구간이 달라졌으니 다시 찾는다
  const onRange = () => {
    redraw();
    findPatterns();
  };
  ts.subscribeVisibleLogicalRangeChange(onRange);
  const ro = new ResizeObserver(() => redraw());
  ro.observe(container);
  paint(patBtn, showPatterns);
  redraw();
  findPatterns();

  return () => {
    if (findTimer) clearTimeout(findTimer);
    ts.unsubscribeVisibleLogicalRangeChange(onRange);
    ro.disconnect();
    container.removeEventListener("mousemove", onContainerMove);
    window.removeEventListener("keydown", onKey);
    canvas.remove();
    bar.remove();
  };
}

export type { CandlestickData, Time, UTCTimestamp };
