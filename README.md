# SIGNO — 실시간 AI 주식 시그널 · KRX 마켓 대시보드

Next.js 16 · React 19 · Tailwind 4 · SWR 기반 KRX 마켓 대시보드.

## 실행

```bash
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드 (Vercel)
```

## 스택 / 데이터

| 계층 | 기술 |
|---|---|
| 프론트 | Next.js 16 (App Router, Turbopack), React 19, Tailwind 4, SWR |
| 백엔드 | Next.js API Routes (`src/app/api/*`) |
| 데이터 | **폴백 모드**: Yahoo Finance(지수·환율·원자재·가상자산·미국채), 네이버 금융(종목 시세·분봉) |
| 예정 | KIS API(프로그램매매·선물옵션·실시간·투자자수급), Claude Sonnet(AI 브리핑), Upstash Redis(캐시) |

> 현재 API 키 없이 **Yahoo/네이버 폴백**으로 동작. `.env.example` 참고해 키를 채우면 KIS/Claude/Redis가 자동 활성화됩니다(`src/lib/kis.ts`, `cache.ts`).

## 구조

```
src/
  app/
    layout.tsx          # 폰트(Pretendard/Space Grotesk/Space Mono), 다크모드 부트스트랩
    page.tsx            # 대시보드 조립
    globals.css         # 시그노 디자인 토큰 → Tailwind @theme
    api/                # indices, fx, macro, ohlcv, quote
  components/
    SignoHeader, ThemeToggle, Card, MetricTile, CandleChart
    sections/           # IndexSection, FxSection, MacroSection, StockSection
  lib/
    yahoo, naver, kis(스텁), cache, format, types, tickers, swr
public/
  brand/                # signo-icon.png, signo-logo.png
  fonts/                # PretendardVariable.woff2
```

## 디자인 토큰 (Signo v0.2)

브랜드 인디고 `#3844BE`, **상승=빨강 `#E23D3D` / 하락=파랑 `#2E77C9`**(한국 관례).
`globals.css`의 `@theme`에서 관리, 라이트/다크 표면색 전환.

## 남은 섹션 (10-섹션 리포트)

수급 정리·프로그램매매·주변자금·장중흐름·섹터·장내특이점·특징주·다음거래일 전망·시총상위·AI 브리핑.
대부분 KIS API + Claude 연동으로 구현 예정.
