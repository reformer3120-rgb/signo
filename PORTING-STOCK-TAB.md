# 국내 종목탭 옮겨 심기 — 코스콤 데이터로

SIGNO 의 국내 종목 화면(UI + 데이터 배치)을 다른 프로젝트에 그대로 올리고,
데이터만 코스콤으로 갈아 끼우기 위한 문서.

읽는 순서 — §1 무엇을 복사하나 → §2 데이터 계약 → §3 코스콤 매핑 →
§4 빈칸 메우기 → §5 자격·라이선스.

---

## 1. 무엇을 복사하나

종목탭이 실제로 쓰는 파일은 **29개**다. `src/components/stock/StockView.tsx` 에서
import 를 따라가면 나오는 전부이며, 이 목록 밖의 파일은 필요 없다.

```
src/components/
    CandleChart.tsx        모든 차트가 쓰는 공용 캔들 차트 (lightweight-charts v5)
    Card.tsx               카드 껍데기
    ChartFoldButton.tsx    차트 접기
    ExchangeSelect.tsx     KRX / NXT / 통합 선택
    IndicatorBar.tsx       이동평균·거래량·RSI·MACD 토글
    InvestorPanel.tsx      투자자 수급 패널
    MaLegend.tsx           이동평균 범례
    SessionBadge.tsx       장 세션 배지
    StockSearch.tsx        종목 검색창
    WatchButton.tsx        관심종목 담기
src/components/sections/
    StockSection.tsx       시세줄 + 차트 카드
src/components/stock/
    StockView.tsx          ★ 진입점 — 카드 배치 순서가 여기 있다
    StockStickyBar.tsx     상단 고정 검색 바
    StockDetailCard.tsx    종합평가
    FinancialsCard.tsx     재무제표
    SectorRankCard.tsx     업종 내 순위
    NewsCard.tsx           뉴스
src/lib/
    format.ts              숫자·통화·등락 표기
    indicators.ts          이동평균·RSI·MACD 계산
    score.ts               ★ 종합평가 채점 규칙
    session.ts             장 세션 판정
    swr.ts                 fetcher
    types.ts               Quote / Candle / Interval
    useChartHeight.ts      화면 크기에 맞춘 차트 높이
    useSticky.ts           화면 상태 저장 (localStorage)
    useStickyOffset.ts     고정 요소 높이를 CSS 변수로 알림
    watchlist.ts           관심종목
    kis.ts   naverApi.ts   ← 타입만 참조된다. §2 대로 바꿔치울 대상
```

### 화면 배치 (위 → 아래)

```
StockStickyBar     검색 + 관심종목            (상단 고정)
StockSection       시세줄(고정) · 차트 · 봉주기 · 지표 · 거래소
InvestorPanel      투자자 수급 (당일 / 일별 / 추이)
StockDetailCard    종합평가 — 등급 + 점수 분해
FinancialsCard     재무제표 (연간 / 분기, 컨센서스 열 구분)
SectorRankCard     업종 내 순위 상위 10 + 검색종목 위치
NewsCard           뉴스
```

### 같이 가져가야 도는 것

- **Tailwind 4 토큰** — `bg-surface` `border-line` `text-muted` `text-fg` `bg-canvas`
  `text-brand` 등. `src/app/globals.css` 의 `@theme` 블록을 함께 옮긴다.
  옮기지 않으면 색이 전부 빠진 채로 뜬다.
- **글꼴 변수** — `--font-space-mono`(숫자), `--font-grotesk`(제목), Pretendard(본문).
  차트는 CSS 변수를 못 읽으므로 `CandleChart.tsx` 의 `chartFont()` 가 실제 글꼴
  이름으로 풀어서 넘긴다. 글꼴을 바꾸면 이 함수도 같이 고친다.
- **뷰포트 고정** — `layout.tsx` 의 `width=1152`. 폰에서 화면을 통째로 축소해
  보여주는 전제이고, `useChartHeight` 가 이 전제 위에서 높이를 잡는다.
  이 설정을 뺄 거라면 `useChartHeight` 의 비율도 다시 잡아야 한다.

---

## 2. 데이터 계약

화면은 **출처를 모른다.** `src/lib/providers/types.ts` 의 `StockDataProvider`
하나만 구현하면 같은 UI 가 그대로 돈다.

| 메서드 | 채우는 화면 | 지금(네이버·KIS) |
|---|---|---|
| `quote` | 시세줄 현재가·등락 | `naver.quote` / KIS `stockPrice` |
| `candles` | 차트 | `naver.daily/bars/yearly/minute` · KIS `exchangeBars` |
| `intervals` | 봉 주기 버튼 | 일·주·월·연 + 1·5·15·30·60·240분 |
| `exchanges` | 거래소 선택 | KRX · NXT · 통합 |
| `investorDaily` | 수급 '일별' | KIS `FHKST01010900` |
| `investorIntraday` | 수급 '당일 실시간' | KIS `HHPTJ04160200` (장중 추정) |
| `investorTrend` | 수급 '추이' | `naverApi.stockTrendLong` |
| `detail` | 종합평가 | `naverApi.stockDetail` |
| `sectorRank` | 업종 내 순위 | `naverApi.sectorRank` |
| `financials` | 재무제표 | `naverApi.financials` |
| `news` | 뉴스 | `naverApi.stockNews` |
| `search` | 검색창 | 네이버 통합검색 |

**빈 값 규칙** — 출처가 못 주는 항목은 `[]` 나 빈 값을 준다. 카드가 스스로 숨는다.
**없는 값을 0 으로 채우지 말 것.** 0 은 화면에 "0" 으로 표시되어, 데이터가 없는
것과 값이 0 인 것이 구분되지 않는다.

기준 구현이 `src/lib/providers/naverKis.ts` 에 있다. 계약이 실제로 구현
가능하다는 증명이자, 각 자리에 무엇이 들어가야 하는지 보는 참고용이다.

---

## 3. 코스콤 매핑

코스콤 오픈API 문서 카탈로그(2026-08 확인) 기준.
출처 <https://koscom.gitbook.io/open-api/api/marketv3>

### 코스콤이 주는 것

| 계약 | 코스콤 | 비고 |
|---|---|---|
| `quote` | `/v3/market/closed/{board}/{issuecode}/master` | 체결가·거래량 |
| `candles` (일·주·월) | `.../history?cycle=D\|W\|M` | `opnprc` `hgprc` `lwprc` `trdPrc` |
| `detail` 일부 | `.../master` | `mktcap` `per` `pbr` `eps` `listShrs` |
| `detail` 52주 | selective master | `wk52HgstPrc` `wk52LwstPrc` |
| 외국인 보유비중 | `.../foreignhistory` | `FornHdVolRt` |
| `investorDaily` | 유가/코스닥 **종목별투자자** | **전일 및 당일 15:30 이후만** |
| 업종 지수 | KRX업종 (실시간/종가) | 섹터 화면용 |
| `search` | 코드표(codetable) | 전 종목 마스터를 받아 두고 로컬 검색 |

### 코스콤이 주지 않는 것 — 서비스 자체가 없다

```
재무제표          FinancialsCard 가 통째로 빈다
컨센서스          목표주가·투자의견·추정 PER
배당수익률        종합평가 배점 3점
뉴스              NewsCard 가 통째로 빈다
분봉·틱           차트가 일·주·월만 남는다
장중 추정수급     수급 '당일 실시간' 탭이 사라진다
거래소 구분       NXT 분리 시세 확인되지 않음
```

**가장 큰 문제는 재무제표다.** 종합평가 100점 중 **65점**(재무건전성 28 ·
밸류 22 · 성장성 15)이 재무에서 나온다. 코스콤만으로 채울 수 있는 건 시가총액
10 + 외국인비중 12 + 주가흐름 10 = **32점**뿐이다. PER·PBR·EPS 는 master 에
있으니 밸류 22 는 살아나 **54점**까지 되지만, ROE·부채비율·영업이익률·성장률은
재무제표가 있어야 한다.

즉 **코스콤 단독으로는 종합평가·업종순위 카드를 띄울 수 없다.**
`koscom.ts` 의 `sectorRank` 가 그냥 에러를 던지도록 해 둔 이유다 — 반쪽 점수를
그럴듯하게 보여 주는 쪽이 훨씬 위험하다.

---

## 4. 빈칸 메우기

| 빠진 것 | 대안 |
|---|---|
| 재무제표 | **DART 오픈API** (무료, 개인 가능) — 단일회사 주요계정 `fnlttSinglAcnt`. 분기·연간 재무제표를 정식으로 준다. 컨센서스(추정치)는 없음 |
| 컨센서스 | 무료 출처 없음. 화면에서 빼는 편이 낫다 (SIGNO 도 애널리스트 박스를 이미 뺐다) |
| 배당 | DART 배당 공시 또는 KRX 정보데이터시스템 |
| 뉴스 | 카드를 빼거나 별도 뉴스 API |
| 분봉 | 코스콤 실시간 시세를 직접 받아 **분봉으로 집계해 저장**해야 한다. 과거 분봉은 소급 불가 — 수집을 시작한 시점부터만 쌓인다 |
| 장중 추정수급 | 대안 없음. 15:30 이후 확정치만 |

현실적인 조합은 **코스콤(시세·수급·업종) + DART(재무)** 다.
이러면 종합평가는 배당 3점만 빠진 **97점 만점**으로 돌아간다.

---

## 5. 자격과 라이선스 — 먼저 확인할 것

- 코스콤 오픈API 는 **개인 신청이 되지 않는다.** 법인 자격이 필요하다.
- 샌드박스 시세는 **개발 지원용으로만** 허용된다. 서비스에 띄우려면
  **시세 라이선스 계약**을 따로 맺어야 한다.
- 해외 데이터는 코스콤 카탈로그에 없다. 미국 화면까지 옮길 계획이라면
  야후 등 별도 출처가 그대로 필요하다.

자격·비용이 확정되기 전에는 어댑터만 만들어 두고 네이버·KIS 로 돌려 두는 편이
안전하다. `DATA_PROVIDER` 환경변수 하나로 갈린다.

```bash
DATA_PROVIDER=koscom
```

---

## 6. 작업 순서 제안

```
1  파일 29개 + globals.css @theme + 글꼴 설정 복사
2  StockDataProvider 를 코스콤으로 구현 (koscom.ts 의 TODO 를 채운다)
   먼저 quote · candles · detail 셋만 — 차트 카드가 뜨면 절반은 된 것
3  재무는 DART 로 별도 구현해 financials 에 물린다
4  sectorRank 는 2·3 이 끝난 뒤에. 채점 규칙(score.ts)은 손대지 않는다
5  못 주는 것은 빈 값으로 두어 카드가 스스로 숨게 한다
```

`score.ts` 는 건드리지 않는다. 원지표만 정확히 넣어 주면 등급·점수 체계가
그대로 따라온다.
