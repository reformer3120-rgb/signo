// 어댑터 선택 — 환경변수 하나로 데이터 출처를 갈아 끼운다.
//
//   DATA_PROVIDER=koscom   → 코스콤
//   (없으면)               → 네이버 + KIS (현재 운영)
import { naverKisProvider } from "./naverKis";
import { koscomProvider } from "./koscom";
import type { StockDataProvider } from "./types";

export const provider: StockDataProvider =
  process.env.DATA_PROVIDER === "koscom" ? koscomProvider : naverKisProvider;

export type { StockDataProvider } from "./types";
export * from "./types";
