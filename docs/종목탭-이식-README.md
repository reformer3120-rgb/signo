# 국내 종목탭 옮겨 심기 — 코스콤 데이터로

SIGNO 의 국내 종목 화면(UI + 데이터 배치)을 다른 프로젝트에 그대로 올리고,
데이터만 코스콤으로 갈아 끼우기 위한 문서.

읽는 순서 — §1 무엇을 복사하나 → §2 데이터 계약 → §3 코스콤 매핑 →
§4 빈칸 메우기(DART) → §5 라이선스 → §6 환경변수 → §7 작업 순서.

> **먼저 알아 둘 것 — `src/lib/providers/` 는 SIGNO 본체에 연결되어 있지 않다.**
>
> SIGNO 의 API 라우트는 지금도 `lib/kis.ts` · `lib/naverApi.ts` 를 직접 부른다.
> `providers/` 는 **옮겨 심을 쪽에서 쓰라고 미리 뽑아 둔 계약층**이다.
> SIGNO 에서 `DATA_PROVIDER=koscom` 을 켜도 아무 일도 일어나지 않는다.
>
> 옮겨 심는 쪽에서는 라우트가 `provider.quote()` 를 부르도록 바꾸면 된다.
> 바꿔야 할 라우트는 열둘이다.
>
> ```
> quote  ohlcv  stock-brief  stock-detail  financials  investor
> investor-frgn  investor-estimate  sector-rank  stock-news  search  grades
> ```
>
> `stock-themes` 는 시세를 안 쓰므로 그대로 둔다.

---

## 1. 무엇을 복사하나

종목탭이 실제로 쓰는 파일은 **48개**다. `src/components/stock/StockView.tsx` 에서
import 를 따라가면 나오는 전부이며, 이 목록 밖의 파일은 필요 없다.
여기에 API 라우트 13개와 `globals.css` 가 따로 붙는다 — 꾸러미의
`파일목록.txt` 가 셋을 다 적어 둔 것이다.

> 2026-08 에 29개였다. 기업 개요와 테마 칩이 붙으면서 늘었다.
> 다시 셀 때는 `StockView.tsx` 부터 import 를 따라가면 된다.

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
src/components/
    StockBrief.tsx         테마 화면의 종목 카드 — 시총·매출성장·
                           이익률·PER (2026-08 추가)
                           ※ 기업 개요 카드와 다른 것이다. 이쪽은
                             숫자를 그대로 둔다 — 테마 화면에는
                             달리 볼 데가 없다.
src/components/stock/
    StockView.tsx          ★ 진입점 — 카드 배치 순서가 여기 있다
    StockStickyBar.tsx     상단 고정 검색 바
    StockBriefCard.tsx     기업 개요 카드 — 무슨 일을 하는 회사인가    (2026-08 추가)
    StockThemeChips.tsx    종목명 옆 테마 칩 + 테마 등락률              (2026-08 추가)
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
    baseline.ts            지표 크론이 모아 둔 값 (외국인·이평선·기간수익률)
    cache.ts               응답 캐시 — 배포와 무관한 값은 { global: true }
    chartDraw.ts           차트 그리기 보조
    facts.ts               종목 사실 조각
    sectorGroup.ts         업종 묶기
    score.ts               ★ 종합평가 채점 규칙
    ownTheme.ts            테마 데이터 층                              (2026-08 추가)
    about.ts               기업 개요 문장 읽기                          (2026-08 추가)
src/data/
    themes.json            테마 분류 결과 1.5MB                        (2026-08 추가)
    about.json             기업 개요 문장 1.4MB                         (2026-08 추가)
                           서버에서만 읽는다. 이게 없으면 개요가
                           통째로 안 뜬다.
src/lib/
    kis.ts   naverApi.ts   ← 타입만 참조된다. §2 대로 바꿔치울 대상
```

### 화면 배치 (위 → 아래)

```
StockStickyBar     검색 + 관심종목            (상단 고정)
StockThemeChips    종목명 옆 — 이 종목이 든 테마와 그 테마의 등락률
StockBriefCard     기업 개요 — 이 회사가 무슨 일을 하는가
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

계약에 없지만 화면이 부르는 것이 셋 더 있다 (2026-08 추가).

| 라우트 | 채우는 화면 | 무엇이 필요한가 |
|---|---|---|
| `/api/stock-brief` | 기업 개요 | **아무것도 필요 없다** — themes.json + about.json 만 읽는다 |
| `/api/stock-themes` | 테마 칩 | themes.json 만 (시세 불필요) |
| `/api/investor-estimate` | 수급 '당일 실시간' | 코스콤에 없다 — 카드에서 뺀다 |

**빈 값 규칙** — 출처가 못 주는 항목은 `[]` 나 빈 값을 준다. 카드가 스스로 숨는다.
**없는 값을 0 으로 채우지 말 것.** 0 은 화면에 "0" 으로 표시되어, 데이터가 없는
것과 값이 0 인 것이 구분되지 않는다.

기준 구현이 `src/lib/providers/naverKis.ts` 에 있다. 계약이 실제로 구현
가능하다는 증명이자, 각 자리에 무엇이 들어가야 하는지 보는 참고용이다.

---

## 3. 코스콤 매핑

코스콤 오픈API 공식 문서(2026-08 확인) 기준. 아래 경로·필드는 모두 문서에서
확인한 것이다. <https://koscom.gitbook.io/open-api/api/marketv3>

### 인증

```
게이트웨이   운영 https://apigw.koscom.co.kr
             샌드박스 https://sandbox-apigw.koscom.co.kr
             (계약 시 안내받은 주소를 KOSCOM_API_BASE 에 넣는다)

API Key      GET  헤더 apikey: <키>   (?apikey= 도 되지만 URL 에 키가 남는다)
             POST 헤더 apikey: <키>

OAuth2       POST /auth/oauth/v3/token
             Authorization: Basic base64(client_id:client_secret)
             Content-Type: application/x-www-form-urlencoded
             → access_token 을 Authorization: Bearer 로

경로         /v3/market/closed/{kospi|kosdaq}/{종목코드}/...
             /v3/market/investors/{kospi|kosdaq}/{종목코드}/investors
```

### 코스콤이 주는 것

| 계약 | 엔드포인트 | 필드 |
|---|---|---|
| `search`, 시장 판별 | `/{board}/lists` | `isuSrtCd` `isuKorAbbr` `isuKorNm` |
| `quote` | `/{board}/{code}/master` | `trdPrc` `prevddClsprc` `accTrdvol` |
| `candles` 일·주·월 | `/{board}/{code}/history` | `trdDd` `opnprc` `hgprc` `lwprc` `trdPrc` `accTrdvol` — 파라미터 `trnsmCycleTpCd=D\|W\|M` `inqStrtDd` `inqEndDd` `reqCnt` |
| `detail` 지표 | `/{board}/{code}/master` | `mktcap` `per` `pbr` `eps` `bps` `divYd` `listShrs` `idxIndMidclssCd` |
| `detail` 52주 | `/selectivemaster` | `wk52HgstPrc` `wk52LwstPrc` (일봉에서 직접 구해도 된다) |
| 외국인 보유비중 | `/{board}/{code}/foreignhistory` | `FornHdVolRt` `FornHdVol` |
| `investorDaily` | `/investors/{board}/{code}/investors` | `invstCd` `bidTrdvol` `askTrdvol` — **전일 및 당일 15:30 이후만** |
| 업종 지수 | KRX업종 (실시간 / 종가) | 섹터 화면용 |
| 공매도 | `/{board}/{code}/shortsell` | 지금 화면엔 안 쓰지만 있다 |

투자자코드 — `8` 기관계 · `10` 개인 · `11` 외국인 · `6` 연기금 · `1` 금융투자.
순매수 = `bidTrdvol - askTrdvol`.

### 코스콤이 주지 않는 것 — 서비스 자체가 없다

```
재무제표          FinancialsCard 가 통째로 빈다  → DART 로 해결 (§4)
컨센서스          목표주가·투자의견·추정 PER
뉴스              NewsCard 가 통째로 빈다
분봉·틱           차트가 일·주·월만 남는다
장중 추정수급     수급 '당일 실시간' 탭이 사라진다
거래소 구분       NXT 분리 시세가 카탈로그에 없다
```

배당수익률은 **주는 쪽**이다 (`master.divYd`).

### 나중에 붙은 두 카드 — 테마 칩과 종목 개요

2026-08 에 붙었고 위 표에 없다. 출처가 다르므로 따로 적는다.

**테마 칩** (`StockThemeChips` · `/api/stock-themes`)

코스콤과 무관하다. 테마 분류는 SIGNO 가 DART 사업보고서로 직접 만든 것이고,
결과가 `src/data/themes.json` 에 통째로 들어 있다. 파일만 옮기면 그대로 돈다.
테마 등락률만 시세가 필요한데, 그것은 구성종목 등락률의 평균이므로 `quote`
계약으로 충분하다.

  · 만드는 법과 파이프라인은 `docs/테마탭-인계.md` 를 볼 것
  · 분류를 다시 돌릴 생각이 없다면 `themes.json` 한 파일만 가져가면 된다

**기업 개요** (`StockBriefCard` · `/api/stock-brief`)

```
· 인쇄용지·산업용지·특수지를 생산하는 제지업체다.
· 신문용지와 백판지를 주력으로 하며, 국내 대형 인쇄사에 직납한다.
```

| 무엇 | 어디서 오나 | 코스콤 |
|---|---|---|
| 개요 문장 | `about.json` — DART 사업보고서 '사업의 개요' 에서 옮긴 것 | 필요 없음 |
| 주요사업 낱말 | `themes.json` 의 `biz` | 필요 없음 |

**이 카드는 바깥을 하나도 부르지 않는다.** 굳혀 둔 표 둘만 읽는다.
코스콤도 DART 도 필요 없고, 키 없이 바로 뜬다. 종목탭에서 제일 먼저
붙일 수 있는 카드다.

처음에는 이 카드에 평가(점수·PER·목표주가·의견)와 모멘텀(1개월·이평선·
외국인)까지 세 칸으로 넣었다가 걷어냈다 — 그 값들이 하나도 빠짐없이
아래 카드에 또 있었기 때문이다.

| 걷어낸 것 | 실제로 있는 곳 |
|---|---|
| SIGNO 점수 · 골든크로스 | 섹터 종합평가 |
| 매출성장 · 영업이익률 | 재무제표 |
| PER · 시총 · 목표주가 · 의견 | 종목 상세 |
| 1개월 · 외국인 | 종목 상세 |
| 테마 N종목 | 차트 위 테마 칩 |

같은 숫자를 두 번 보여 주느라 정작 "이게 뭐 하는 회사냐" 가 묻혔다.
**그대로 옮기면 된다 — 다시 넣지 말 것.**

개요 문장은 분기에 한 번 새로 만든다.

```
node scripts/theme/build-about.mjs --write   → src/data/about.json
```

2,497종목 중 2,367종목(94.8%)에 서고, 없는 종목은 테마 편입 사유 한
줄로 대신한다. 그것도 없으면 카드가 통째로 숨는다.

**이평선 판정** (`score.ts` 의 `maRead`) 은 2026-08 에 한 번 바로잡았다.
20일선과 60일선 둘만 보고 정배열이라 적던 것을 고쳤고, 크로스는 휩쏘를 걸러
확인된 것만 센다. 주가흐름 10점 안에서 기간수익률 75% · 이평선 25% 로 들어간다.
일봉만 있으면 계산되므로 코스콤으로 그대로 된다.

### 종합평가 점수는 어디까지 채워지나

| | 배점 | 코스콤 단독 | 코스콤+DART |
|---|---|---|---|
| 재무건전성 (ROE·부채비율·영업이익률) | 28 | ✗ | ✓ |
| 밸류 (PER·PBR·EPS) | 22 | ✓ master | ✓ |
| 성장성 (매출·영업이익 성장) | 15 | ✗ | ✓ |
| 외국인 보유비중 | 12 | ✓ foreignhistory | ✓ |
| 시가총액 | 10 | ✓ master | ✓ |
| 주가흐름 | 10 | ✓ history | ✓ |
| 배당 | 3 | ✓ master.divYd | ✓ |
| **합계** | **100** | **57** | **100** |

즉 **코스콤 단독으로는 종합평가·업종순위 카드를 띄울 수 없다.** 43점이 비는
채로 등급을 매기면 실제보다 낮은 등급이 그럴듯하게 나간다. `koscom.ts` 의
`sectorRank` 가 DART 키 없이는 그냥 에러를 던지도록 해 둔 이유다.


---

## 4. 빈칸 메우기

| 빠진 것 | 대안 | 상태 |
|---|---|---|
| 재무제표 | **DART 오픈API** — `fnlttSinglAcnt` (단일회사 주요계정). 무료, 하루 2만 건 | **구현됨** `providers/dart.ts` |
| 성장성 | 위 재무제표에서 매출·영업이익 전년비로 산출 | 구현됨 |
| 컨센서스 | 무료 출처 없음. 화면에서 빼는 편이 낫다 (SIGNO 도 애널리스트 박스를 이미 뺐다) | — |
| 뉴스 | 카드를 빼거나 별도 뉴스 API | — |
| 분봉 | 코스콤은 분봉을 주지 않는다. **법인 앱이 코스콤 실시간 시세를 받아 직접 집계해 만들어 두었다** — 5·15·30분·1시간·4시간이 돌아간다(2026-08-31 확인). 다시 만들 필요 없이 그 데이터를 쓰면 된다 | **법인 쪽에 있음** |
| 수급 일별 추이 | 코스콤 투자자 API 는 하루치만 준다. 매일 한 번 받아 쌓는 크론 필요 | — |
| 장중 추정수급 | 대안 없음. 15:30 이후 확정치만 | — |

### DART 어댑터 (`providers/dart.ts`)

DART 는 종목코드가 아니라 **고유번호(corp_code, 8자리)** 로 조회한다.
대응표는 `corpCode.xml` 을 ZIP 으로만 주므로, 받아서 풀고 7일 캐시한다.

주요계정은 원장 금액만 주므로 비율은 어댑터가 만든다.

```
부채비율   = 부채총계 / 자본총계 × 100
영업이익률 = 영업이익 / 매출액   × 100
ROE        = 당기순이익 / 자본총계 × 100
```

**행 제목을 바꾸지 말 것.** 점수 산식(`lib/score.ts`)이 `"ROE"` `"부채비율"`
`"영업이익률"` `"매출액"` `"영업이익"` 을 **이름으로** 찾는다. 제목이 어긋나면
오류 없이 점수만 조용히 비어 버린다.

연결(CFS)을 우선하고 없으면 별도(OFS)를 쓴다. DART 는 확정치만 주므로
컨센서스 열(`periods[].cns`)은 항상 `false` 다.


---

## 5. 자격과 라이선스

- 코스콤 오픈API 는 **개인 신청이 되지 않는다.** 법인 자격이 필요하다.
- 샌드박스 시세는 **개발 지원용으로만** 허용된다. 서비스에 띄우려면
  **시세 라이선스 계약**이 따로 필요하다.
- 승인되면 샌드박스 키를 먼저 받고, 테스트가 끝나면 운영 키를 받는다.
- 해외 데이터는 코스콤 카탈로그에 없다. 미국 화면까지 옮길 계획이라면
  야후 등 별도 출처가 그대로 필요하다.
- 문의 open@koscom.co.kr

---

## 6. 환경변수

```bash
DATA_PROVIDER=koscom          # 비우면 네이버+KIS

KOSCOM_API_BASE=              # 계약 시 안내받은 게이트웨이 주소
KOSCOM_API_KEY=               # API Key 방식
# OAuth2 를 쓰는 경우에만
KOSCOM_OAUTH=1
KOSCOM_CLIENT_ID=
KOSCOM_CLIENT_SECRET=

DART_API_KEY=                 # https://opendart.fss.or.kr 무료 발급
```

키는 `.env.local` 과 배포 환경변수에만 넣는다. 저장소에 올리지 않는다.

---

## 7. 작업 순서

```
1  파일 48개 + 라우트 13개 + globals.css @theme + 글꼴 복사
   → 이것만으로 기업 개요 카드와 테마 칩이 뜬다 (키 필요 없음)
2  KOSCOM_API_BASE / KOSCOM_API_KEY 를 넣고 quote · candles · detail 확인
   → 차트 카드가 뜨면 절반은 된 것
3  DART_API_KEY 를 넣고 FinancialsCard 확인
   corpCode.xml 이 ZIP 이라 첫 호출이 몇 초 걸린다 (7일 캐시)
4  sectorRank 구현 — 아래 주의사항 참고
5  라우트 열둘이 provider 를 부르도록 바꾼다 (머리말 참고)
6  못 주는 것(뉴스·분봉·장중수급)은 빈 값으로 두어 카드가 스스로 숨게 한다
```

### sectorRank 를 만들 때

업종 비교군은 `lists` + `master.idxIndMidclssCd` 로 만들 수 있다. 다만
비교군 전체의 재무를 매번 DART 로 조회하면 **하루 2만 건 제한에 바로 걸린다.**
지금 구조에 이미 답이 있다 — `/api/cron/metrics` 가 종목별 지표를 미리 모아
Redis 에 쌓고(`lib/baseline.ts`), 화면은 쌓인 것만 읽는다. 같은 방식으로
DART 수집을 크론에 넣는다.

`lib/score.ts` 는 손대지 않는다. 원지표만 정확히 넣으면 등급·점수 체계가
그대로 따라온다.

### 첫 호출 때 확인할 것

문서에 단위가 명시되지 않은 값이 둘 있다. 실제 응답을 한 번 보고 맞춘다.

- `master.mktcap` — `koscom.ts` 는 **원** 으로 보고 억원으로 나눈다.
  이미 억원이나 백만원 단위면 `detail()` 의 `capEok` 한 줄만 고치면 된다.
- `history` 의 날짜 필드가 `trdDd`(yyyymmdd) 인지 확인. 다르면 `ymdToSec` 호출부.
