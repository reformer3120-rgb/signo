"use client";
import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
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

export function CandleChart({
  data,
  height = 440,
  indicators,
  session,
  precision = 2,
}: {
  data: Candle[];
  height?: number;
  indicators?: Indicators;
  session?: boolean;
  precision?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const ma = !!indicators?.ma;
  const showRsi = !!indicators?.rsi;
  const showMacd = !!indicators?.macd;

  const extraPanes = (showRsi ? 1 : 0) + (showMacd ? 1 : 0);
  const totalH = height + extraPanes * 130;

  const last = data[data.length - 1];
  const key = [
    totalH,
    ma,
    showRsi,
    showMacd,
    !!session,
    precision,
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
        fontFamily: "var(--font-space-mono), monospace",
        attributionLogo: false,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      leftPriceScale: { visible: true, borderColor: "transparent" },
      rightPriceScale: { visible: false },
      timeScale: { borderColor: "transparent", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      priceScaleId: "left",
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
        // 좌측 축에 가격 라벨 + 짧은 태그(H 고점 / L 저점 / C 현재가)
        candle.createPriceLine({ price: hi, color: UP, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "H" });
        candle.createPriceLine({ price: lo, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "L" });
        candle.createPriceLine({ price: last.close, color: "#F2A93B", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "C" });
      }
    }

    // 이동평균선 (가격 패널 오버레이)
    if (ma) {
      for (const p of MA_PERIODS) {
        const s = chart.addSeries(
          LineSeries,
          { color: MA_COLORS[p], lineWidth: 1, priceScaleId: "left", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
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

    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={ref} style={{ height: totalH, width: "100%" }} />;
}
