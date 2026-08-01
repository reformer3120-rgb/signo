// 공용 데이터 타입

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume?: number;
  currency?: string;
}

/** lightweight-charts 호환 캔들 (time = UNIX seconds) */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Interval = "1D" | "1W" | "1M" | "1Y" | "1" | "5" | "15" | "30" | "60" | "240";

export interface FxRate {
  label: string;
  price: number; // 원
  changePct: number;
}
