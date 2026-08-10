// 종목탭이 요구하는 데이터 계약.
//
// 종목 화면(StockView)은 이 인터페이스가 주는 것만 쓴다. 화면 어디에도
// 네이버·KIS·코스콤 같은 출처 이름이 나오지 않으므로, 이 파일을 구현한
// 어댑터를 갈아 끼우면 같은 UI가 다른 데이터로 그대로 돈다.
//
// 옮겨 심을 때 읽을 것: PORTING-STOCK-TAB.md
import type { Candle, Interval, Quote } from "@/lib/types";
import type {
  Financials,
  NewsItem,
  SectorRank,
  StockDetail,
  TrendRow,
} from "@/lib/naverApi";
import type { InvestorEstimate, InvestorRow } from "@/lib/kis";

export type { Candle, Interval, Quote, Financials, NewsItem, SectorRank, StockDetail, TrendRow, InvestorEstimate, InvestorRow };

/** 거래소 — 국내는 KRX / NXT / 통합(UN) */
export type Exch = "KRX" | "NXT" | "UN";

/** 검색 결과 한 줄 */
export interface SearchHit {
  code: string;
  name: string;
  market?: string;
}

/**
 * 종목탭 한 벌을 채우는 데 필요한 전부.
 *
 * 각 메서드는 화면의 어느 부분을 채우는지 주석에 적어 두었다.
 * 출처가 못 주는 항목은 빈 배열·null 을 돌려주면 해당 카드가 알아서 숨는다.
 * 없는 값을 0 으로 채우지 말 것 — 0 은 '값이 0' 으로 표시된다.
 */
export interface StockDataProvider {
  /** 어댑터 이름 (로그·디버그용) */
  readonly name: string;

  // ── 차트 카드 ─────────────────────────────────────────────
  /** 시세줄: 현재가·등락·거래량. exchange 를 못 가리면 KRX 로 본다. */
  quote(code: string, name: string, exchange?: Exch): Promise<Quote>;
  /** 캔들. time 은 UNIX 초. 분봉을 못 주면 일봉만 지원해도 화면은 돈다. */
  candles(code: string, interval: Interval, exchange?: Exch): Promise<Candle[]>;
  /** 지원하는 봉 주기 — 화면의 봉 주기 버튼이 이 목록만 그린다 */
  intervals(): Interval[];
  /** 지원하는 거래소 — 하나뿐이면 거래소 선택 버튼이 숨는다 */
  exchanges(): Exch[];

  // ── 투자자 수급 패널 ──────────────────────────────────────
  /** 일별 투자자 매매동향 (개인·외국인·기관) */
  investorDaily(code: string): Promise<InvestorRow[]>;
  /** 장중 추정 수급. 실시간 추정치를 못 주면 [] */
  investorIntraday(code: string): Promise<InvestorEstimate[]>;
  /** 장기 수급 추이 (외국인 보유비중 흐름 등). 없으면 [] */
  investorTrend(code: string): Promise<TrendRow[]>;

  // ── 종합평가 카드 ─────────────────────────────────────────
  /** 시총·PER·PBR·EPS·52주·외국인비중 등 종목 기본 지표 */
  detail(code: string): Promise<StockDetail>;
  /** 업종 내 순위와 점수. 채점은 lib/score.ts 가 하므로 원지표만 주면 된다. */
  sectorRank(code: string, groupKey?: string): Promise<SectorRank>;

  // ── 재무제표 카드 ─────────────────────────────────────────
  /** 연간/분기 재무제표. periods[].cns=true 면 컨센서스(추정치) */
  financials(code: string, period: "annual" | "quarter"): Promise<Financials>;

  // ── 뉴스 카드 ─────────────────────────────────────────────
  /** 종목 뉴스. 없으면 [] → 카드가 숨는다 */
  news(code: string): Promise<NewsItem[]>;

  // ── 검색 바 ───────────────────────────────────────────────
  /** 종목 검색 (코드·한글명) */
  search(query: string): Promise<SearchHit[]>;
}

/**
 * 출처가 못 주는 기능을 화면에 알리는 표.
 * 라우트가 이 값을 응답에 실어 주면 카드가 스스로 숨거나 안내를 띄운다.
 */
export interface ProviderCapabilities {
  분봉: boolean;
  장중수급: boolean;
  재무제표: boolean;
  뉴스: boolean;
  컨센서스: boolean; // 목표주가·투자의견
  배당: boolean;
  거래소구분: boolean; // KRX / NXT 분리 시세
}
