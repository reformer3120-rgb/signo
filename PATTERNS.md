# SIGNO 구조 참고서

다른 앱을 만들 때 **UI 배치와 데이터 흐름을 그대로 베껴 쓰라고** 만든 문서다.
이 파일 하나만 읽으면 전체 그림이 잡히도록, 구간별로 "어디를 보면 되는지 · 실제
코드 · 왜 이렇게 했는지 · 옮길 때 주의할 점"을 함께 적었다.

주식 앱이 아니어도 **주기적으로 갱신되는 데이터를 카드로 늘어놓는 화면**이면
그대로 통한다. 대시보드, 모니터링 콘솔, 리포트 화면 등.

---

## 전체 지도 — 요청 하나가 흐르는 길

```
[화면]  page.tsx
           └ Section (Card + SWR)          ← 화면 조립은 여기까지만
                │  useSWR("/api/xxx")
                ▼
[서버]  app/api/xxx/route.ts               ← 얇은 껍데기. 캐시만 씌운다
                │  cached(key, ttl, fn)
                ▼
        lib/cache.ts                       ← Redis 또는 인메모리
                │  (없으면)
                ▼
        lib/naverApi.ts · us.ts · kis.ts   ← 바깥 세상과 이야기하는 유일한 곳
                │
                ▼
        외부 API (네이버 · 야후 · 증권사)
```

원칙 하나만 지키면 된다. **바깥 데이터를 만지는 코드는 `lib/` 안에만 둔다.**
라우트는 캐시를 씌워 부르기만 하고, 컴포넌트는 `fetch` 를 직접 쓰지 않는다.
이 경계가 무너지면 캐시 정책이 흩어지고 같은 데이터를 두 번 받게 된다.

| 구간 | 파일 | 한 줄 요약 |
|---|---|---|
| 1 디자인 토큰 | `app/globals.css` | 색·반경·글꼴을 한 곳에서, 라이트/다크 자동 전환 |
| 2 레이아웃 셸 | `app/layout.tsx` | 폰트·다크모드·컨테이너·푸터. 모든 화면의 틀 |
| 3 화면 조립 | `app/page.tsx` + `Card.tsx` | 화면 = 카드 나열. 카드는 제목/우측슬롯/본문 |
| 4 데이터 흐름 | `lib/swr.ts` + `api/*/route.ts` | SWR로 당기고 라우트는 캐시만 씌운다 |
| 5 캐시 | `lib/cache.ts` | 배포마다 키가 갈린다 |
| 6 어댑터 | `lib/naverApi.ts` `us.ts` | 외부 API를 우리 타입으로 번역 |
| 7 표시 규칙 | `lib/format.ts` | 숫자·색을 함수로 통일 |
| 8 상태 유지 | `lib/useSticky.ts` | 화면을 옮겨도 설정이 남는다 |
| 9 겹침 방지 | `lib/useStickyOffset.ts` | 고정 요소들이 서로 높이를 몰라도 쌓인다 |
| 10 차트 | `components/CandleChart.tsx` | 갱신돼도 보던 구간이 유지된다 |

---

## 구간 1 — 디자인 토큰

**볼 곳** `src/app/globals.css`

색을 컴포넌트에 직접 쓰지 않는다. 토큰을 정의하고 Tailwind 클래스로만 쓴다.
라이트/다크는 **같은 이름의 변수 값만 바꿔서** 전환한다 — 컴포넌트는 아무것도 모른다.

```css
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-brand: #3844be;
  /* 값을 직접 쓰지 않고 아래 :root/.dark 변수를 가리킨다 */
  --color-up: var(--up);
  --color-down: var(--down);
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-line: var(--line);
  --radius-md: 12px;
}

:root      { --canvas:#ffffff; --surface:#f5f6fa; --up:#e23d3d; --down:#2e77c9; }
.dark      { --canvas:#0b0c15; --surface:#171a2b; --up:#ff6b6b; --down:#63a8f5; }
```

이러면 컴포넌트는 `bg-surface text-fg border-line` 만 쓰면 되고, 테마를 바꿔도
컴포넌트를 한 줄도 안 고친다.

> **다른 앱에 옮길 때** — 색 이름을 `red-500` 같은 색깔 이름이 아니라 `up/down`,
> `canvas/surface` 처럼 **역할 이름**으로 지어야 의미가 산다. 여기선 한국 관례에 따라
> 상승이 빨강인데, 미국식 앱이라면 `--up` 값만 초록으로 바꾸면 끝난다.

---

## 구간 2 — 레이아웃 셸

**볼 곳** `src/app/layout.tsx`

모든 화면이 공유하는 틀. 여기서 정하는 것은 넷이다.

```tsx
<body className="min-h-full flex flex-col bg-canvas text-fg">
  <div className="mx-auto w-full max-w-6xl px-4 py-5 flex flex-col gap-4">
    <SignoHeader />   {/* 1. 브랜드 헤더 */}
    <Nav />           {/* 2. 2단 내비게이션 (시장 → 하위 화면) */}
    {children}        {/* 3. 화면 본문 — 카드들이 여기 쌓인다 */}
    <footer>…</footer>{/* 4. 고지·출처 */}
  </div>
</body>
```

`flex flex-col gap-4` 하나로 **카드 사이 간격이 전 화면에서 자동으로 같아진다.**
각 화면은 마진을 신경 쓰지 않고 카드만 나열하면 된다.

### 다크모드 깜빡임 막기

```tsx
<head>
  <script dangerouslySetInnerHTML={{ __html:
    `try{var t=localStorage.getItem('signo-theme');
      if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))
        document.documentElement.classList.add('dark');}catch(e){}` }} />
</head>
```

React가 뜨기 **전에** 클래스를 붙여야 한다. 컴포넌트에서 `useEffect` 로 처리하면
첫 프레임에 흰 화면이 번쩍인다.

---

## 구간 3 — 화면 조립

**볼 곳** `src/app/page.tsx` · `src/components/Card.tsx`

화면은 **카드를 순서대로 늘어놓은 것**이 전부다. 로직이 없다.

```tsx
export default function Home() {
  return (
    <>
      <CloseReportButton />
      <IndexSection />      {/* 각 섹션이 자기 데이터를 알아서 가져온다 */}
      <DepositSection />
      <MarketFlowSection />
      <SectorSection />
      <MoversSection />
      <MarketCapSection />
    </>
  );
}
```

배치를 바꾸려면 이 줄 순서만 바꾸면 된다. 섹션끼리는 서로를 모른다.

### Card — 화면의 유일한 그릇

```tsx
export function Card({ title, right, children, className = "" }) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-…">
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 flex-wrap px-4 pt-3.5 pb-2">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {/* right: 탭·토글·배지가 들어가는 자리. 좁으면 가로 스크롤 */}
          {right && <div className="min-w-0 max-w-full overflow-x-auto">{right}</div>}
        </header>
      )}
      <div className="px-4 pb-4 pt-1">{children}</div>
    </section>
  );
}
```

**`right` 슬롯 하나가 이 구조의 핵심이다.** 봉주기 탭, 통화 토글, 세션 배지, 데이터
출처 표기가 전부 이 자리에 들어간다. 카드마다 헤더를 따로 만들지 않아도 되고,
어느 카드든 제목 오른쪽에 컨트롤이 오는 규칙이 저절로 지켜진다.

> **옮길 때** — Card를 먼저 만들고 그 다음에 화면을 만들어라. 카드를 나중에 뽑아내려
> 하면 이미 제각각이 된 헤더들을 다 뜯어고쳐야 한다.

---

## 구간 4 — 데이터 흐름

**볼 곳** `src/lib/swr.ts` · `src/app/api/sectors/route.ts` · 아무 `sections/*.tsx`

### 화면 쪽 — 섹션이 자기 데이터를 직접 당긴다

```tsx
const { data, isLoading } = useSWR<{ data: Sector[] }>("/api/sectors", fetcher, {
  refreshInterval: 60_000,     // 갱신 주기를 데이터 성격에 맞게
});

{isLoading && !data
  ? <div className="h-64 animate-pulse rounded-lg bg-line/30" />   // 뼈대
  : <실제내용 />}
```

부모가 데이터를 받아 자식에게 내려주지 **않는다.** 섹션이 스스로 가져온다.
같은 URL을 여러 컴포넌트가 요청해도 SWR이 알아서 하나로 합친다(중복 제거).

갱신 주기 기준:

| 성격 | 주기 | 예 |
|---|---|---|
| 실시간 시세 | 30초 | 지수, 종목 현재가 |
| 수급·순위 | 60초 | 투자자수급, 섹터, 특징주 |
| 지표·환율 | 2~5분 | 시장지표, 국채금리 |
| 하루 한 번 바뀌는 것 | 10~30분 | 재무제표, 캘린더, 증시자금 |

**뼈대(skeleton) 규칙** — `isLoading && !data` 일 때만 뼈대를 보여준다. `isLoading` 만
보면 갱신할 때마다 화면이 깜빡인다. **이미 데이터가 있으면 옛 값을 계속 보여주고
조용히 갈아끼운다.**

### 서버 쪽 — 라우트는 얇게

```ts
export const revalidate = 0;                    // Next 캐시 끄고 우리 캐시만 쓴다

export async function GET() {
  try {
    const data = await cached("sectors", 60, sectors);   // 키 · TTL · 실제 함수
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
```

라우트에 로직을 넣지 않는다. 파라미터가 있으면 **검증만** 하고 넘긴다.

```ts
const code = (searchParams.get("code") || "005930").replace(/\D/g, "");  // 숫자만
const raw = searchParams.get("group") || "industry";
const group = /^theme:\d+$/.test(raw) ? raw : "industry";                // 화이트리스트
```

바깥에서 들어온 값이 그대로 외부 API URL이나 캐시 키에 들어가지 않게 한다.

---

## 구간 5 — 캐시

**볼 곳** `src/lib/cache.ts`

```ts
// 배포가 바뀌면 캐시도 함께 갈린다
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>) {
  const k = `${BUILD}:${key}`;
  if (redis) {
    const hit = await redis.get<T>(k);
    if (hit != null) return hit;
    const v = await fn();
    await redis.set(k, v, { ex: ttlSec });
    return v;
  }
  /* Redis가 없으면 인메모리 Map으로 폴백 */
}
```

**`BUILD` 접두사가 이 파일에서 가장 중요하다.** 응답 형태를 바꿔 배포했는데
캐시에 옛 형태가 남아 있으면, 새 화면 코드가 없는 필드를 읽다가 페이지가 통째로
죽는다. 실제로 겪었다. 배포 식별자를 붙여두면 이 사고가 구조적으로 안 난다.

> **주의** — 로컬은 인메모리라 재시작하면 비워진다. 이 부류의 버그는 **로컬에서
> 절대 재현되지 않는다.** 운영에서만 터진다.

---

## 구간 6 — 외부 데이터 어댑터

**볼 곳** `src/lib/naverApi.ts` · `us.ts` · `kis.ts`

외부 응답을 **그대로 화면까지 흘려보내지 않는다.** 우리 타입으로 번역해서 내보낸다.

```ts
export interface Sector {          // ← 우리 타입 (화면이 아는 형태)
  code: string; name: string; changeRate: number;
  rise: number; fall: number; steady: number; count: number;
}

export async function sectors(): Promise<Sector[]> {
  const d = await getJson(`https://…/industry?market=KOSPI&pageSize=100`);
  return ((d.groups ?? []) as RawGroup[]).map((g) => ({   // ← 여기서 번역
    code: String(g.no ?? ""),
    name: g.name,
    changeRate: Number(g.changeRate) || 0,
    …
  }));
}
```

이 경계가 있어서 **데이터 출처를 갈아끼워도 화면을 안 고친다.** 미국 주간거래를
야후에서 KIS로 바꿀 때 화면은 한 줄도 안 바뀌었다.

### 없으면 없는 대로 — 기능 단위 폴백

```ts
export function hasKIS(): boolean {
  return !!(process.env.KIS_APP_KEY?.trim() && process.env.KIS_APP_SECRET?.trim());
}

// 부르는 쪽
if (hasKIS()) { try { program = await programTrade(market); } catch { program = 0; } }
```

키가 없거나 외부 API가 죽어도 **그 조각만 비고 나머지 화면은 산다.** 여러 곳에서
모을 때는 실패를 개별로 삼킨다.

```ts
const [indices, sectors, movers, caps] = await Promise.all([
  usIndices().catch(() => []),      // 하나가 실패해도
  usSectors().catch(() => []),      // 나머지는 살린다
  usMovers("gainers").catch(() => []),
  usMarketCap(15).catch(() => []),
]);
```

---

## 구간 7 — 표시 규칙

**볼 곳** `src/lib/format.ts`

숫자 포맷과 색을 컴포넌트마다 따로 쓰면 반드시 어긋난다. 함수로 못 박는다.

```ts
export const num = (n, digits = 0) => n.toLocaleString("ko-KR", {…});
export const pct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

/** 상승=빨강 / 하락=파랑 / 보합=흐림 — 한국 관례 */
export const signColor = (n) => n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted";

/** 억/조 축약 */
export function compactWon(n) { … }   // 1.2조 · 3,400억 · 500만
```

쓰는 쪽은 이렇게만 한다.

```tsx
<span className={`tnum ${signColor(x.changePct)}`}>{pct(x.changePct)}</span>
```

`tnum` 은 `font-variant-numeric: tabular-nums` 로, **숫자 폭을 고정**해서 값이
바뀔 때 자릿수가 흔들리지 않게 한다. 실시간 갱신 화면에서는 이게 없으면
숫자가 계속 덜컹거린다.

---

## 구간 8 — 화면을 옮겨도 남는 설정

**볼 곳** `src/lib/useSticky.ts`

```ts
export function useSticky<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {                                   // 마운트 후에 읽는다
    try { const raw = localStorage.getItem(`signo:${key}`);
      if (raw !== null) setValue(JSON.parse(raw)); } catch {}
  }, [key]);
  const set = (v: T) => { setValue(v);
    try { localStorage.setItem(`signo:${key}`, JSON.stringify(v)); } catch {} };
  return [value, set];
}
```

`useState` 자리에 그대로 바꿔 끼우면 끝이다.

```tsx
const [tab, setTab] = useSticky("kr.stock.tab", "1D");    // 봉주기가 기억된다
```

**초기값을 localStorage에서 바로 읽으면 안 된다.** 서버 렌더 결과와 달라져
하이드레이션 오류가 난다. 반드시 마운트 후 `useEffect` 에서 덮어쓴다.

**보관 기간을 구분한다** — 오래 남길 설정은 `localStorage`, 창을 닫으면 지울 것은
`sessionStorage`(차트 확대 구간이 그렇다).

---

## 구간 9 — 고정 요소 겹침 방지

**볼 곳** `src/lib/useStickyOffset.ts`

화면 위쪽에 `sticky` 요소가 둘 이상 쌓이면, 아래 것이 위 것의 높이를 알아야 한다.
`top-[3.4rem]` 처럼 숫자를 박으면 위 요소가 커지는 순간 가려진다. **실제로 겪었다.**

```ts
// 요소가 자기 높이를 CSS 변수로 알린다
export function usePublishHeight(ref, cssVar, extra = 0) {
  useEffect(() => {
    const publish = () => document.documentElement.style
      .setProperty(cssVar, `${Math.round(el.getBoundingClientRect().height + extra)}px`);
    publish();
    const ro = new ResizeObserver(publish);   // 줄바꿈·창 크기 변화도 따라간다
    ro.observe(el);
    …
  }, …);
}
```

```tsx
// 위: 네비가 자기 바닥 위치를 알린다
usePublishHeight(navRef, "--nav-bottom", 8);

// 아래: 그 값을 기준으로 붙는다
<div style={{ top: "calc(var(--nav-bottom, 90px) + 4px)" }} className="sticky z-20">
```

숫자를 아무도 알 필요가 없어진다. 네비가 1단에서 2단이 돼도 아래가 알아서 밀린다.

---

## 구간 10 — 차트

**볼 곳** `src/components/CandleChart.tsx`

lightweight-charts 를 감싼 컴포넌트. 다른 앱에도 그대로 쓸 만한 부분만 적는다.

### 사용자가 맞춰둔 화면을 지켜준다

차트는 데이터가 갱신될 때마다 다시 그려진다. 아무 조치를 안 하면 **1분마다
사용자가 확대해 둔 구간이 전체 보기로 튕긴다.**

```ts
const saved = loadView(viewKey);           // sessionStorage
if (saved) {
  const atEnd = saved.to >= saved.len - 1.5;          // 오른쪽 끝을 보고 있었으면
  const shift = atEnd ? data.length - saved.len : 0;  // 새 봉만큼 밀어 계속 따라간다
  ts.setVisibleLogicalRange({ from: saved.from + shift, to: saved.to + shift });
} else ts.fitContent();

let armed = false;
setTimeout(() => (armed = true), 300);     // 되살리는 동안의 변경은 저장하지 않는다
ts.subscribeVisibleLogicalRangeChange((r) => { if (armed) saveView(viewKey, …); });
```

`viewKey` 를 `종목:거래소:봉주기` 로 잡아 **일봉에서 맞춘 구간이 주봉으로 옮겨가지
않게** 한다.

### 캔버스는 CSS 변수를 못 읽는다

```ts
// ✗ fontFamily: "var(--font-space-mono), monospace"
//   → 지정이 통째로 무시되고 기본 비례폭 글꼴로 그려진다
// ✓ 실제 글꼴 이름으로 풀어서 넘긴다
function chartFont() {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-space-mono").trim();
  return v ? `${v}, monospace` : "monospace";
}
```

이걸 놓쳐서 축 라벨 상자 크기가 글자마다 달라지는 문제가 있었다.
**캔버스에 그리는 모든 것(차트·그래픽)은 CSS 변수를 직접 못 쓴다.**

---

## 다른 앱으로 옮길 때 순서

1. **`globals.css` 토큰부터.** 색 이름을 역할로 짓고 라이트/다크 값을 채운다.
2. **`layout.tsx` 셸.** 컨테이너 폭 + `flex flex-col gap-4` + 다크모드 부트스트랩.
3. **`Card.tsx`.** `title` / `right` / `children` 세 구멍. 이걸 먼저 만든다.
4. **`lib/format.ts`.** 숫자·색 함수. 화면을 쓰기 전에 정해둔다.
5. **`lib/cache.ts`.** 배포 식별자 접두사를 빼먹지 않는다.
6. **어댑터 하나 + 라우트 하나 + 섹션 하나**를 끝까지 관통해 본다.
   여기까지 되면 나머지는 복붙이다.
7. 그 다음에 `useSticky` · `usePublishHeight` 같은 편의 훅을 붙인다.

가져다 쓸 만한 파일 (거의 그대로 복사 가능):

```
lib/cache.ts            캐시 (배포 접두사 포함)
lib/swr.ts              fetcher
lib/useSticky.ts        설정 유지
lib/useStickyOffset.ts  고정 요소 쌓기
components/Card.tsx     카드 그릇
app/globals.css         토큰 구조 (값만 갈아끼우면 됨)
```

도메인에 묶여 있어 참고만 할 것: `lib/naverApi.ts` `us.ts` `kis.ts` `score.ts`
`session.ts` — 다만 **어댑터 패턴 · 폴백 방식 · 공용 규칙 모듈**이라는 구조 자체는
어느 도메인에나 그대로 적용된다.
