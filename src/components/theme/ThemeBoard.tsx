"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { Tabs } from "@/components/Tabs";
import { useSticky } from "@/lib/useSticky";
import { pct, signColor } from "@/lib/format";
import type { ThemeRow } from "@/lib/theme";

type Sort = "chg" | "chg3d" | "size" | "name";
type Filter = "all" | "up" | "down";

const SORTS: { key: Sort; label: string }[] = [
  { key: "chg", label: "당일" },
  { key: "chg3d", label: "3일" },
  { key: "size", label: "종목수" },
  { key: "name", label: "이름" },
];
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "up", label: "상승" },
  { key: "down", label: "하락" },
];

/** 상승 대 하락 비율을 한 줄로 */
function UpDown({ up, down }: { up: number; down: number }) {
  const total = up + down;
  const w = total ? (up / total) * 100 : 0;
  return (
    <div className="flex h-1 w-14 shrink-0 overflow-hidden rounded-full bg-line">
      <span className="block h-full bg-up" style={{ width: `${w}%` }} />
      <span className="block h-full flex-1 bg-down" />
    </div>
  );
}

/** 검색어와 겹치는 부분을 표시 */
function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[2px] bg-signal/35 text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function ThemeBoard({ onOpen }: { onOpen: (no: string, name: string) => void }) {
  const { data, isLoading, error } = useSWR<{ data: ThemeRow[] }>("/api/themes", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
  const [q, setQ] = useState("");
  const [sort, setSort] = useSticky<Sort>("kr.theme.sort", "chg");
  const [filter, setFilter] = useSticky<Filter>("kr.theme.filter", "all");

  const rows = useMemo(() => {
    const all = data?.data ?? [];
    const needle = q.trim().toLowerCase();
    // 테마명뿐 아니라 주도주 이름으로도 찾게 한다 — "삼성SDI 가 어느 테마에 있지" 가 실제 질문이다
    const hit = needle
      ? all.filter(
          (t) =>
            t.name.toLowerCase().includes(needle) ||
            t.leaders.some((l) => l.name.toLowerCase().includes(needle)),
        )
      : all;
    const kept = hit.filter((t) =>
      filter === "up" ? (t.chg ?? 0) > 0 : filter === "down" ? (t.chg ?? 0) < 0 : true,
    );
    const by: Record<Sort, (a: ThemeRow, b: ThemeRow) => number> = {
      chg: (a, b) => (b.chg ?? -999) - (a.chg ?? -999),
      chg3d: (a, b) => (b.chg3d ?? -999) - (a.chg3d ?? -999),
      size: (a, b) => b.up + b.flat + b.down - (a.up + a.flat + a.down),
      name: (a, b) => a.name.localeCompare(b.name, "ko"),
    };
    return [...kept].sort(by[sort]);
  }, [data, q, sort, filter]);

  const total = data?.data?.length ?? 0;

  return (
    <Card
      title={
        <span>
          테마{" "}
          <span className="tnum font-normal text-muted">
            {rows.length}
            {total && rows.length !== total ? ` / ${total}` : ""}
          </span>
        </span>
      }
      right={
        <div className="flex items-center gap-1.5">
          <Tabs value={filter} onChange={setFilter} items={FILTERS} />
          <Tabs value={sort} onChange={setSort} items={SORTS} />
        </div>
      }
    >
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="shrink-0 text-muted"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="테마명 또는 종목명 — 예: HBM, 삼성SDI"
          aria-label="테마 검색"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="shrink-0 rounded px-1 text-xs text-muted hover:text-fg"
          >
            지우기
          </button>
        )}
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-muted">테마를 불러오지 못했다.</p>
      ) : isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-lg border border-line bg-canvas" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          {q ? `‘${q}’ 와 맞는 테마가 없다.` : "조건에 맞는 테마가 없다."}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <button
              key={t.no}
              type="button"
              onClick={() => onOpen(t.no, t.name)}
              className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3 text-left transition-colors hover:border-brand"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 text-[13px] font-medium leading-snug">
                  <Mark text={t.name} q={q.trim()} />
                </span>
                <span className={`tnum shrink-0 text-sm font-bold ${signColor(t.chg ?? 0)}`}>
                  {t.chg === null ? "—" : pct(t.chg)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] text-muted">
                  {t.leaders.map((l) => l.name).join(", ") || "주도주 없음"}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <UpDown up={t.up} down={t.down} />
                  <span className="tnum text-[10px] text-muted">{t.up + t.flat + t.down}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted">
        정렬은 <b className="font-medium text-fg">당일</b> 등락률 기준이고, 3일은 최근 3거래일
        누적이다. 막대는 테마 안 상승 대 하락 종목 비율.
      </p>
    </Card>
  );
}
