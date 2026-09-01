// 법인에 넘기는 종목탭 파일 목록 — 한 군데에만 적는다.
//
// 전체 꾸러미(pack-stock.mjs)와 바뀐것 꾸러미(pack-stock-delta.mjs)가
// 같이 쓴다. 두 곳에 따로 적어 두었더니 개요를 고친 뒤 바뀐것 쪽 목록에
// 여섯 파일이 빠졌다 — 받는 쪽은 그것이 빠진 줄도 모른다.

/** 종목탭 화면이 쓰는 것 — StockView.tsx 에서 import 를 따라가면 나오는 전부 */
export const 화면 = [
  "src/app/globals.css",
  "src/app/stock/page.tsx",
  ...[
    "CandleChart", "Card", "ChartFoldButton", "ExchangeSelect", "IndicatorBar",
    "InvestorPanel", "MaLegend", "SessionBadge", "StockBrief", "StockSearch",
    "WatchButton",
  ].map((c) => `src/components/${c}.tsx`),
  "src/components/sections/StockSection.tsx",
  ...[
    "FinancialsCard", "NewsCard", "SectorRankCard", "StockBriefCard",
    "StockDetailCard", "StockStickyBar", "StockThemeChips", "StockView",
  ].map((c) => `src/components/stock/${c}.tsx`),
  // 굳혀 둔 표 — 이게 없으면 테마와 개요가 통째로 비어 뜬다
  "src/data/themes.json",
  "src/data/about.json",
  ...[
    "about", "baseline", "cache", "chartDraw", "facts", "format", "indicators",
    "kis", "naver", "naverApi", "ownTheme", "score", "sectorGroup", "session",
    "swr", "types", "useChartHeight", "useSticky", "useStickyOffset", "watchlist",
  ].map((l) => `src/lib/${l}.ts`),
  ...["dart", "index", "koscom", "naverKis", "types"].map((p) => `src/lib/providers/${p}.ts`),
];

/** API 라우트 */
export const 라우트 = [
  "financials", "grades", "investor", "investor-estimate", "investor-frgn",
  "ohlcv", "quote", "search", "sector-rank", "stock-brief", "stock-detail",
  "stock-news", "stock-themes",
].map((r) => `src/app/api/${r}/route.ts`);

/** 분기에 한 번 돌려 개요 문장을 새로 만드는 것 */
export const 만드는법 = [
  "scripts/theme/build-about.mjs",
  "scripts/theme/sent.mjs",
  "scripts/theme/classify.mjs",
  "scripts/theme/build-data.mjs",
];

/** 꾸러미에 담는 전부 */
export const 전부 = [...화면, ...라우트, ...만드는법];

/** 키가 섞여 들어갔는지 본다. 목록을 코드로 적어도 마지막에 한 번은 봐야 한다. */
export function 키검사(목록) {
  const 위험 = 목록.filter((f) => /\.env|token|secret|\.key/i.test(f));
  if (위험.length) {
    console.error(`키로 보이는 파일이 목록에 있다 — ${위험.join(", ")}`);
    process.exit(1);
  }
}
