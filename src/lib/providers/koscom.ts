// 코스콤 어댑터 — 골격.
//
// 엔드포인트 경로와 필드명은 공식 문서에서 확인한 것만 적었다.
//   https://koscom.gitbook.io/open-api/api/marketv3
// 확인하지 못한 부분은 TODO 로 남겨 두었다. 추측으로 채우지 말 것 —
// 계약을 잘못 구현하면 화면은 뜨는데 숫자가 틀리는, 가장 잡기 어려운 상태가 된다.
//
// 코스콤이 주지 않는 것 (문서 카탈로그에 서비스 자체가 없음)
//   재무제표 · 뉴스 · 컨센서스(목표주가/투자의견) · 배당 · 분봉 · 장중 추정수급
// 어떻게 메울지는 PORTING-STOCK-TAB.md 의 "빈칸 메우기" 참고.
//
// 이용 자격 — 코스콤 오픈API 는 개인이 신청할 수 없고, 실데이터를 쓰려면
// 시세 라이선스 계약이 따로 필요하다. 샌드박스 데이터는 개발용으로만 허용된다.
import type { Candle, Interval, Quote } from "@/lib/types";
import type { Exch, SearchHit, StockDataProvider } from "./types";

const BASE = process.env.KOSCOM_API_BASE ?? "https://api.koscom.co.kr";

async function kos<T = Record<string, unknown>>(path: string): Promise<T> {
  const key = process.env.KOSCOM_API_KEY;
  if (!key) throw new Error("KOSCOM_API_KEY 가 없다");
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`코스콤 ${r.status} ${path}`);
  return r.json() as Promise<T>;
}

/** 코스피/코스닥 판별 — 경로가 갈리므로 종목마스터를 한 번 태워 캐시하는 편이 낫다 */
const board = (code: string): "kospi" | "kosdaq" => {
  void code;
  // TODO: 종목 코드만으로는 구분되지 않는다. 코드표(codetable)를 받아 두고 조회할 것.
  return "kospi";
};

const n = (v: unknown) => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export const koscomProvider: StockDataProvider = {
  name: "koscom",

  // 코스콤 history 는 일/주/월만 준다 (D/W/M). 분봉 서비스가 카탈로그에 없다.
  intervals: () => ["1D", "1W", "1M"],
  // 코스콤 시세는 KRX 기준. NXT 분리 시세는 확인되지 않았다.
  exchanges: () => ["KRX"],

  async quote(code, name): Promise<Quote> {
    // 확인됨: /v3/market/closed/{board}/{issuecode}/master 에 현재가·시총·PER 등이 있다.
    const d = await kos<Record<string, string>>(`/v3/market/closed/${board(code)}/${code}/master`);
    const price = n(d.trdPrc); // 체결가
    // TODO: 전일 종가 필드명 확인 후 등락 계산. master 에 없으면 history 1건으로 구한다.
    const prevClose = n(d.prevPrc);
    const change = prevClose > 0 ? price - prevClose : 0;
    return {
      symbol: code,
      name: (d.korSecnNm as string) || name,
      price,
      change,
      changePct: prevClose > 0 ? (change / prevClose) * 100 : 0,
      volume: n(d.trdVol),
      currency: "KRW",
    };
  },

  async candles(code, interval: Interval): Promise<Candle[]> {
    // 확인됨: /v3/market/closed/{board}/{issuecode}/history — cycle D/W/M,
    //         필드 opnprc(시) hgprc(고) lwprc(저) trdPrc(종) + 거래량
    const cycle = interval === "1W" ? "W" : interval === "1M" ? "M" : "D";
    if (!["1D", "1W", "1M"].includes(interval)) {
      throw new Error(`코스콤은 ${interval} 봉을 주지 않는다`);
    }
    const d = await kos<{ rows?: Record<string, string>[] }>(
      `/v3/market/closed/${board(code)}/${code}/history?cycle=${cycle}`,
    );
    return (d.rows ?? []).map((r) => ({
      // TODO: 날짜 필드명 확인 (yyyymmdd 문자열로 온다면 아래처럼 초 단위로 바꾼다)
      time: Date.UTC(+r.trdDd.slice(0, 4), +r.trdDd.slice(4, 6) - 1, +r.trdDd.slice(6, 8)) / 1000,
      open: n(r.opnprc),
      high: n(r.hgprc),
      low: n(r.lwprc),
      close: n(r.trdPrc),
      volume: n(r.trdVol),
    }));
  },

  async investorDaily(code) {
    // 확인됨: 유가/코스닥 종목별투자자 — 단, 전일 및 당일 15:30 이후에만 제공된다.
    void code;
    // TODO: 엔드포인트 경로·필드명 확인 후 { date, close, 개인, 외국인, 기관 } 로 변환
    return [];
  },

  // 코스콤은 장중 추정 수급을 제공하지 않는다 (투자자 데이터는 15:30 이후 확정치).
  // 빈 배열을 주면 화면의 '당일 실시간' 탭이 스스로 숨는다.
  investorIntraday: async () => [],

  async investorTrend(code) {
    // 확인됨: /foreignhistory 에 외국인 보유비중(FornHdVolRt) 이 있다.
    void code;
    // TODO: 경로 확인 후 { date, 개인, 외국인, 기관 } 로 변환
    return [];
  },

  async detail(code) {
    // 확인됨: master 에 mktcap·per·pbr·eps·listShrs, selective master 에 wk52HgstPrc/wk52LwstPrc
    const d = await kos<Record<string, string>>(`/v3/market/closed/${board(code)}/${code}/master`);
    return {
      code,
      name: (d.korSecnNm as string) || code,
      industryCode: String(d.idxIndCd ?? ""), // TODO: 업종코드 필드명 확인
      price: n(d.trdPrc),
      per: n(d.per),
      pbr: n(d.pbr),
      eps: n(d.eps),
      bps: n(d.bps),
      cnsPer: 0, // 코스콤 미제공 (컨센서스 서비스 없음)
      marketCap: n(d.mktcap) / 1e8, // 억원 단위로 맞춘다 — TODO: 원본 단위 확인
      marketCapText: "",
      foreignRate: "", // /foreignhistory 로 따로 채운다
      high52: n(d.wk52HgstPrc),
      low52: n(d.wk52LwstPrc),
      dividendYield: 0, // 코스콤 미제공
      priceTarget: 0, // 코스콤 미제공
      upside: 0, //  ''
      recommMean: 0, //  ''
    };
  },

  async sectorRank(code, groupKey) {
    // 업종 지수는 코스콤이 준다(KRX업종). 다만 종합평가 점수는 업종 '구성종목 전체'의
    // 재무지표가 있어야 매길 수 있는데, 재무 서비스가 없다 → 별도 출처가 필요하다.
    void code;
    void groupKey;
    throw new Error("코스콤만으로는 종합평가를 매길 수 없다 — PORTING-STOCK-TAB.md 참고");
  },

  // 아래 셋은 코스콤 카탈로그에 서비스 자체가 없다.
  financials: async () => ({ periods: [], rows: [] }),
  news: async () => [],

  async search(query) {
    // 확인됨: 코드표(codetable) 로 전 종목 마스터를 받아 두고 로컬에서 찾는다.
    // 매 입력마다 부르면 호출 제한에 걸리므로 하루 한 번 받아 캐시할 것.
    void query;
    return [] as SearchHit[];
  },
};

/** 화면에 "이 출처는 여기까지" 를 알리는 표 */
export const koscomCapabilities = {
  분봉: false,
  장중수급: false,
  재무제표: false,
  뉴스: false,
  컨센서스: false,
  배당: false,
  거래소구분: false,
};
