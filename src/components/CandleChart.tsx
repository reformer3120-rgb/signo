"use client";
import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  PriceScaleMode,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/types";
import { sma, rsi, macd, MA_PERIODS, MA_COLORS } from "@/lib/indicators";

export interface Indicators {
  ma?: boolean;
  rsi?: boolean;
  macd?: boolean;
}

const t = (n: number) => n as UTCTimestamp;

/** 차트 캔버스에 쓸 글꼴 — CSS 변수를 실제 글꼴 이름으로 풀어서 돌려준다 */
function chartFont(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-space-mono").trim();
  return v ? `${v}, monospace` : "monospace";
}

/**
 * 사용자가 확대·이동해 둔 화면 범위를 기억한다.
 * 차트는 시세가 갱신될 때마다 새로 그려지고 화면을 옮기면 아예 사라지므로,
 * 저장해 두지 않으면 맞춰 둔 구간이 매번 처음으로 되돌아간다.
 * 창을 닫으면 지워지는 저장소(sessionStorage)를 쓴다.
 */
interface SavedView {
  from: number;
  to: number;
  len: number; // 저장 당시 봉 개수 — 새 봉이 붙었는지 판단용
}

function loadView(key?: string): SavedView | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(`signo:view:${key}`);
    return raw ? (JSON.parse(raw) as SavedView) : null;
  } catch {
    return null;
  }
}

function saveView(key: string, v: SavedView) {
  try {
    sessionStorage.setItem(`signo:view:${key}`, JSON.stringify(v));
  } catch {
    /* 저장공간이 막혀 있어도 차트는 그대로 동작해야 한다 */
  }
}

export function CandleChart({
  data,
  height = 440,
  indicators,
  session,
  precision = 2,
  viewKey,
  fitHeight,
}: {
  data: Candle[];
  height?: number;
  indicators?: Indicators;
  session?: boolean;
  precision?: number;
  /** 확대·이동 상태를 기억할 식별자 (종목·봉주기별로 따로 기억) */
  viewKey?: string;
  /**
   * 전체 높이를 이 값에 맞춘다 (보조 패널 포함).
   * 차트를 화면에 고정할 때 카드가 화면보다 커지지 않게 하려고 쓴다.
   */
  fitHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const ma = !!indicators?.ma;
  const showRsi = !!indicators?.rsi;
  const showMacd = !!indicators?.macd;

  const extraPanes = (showRsi ? 1 : 0) + (showMacd ? 1 : 0);
  // fitHeight 를 주면 보조 패널까지 그 안에 나눠 담는다 (패널 비율은 아래 stretchFactor)
  const totalH = fitHeight ? Math.max(240, fitHeight) : height + extraPanes * 130;

  const last = data[data.length - 1];
  const key = [
    totalH,
    ma,
    showRsi,
    showMacd,
    !!session,
    precision,
    fitHeight ?? 0,
    data.length,
    data[0]?.time ?? 0,
    last?.time ?? 0,
    last?.close ?? 0,
  ].join("|");

  useEffect(() => {
    if (!ref.current) return;
    const dark = document.documentElement.classList.contains("dark");
    const UP = dark ? "#ff6b6b" : "#E23D3D";
    const DOWN = dark ? "#63a8f5" : "#2E77C9";
    const volUp = dark ? "rgba(255,107,107,.5)" : "rgba(226,61,61,.45)";
    const volDown = dark ? "rgba(99,168,245,.5)" : "rgba(46,119,201,.45)";
    const text = dark ? "#edeef7" : "#15162A";
    const grid = dark ? "rgba(255,255,255,0.06)" : "rgba(20,22,60,0.06)";

    const chart = createChart(ref.current, {
      height: totalH,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        // 캔버스는 CSS 변수를 읽지 못한다. var(...) 를 그대로 넘기면 폰트 지정이
        // 통째로 무시되고 비례폭 기본 글꼴로 그려져, H·C·L 라벨 상자 크기가
        // 글자마다 달라졌다(H가 가장 넓음). 실제 글꼴 이름으로 풀어서 넘긴다.
        fontFamily: chartFont(),
        attributionLogo: false,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      // 가격축 하단을 거래량 오버레이 몫으로 항상 비워둬 확대/축소·타임프레임 전환 시에도 캔들-거래량 겹침 방지
      // 가격축은 로그 눈금. 같은 등락률이 같은 높이로 보여서 장기 구간의
      // 오름폭·내림폭을 눈으로 견줄 수 있다.
      // 거래량은 별도 축(vol)이고 RSI·MACD 는 다른 패널이라 영향받지 않는다.
      rightPriceScale: {
        borderColor: "transparent",
        mode: PriceScaleMode.Logarithmic,
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: { borderColor: "transparent", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      // 세션 라인(현재가) 표시 시 캔들 기본 현재가 라벨/라인 숨김 (중복 제거)
      lastValueVisible: !session,
      priceLineVisible: !session,
      priceFormat: {
        type: "price",
        precision,
        minMove: precision === 0 ? 1 : 1 / Math.pow(10, precision),
      },
    });
    candle.setData(
      data.map((d) => ({ time: t(d.time), open: d.open, high: d.high, low: d.low, close: d.close })),
    );

    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(
      data.map((d) => ({ time: t(d.time), value: d.volume, color: d.close >= d.open ? volUp : volDown })),
    );

    // 장중 고가/저가 라인 (당일 봉들의 max/min)
    if (session && last) {
      const d0 = new Date(last.time * 1000);
      const sameDay = (u: number) => {
        const x = new Date(u * 1000);
        return x.getUTCFullYear() === d0.getUTCFullYear() && x.getUTCMonth() === d0.getUTCMonth() && x.getUTCDate() === d0.getUTCDate();
      };
      const today = data.filter((c) => sameDay(c.time));
      if (today.length) {
        const hi = Math.max(...today.map((c) => c.high));
        const lo = Math.min(...today.map((c) => c.low));
        // 우측 축 가격 라벨을 라인 색과 동일한 배지로 표시 (H 고점 / L 저점 / C 현재가) → 라인과 타이틀이 한 세트로 보이게
        const axisText = "#fff";
        candle.createPriceLine({
          price: hi, color: UP, lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: "H", axisLabelColor: UP, axisLabelTextColor: axisText,
        });
        candle.createPriceLine({
          price: lo, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: "L", axisLabelColor: DOWN, axisLabelTextColor: axisText,
        });
        candle.createPriceLine({
          price: last.close, color: "#F2A93B", lineWidth: 1, lineStyle: LineStyle.Solid,
          axisLabelVisible: true, title: "C", axisLabelColor: "#F2A93B", axisLabelTextColor: axisText,
        });
      }
    }

    // 이동평균선 (가격 패널 오버레이)
    if (ma) {
      for (const p of MA_PERIODS) {
        const s = chart.addSeries(
          LineSeries,
          { color: MA_COLORS[p], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
          0,
        );
        s.setData(sma(data, p).map((x) => ({ time: t(x.time), value: x.value })));
      }
    }

    let pane = 1;
    // RSI
    if (showRsi) {
      const p = pane++;
      const r = chart.addSeries(LineSeries, { color: "#8250df", lineWidth: 2, priceLineVisible: false }, p);
      r.setData(rsi(data).map((x) => ({ time: t(x.time), value: x.value })));
      r.createPriceLine({ price: 70, color: "rgba(226,61,61,.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
      r.createPriceLine({ price: 30, color: "rgba(46,119,201,.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
    }
    // MACD
    if (showMacd) {
      const p = pane++;
      const m = macd(data, UP, DOWN);
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false }, p);
      h.setData(m.hist.map((x) => ({ time: t(x.time), value: x.value, color: x.color })));
      const ml = chart.addSeries(LineSeries, { color: "#F2A93B", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, p);
      ml.setData(m.macd.map((x) => ({ time: t(x.time), value: x.value })));
      const sl = chart.addSeries(LineSeries, { color: "#9AA0E4", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, p);
      sl.setData(m.signal.map((x) => ({ time: t(x.time), value: x.value })));
    }

    const panes = chart.panes();
    panes[0]?.setStretchFactor(showRsi || showMacd ? 3 : 1);
    for (let i = 1; i < panes.length; i++) panes[i]?.setStretchFactor(1);

    // 화면에 보이는 구간의 최고점·최저점을 그 캔들 위·아래에 표시한다.
    // 전체 구간이 아니라 '보이는 만큼'을 기준으로 삼는 이유는, 확대해서 최근
    // 흐름만 보고 있는데 1년 전 저점을 가리키면 지금 판단에 쓸 수 없기 때문이다.
    // 확대·이동할 때마다 다시 계산한다.
    const markers = createSeriesMarkers(candle, []);
    const priceText = (v: number) =>
      v.toLocaleString("ko-KR", {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      });
    const rateText = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

    const updateMarkers = () => {
      if (!last || data.length < 2) return;
      const r = chart.timeScale().getVisibleLogicalRange();
      // 화면 범위를 봉 번호로 바꾼다 (범위를 못 얻으면 전체)
      const from = Math.max(0, Math.floor(r?.from ?? 0));
      const to = Math.min(data.length - 1, Math.ceil(r?.to ?? data.length - 1));
      if (to <= from) return;
      // 고점을 먼저 찾고, 저점은 '고점 이후'에서만 찾는다.
      // 그냥 구간 최저를 잡으면 고점보다 앞선 과거 저점이 걸려서
      // (분봉에서 나흘 전 저점이 잡히는 식) 지금 흐름과 이어지지 않는다.
      // 고점 → 저점 → 현재가 가 한 줄기로 읽히도록 순서를 지킨다.
      let hi = data[from];
      let hiAt = from;
      for (let i = from; i <= to; i++) {
        if (data[i].high > hi.high) {
          hi = data[i];
          hiAt = i;
        }
      }
      let lo = data[hiAt];
      for (let i = hiAt; i <= to; i++) if (data[i].low < lo.low) lo = data[i];
      // 기준은 언제나 현재가 — 화면 밖이라도 '지금 얼마인가'가 알고 싶은 값이다
      const cur = last.close;
      const fromHigh = hi.high > 0 ? (cur / hi.high - 1) * 100 : 0; // 고점 대비 (내려온 폭)
      const fromLow = lo.low > 0 ? (cur / lo.low - 1) * 100 : 0; // 저점 대비 (올라온 폭)
      markers.setMarkers([
        {
          time: t(hi.time),
          position: "aboveBar",
          shape: "arrowDown",
          // 고점 대비는 내려온 폭이라 하락색, 저점 대비는 올라온 폭이라 상승색
          color: DOWN,
          text: `고 ${priceText(hi.high)} ${rateText(fromHigh)}`,
        },
        {
          time: t(lo.time),
          position: "belowBar",
          shape: "arrowUp",
          color: UP,
          text: `저 ${priceText(lo.low)} ${rateText(fromLow)}`,
        },
      ]);
    };

    // 맞춰 둔 화면 범위가 있으면 그대로 되살리고, 없을 때만 전체 보기
    const ts = chart.timeScale();
    const saved = loadView(viewKey);
    if (saved) {
      // 오른쪽 끝을 보고 있었다면 새로 붙은 봉만큼 밀어 계속 최신을 따라가게 한다
      const atEnd = saved.to >= saved.len - 1.5;
      const shift = atEnd ? data.length - saved.len : 0;
      ts.setVisibleLogicalRange({ from: saved.from + shift, to: saved.to + shift });
    } else {
      ts.fitContent();
    }

    // 되살리는 동안 발생하는 변경은 저장하지 않는다 (사용자 조작만 기억)
    let armed = false;
    const arm = setTimeout(() => (armed = true), 300);
    const onRange = (r: { from: number; to: number } | null) => {
      updateMarkers(); // 보이는 구간이 바뀌면 고저도 다시 잡는다
      if (!armed || !viewKey || !r) return;
      saveView(viewKey, { from: r.from, to: r.to, len: data.length });
    };
    ts.subscribeVisibleLogicalRangeChange(onRange);
    updateMarkers();

    return () => {
      clearTimeout(arm);
      ts.unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, viewKey]);

  return <div ref={ref} style={{ height: totalH, width: "100%" }} />;
}
