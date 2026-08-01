import type { Candle } from "./types";

export type LinePoint = { time: number; value: number };
export type HistPoint = { time: number; value: number; color: string };

/** 단순이동평균 */
export function sma(d: Candle[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    sum += d[i].close;
    if (i >= period) sum -= d[i - period].close;
    if (i >= period - 1) out.push({ time: d[i].time, value: +(sum / period).toFixed(2) });
  }
  return out;
}

function ema(vals: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = vals[0] ?? 0;
  for (let i = 0; i < vals.length; i++) {
    prev = i === 0 ? vals[0] : vals[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** RSI (Wilder) */
export function rsi(d: Candle[], period = 14): LinePoint[] {
  const out: LinePoint[] = [];
  if (d.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = d[i].close - d[i - 1].close;
    gain += Math.max(ch, 0);
    loss += Math.max(-ch, 0);
  }
  gain /= period;
  loss /= period;
  const push = (i: number) => {
    const rs = loss === 0 ? 100 : gain / loss;
    out.push({ time: d[i].time, value: +(100 - 100 / (1 + rs)).toFixed(2) });
  };
  push(period);
  for (let i = period + 1; i < d.length; i++) {
    const ch = d[i].close - d[i - 1].close;
    gain = (gain * (period - 1) + Math.max(ch, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-ch, 0)) / period;
    push(i);
  }
  return out;
}

/** MACD (12,26,9) */
export function macd(
  d: Candle[],
  up: string,
  down: string,
  fast = 12,
  slow = 26,
  signalP = 9,
): { macd: LinePoint[]; signal: LinePoint[]; hist: HistPoint[] } {
  const closes = d.map((c) => c.close);
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const macdVals = closes.map((_, i) => ef[i] - es[i]);
  const sig = ema(macdVals, signalP);
  const macdL: LinePoint[] = [];
  const signalL: LinePoint[] = [];
  const hist: HistPoint[] = [];
  for (let i = 0; i < d.length; i++) {
    macdL.push({ time: d[i].time, value: +macdVals[i].toFixed(2) });
    signalL.push({ time: d[i].time, value: +sig[i].toFixed(2) });
    const h = macdVals[i] - sig[i];
    hist.push({ time: d[i].time, value: +h.toFixed(2), color: h >= 0 ? up : down });
  }
  return { macd: macdL, signal: signalL, hist };
}

/** 이동평균선 기본 세트 */
export const MA_PERIODS = [5, 10, 20, 60, 120];
export const MA_COLORS: Record<number, string> = {
  5: "#F2A93B",
  10: "#1F9D6B",
  20: "#3844BE",
  60: "#9AA0E4",
  120: "#5A5E73",
};
