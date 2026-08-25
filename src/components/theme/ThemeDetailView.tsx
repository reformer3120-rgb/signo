"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { Tabs } from "@/components/Tabs";
import { ThemeChart } from "./ThemeChart";
import { useSticky } from "@/lib/useSticky";
import { pct, signColor, won } from "@/lib/format";
import type { OwnThemeDetail, OwnThemeStock } from "@/lib/ownTheme";

type Sort = "chg" | "cap" | "name";

const SORTS: { key: Sort; label: string }[] = [
  { key: "chg", label: "등락순" },
  { key: "cap", label: "시총순" },
  { key: "name", label: "이름순" },
];

/** 억원 단위로 들어온 시가총액을 조/억으로 */
function cap(n: number | null): string {
  if (n === null) return "—";
  return n >= 10_000 ? `${(n / 10_000).toFixed(2)}조` : `${won(n)}억`;
}

/** 상승 · 보합 · 하락 구성비를 한 줄 막대로 */
function Composition({ up, flat, down }: { up: number; flat: number; down: number }) {
  const t = up + flat + down || 1;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
      <span className="block h-full bg-up" style={{ width: `${(up / t) * 100}%` }} />
      <span className="block h-full bg-muted/40" style={{ width: `${(flat / t) * 100}%` }} />
      <span className="block h-full bg-down" style={{ width: `${(down / t) * 100}%` }} />
    </div>
  );
}

/** 지표 한 개. 이름과 값을 한 줄에 붙여 쓴다 */
function Metric({ k, v, tone }: { k: string; v: string; tone?: number | null }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-md bg-surface px-2 py-1">
      <span className="text-[10px] text-muted">{k}</span>
      <span
        className={`tnum text-[11.5px] font-medium ${
          tone === null || tone === undefined ? "" : signColor(tone)
        }`}
      >
        {v}
      </span>
    </span>
  );
}

function StockCard({
  s,
  onPick,
}: {
  s: OwnThemeStock;
  onPick: (code: string, name: string) => void;
}) {
  return (
    <li className="flex flex-col rounded-lg border border-line bg-canvas p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onPick(s.code, s.name)}
          className="min-w-0 text-left text-sm font-medium hover:text-brand hover:underline"
        >
          {s.name}
        </button>
        <div className="shrink-0 text-right">
          <div className="tnum text-sm font-medium">{s.price === null ? "—" : won(s.price)}</div>
          <div className={`tnum text-[12px] font-bold ${signColor(s.chg ?? 0)}`}>
            {s.chg === null ? "—" : pct(s.chg)}
          </div>
        </div>
      </div>

      {s.why && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{s.why}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        <Metric k="시가총액" v={cap(s.cap)} />
        <Metric k="매출성장" v={s.growth === null ? "—" : pct(s.growth)} tone={s.growth} />
        <Metric k="영업이익률" v={s.opm === null ? "—" : pct(s.opm)} tone={s.opm} />
        <Metric k="PER" v={s.per === null ? "—" : `${s.per.toFixed(2)}배`} />
      </div>
    </li>
  );
}

export function ThemeDetailView({
  no,
  fallbackName,
  onBack,
}: {
  no: string;
  fallbackName?: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const { data, isLoading, error } = useSWR<{ data: OwnThemeDetail }>(`/api/themes/${no}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
  const [sort, setSort] = useSticky<Sort>("kr.theme.stockSort", "chg");
  const d = data?.data;

  const stocks = useMemo(() => {
    const list = d?.stocks ?? [];
    const by: Record<Sort, (a: OwnThemeStock, b: OwnThemeStock) => number> = {
      chg: (a, b) => (b.chg ?? -999) - (a.chg ?? -999),
      cap: (a, b) => (b.cap ?? -1) - (a.cap ?? -1),
      name: (a, b) => a.name.localeCompare(b.name, "ko"),
    };
    return [...list].sort(by[sort]);
  }, [d, sort]);

  // 시총 가중과 단순 평균의 차이 — 대형주가 끌었는지 소형주가 끌었는지
  const gap =
    d && d.weighted !== null && d.chg !== null ? d.weighted - d.chg : null;

  const pick = (code: string, name: string) =>
    router.push(`/stock?code=${code}&name=${encodeURIComponent(name)}`);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:text-fg"
          >
            ← 테마
          </button>
          <span>{d?.name || fallbackName || "테마"}</span>
          {d && (
            <span className={`tnum text-sm font-bold ${signColor(d.chg ?? 0)}`}>
              {d.chg === null ? "" : pct(d.chg)}
            </span>
          )}
        </span>
      }
      right={<Tabs value={sort} onChange={setSort} items={SORTS} />}
    >
      {error ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <p className="text-sm text-muted">
            {/* fetcher 가 상태 코드를 메시지로 던진다 */}
            {String(error?.message) === "404" ? "그런 테마가 없다." : "테마를 불러오지 못했다."}
          </p>
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-line px-3 py-1 text-[11px] font-medium text-muted transition-colors hover:text-fg"
          >
            테마 목록으로
          </button>
        </div>
      ) : isLoading || !d ? (
        <div className="flex flex-col gap-2">
          <div className="h-16 animate-pulse rounded-lg bg-line/30" />
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-line/20" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* 요약 — 테마가 어떻게 움직였고, 그 안에서 어디가 끌었는가 */}
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[11px] text-muted">
              <span className="flex items-baseline gap-1.5">
                평균
                <b className={`tnum text-sm font-bold ${signColor(d.chg ?? 0)}`}>
                  {d.chg === null ? "—" : pct(d.chg)}
                </b>
              </span>
              {d.weighted !== null && (
                <span className="flex items-baseline gap-1.5">
                  시총 가중
                  <b className={`tnum text-sm font-semibold ${signColor(d.weighted)}`}>
                    {pct(d.weighted)}
                  </b>
                </span>
              )}
              <span className="tnum ml-auto">
                {d.count}종목 · 상승 <b className="font-medium text-up">{d.up}</b> · 보합{" "}
                <b className="font-medium text-fg">{d.flat}</b> · 하락{" "}
                <b className="font-medium text-down">{d.down}</b>
              </span>
            </div>
            <Composition up={d.up} flat={d.flat} down={d.down} />
            {gap !== null && (
              <p className="text-[11.5px] leading-relaxed text-muted">
                {Math.abs(gap) < 0.5 ? (
                  <>크기와 상관없이 고르게 움직였다.</>
                ) : gap > 0 ? (
                  <>
                    <b className="font-medium text-fg">대형주가 끌었다</b> — 시총으로 가중하면{" "}
                    <span className="tnum">{gap.toFixed(2)}%p</span> 높다.
                  </>
                ) : (
                  <>
                    <b className="font-medium text-fg">소형주가 끌었다</b> — 시총으로 가중하면{" "}
                    <span className="tnum">{Math.abs(gap).toFixed(2)}%p</span> 낮다.
                  </>
                )}
              </p>
            )}
          </div>

          {/* 테마를 우리가 정의했으므로, 무엇을 묶은 것인지도 우리 말로 밝힌다 */}
          {d.hint && (
            <p className="mt-2 rounded-lg bg-canvas p-3 text-[12px] leading-relaxed text-muted">
              <b className="font-medium text-fg">무엇을 묶었나 </b>
              {d.hint}
            </p>
          )}

          <div className="mt-2">
            <ThemeChart id={d.id} name={d.name} />
          </div>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {stocks.map((s) => (
              <StockCard key={s.code} s={s} onPick={pick} />
            ))}
          </ul>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            편입 사유는 그 종목의 <b className="font-medium text-fg">사업보고서에서 뽑은 문장</b>이다.
            테마 분류도 SIGNO 가 직접 만든 것이다. 매출성장·영업이익률은 DART 확정 실적,
            시가총액·PER 은 한국투자증권 시세 기준.
            {d.stale && <span className="text-signal"> · 장 시작 전이라 직전 거래일 기준</span>}
          </p>
        </>
      )}
    </Card>
  );
}
