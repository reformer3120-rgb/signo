"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { Tabs } from "@/components/Tabs";
import { useSticky } from "@/lib/useSticky";
import { pct, signColor } from "@/lib/format";
import type { OwnThemeRow } from "@/lib/ownTheme";

type Sort = "chg" | "size" | "name";
type Filter = "all" | "up" | "down";

const SORTS: { key: Sort; label: string }[] = [
  { key: "chg", label: "등락" },
  { key: "size", label: "종목수" },
  { key: "name", label: "이름" },
];
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "up", label: "상승" },
  { key: "down", label: "하락" },
];

/** 상승 대 하락 비율을 한 줄로 */
function UpDown({ up, down, w = 56 }: { up: number; down: number; w?: number }) {
  const total = up + down;
  const r = total ? (up / total) * 100 : 0;
  return (
    <div
      className="flex h-1 shrink-0 overflow-hidden rounded-full bg-line"
      style={{ width: w }}
      aria-hidden="true"
    >
      <span className="block h-full bg-up" style={{ width: `${r}%` }} />
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

interface Group {
  name: string;
  themes: OwnThemeRow[];
  chg: number | null;
  up: number;
  down: number;
  stocks: number;
}

export function ThemeBoard({ onOpen }: { onOpen: (no: string, name: string) => void }) {
  const { data, isLoading, error } = useSWR<{ data: OwnThemeRow[]; stale?: boolean }>(
    "/api/themes",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 120_000 },
  );
  const [q, setQ] = useState("");
  const [sort, setSort] = useSticky<Sort>("kr.theme.sort", "chg");
  const [filter, setFilter] = useSticky<Filter>("kr.theme.filter", "all");
  // 어느 대분류를 펼쳐 두었는지 기억한다
  const [open, setOpen] = useSticky<string[]>("kr.theme.open", []);

  const needle = q.trim().toLowerCase();

  const { groups, shown, total } = useMemo(() => {
    const all = data?.data ?? [];
    const hit = needle
      ? all.filter(
          (t) =>
            t.name.toLowerCase().includes(needle) ||
            t.hint.toLowerCase().includes(needle) ||
            t.group.toLowerCase().includes(needle) ||
            t.leaders.some((l) => l.name.toLowerCase().includes(needle)),
        )
      : all;
    const kept = hit.filter((t) =>
      filter === "up" ? (t.chg ?? 0) > 0 : filter === "down" ? (t.chg ?? 0) < 0 : true,
    );

    const by: Record<Sort, (a: OwnThemeRow, b: OwnThemeRow) => number> = {
      chg: (a, b) => (b.chg ?? -999) - (a.chg ?? -999),
      size: (a, b) => b.count - a.count,
      name: (a, b) => a.name.localeCompare(b.name, "ko"),
    };

    const map = new Map<string, OwnThemeRow[]>();
    for (const t of kept) map.set(t.group, [...(map.get(t.group) ?? []), t]);

    const gs: Group[] = [...map.entries()].map(([name, themes]) => {
      const sorted = [...themes].sort(by[sort]);
      const chgs = themes.map((t) => t.chg).filter((c): c is number => c !== null);
      return {
        name,
        themes: sorted,
        chg: chgs.length ? +(chgs.reduce((a, b) => a + b, 0) / chgs.length).toFixed(2) : null,
        up: themes.reduce((a, t) => a + t.up, 0),
        down: themes.reduce((a, t) => a + t.down, 0),
        stocks: themes.reduce((a, t) => a + t.count, 0),
      };
    });
    // 대분류끼리도 같은 기준으로 줄 세운다 (이름순만 이름으로)
    gs.sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name, "ko") : (b.chg ?? -999) - (a.chg ?? -999),
    );
    return { groups: gs, shown: kept.length, total: all.length };
  }, [data, needle, sort, filter]);

  // 찾는 중에는 걸린 것이 바로 보여야 한다. 접어 두면 못 찾은 것처럼 보인다.
  const expanded = (name: string) => needle.length > 0 || open.includes(name);
  const toggle = (name: string) =>
    setOpen(open.includes(name) ? open.filter((x) => x !== name) : [...open, name]);

  return (
    <Card
      title={
        <span>
          테마{" "}
          <span className="tnum font-normal text-muted">
            {shown}
            {total && shown !== total ? ` / ${total}` : ""}
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
          placeholder="테마·종목·설명 — 예: HBM, 양극재, 삼성SDI"
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
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg border border-line bg-canvas" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          {q ? `‘${q}’ 와 맞는 테마가 없다.` : "조건에 맞는 테마가 없다."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {groups.map((g) => {
            const on = expanded(g.name);
            return (
              <div key={g.name} className="overflow-hidden rounded-lg border border-line">
                <button
                  type="button"
                  onClick={() => toggle(g.name)}
                  aria-expanded={on}
                  className="flex w-full items-center gap-2.5 bg-canvas px-3 py-2.5 text-left transition-colors hover:bg-surface"
                >
                  <span
                    className={`shrink-0 text-[10px] text-muted transition-transform ${on ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  >
                    ▶
                  </span>
                  <span className="text-[13px] font-semibold">
                    <Mark text={g.name} q={needle} />
                  </span>
                  <span className="tnum text-[11px] text-muted">
                    테마 {g.themes.length} · {g.stocks}종목
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <UpDown up={g.up} down={g.down} />
                    <span className={`tnum w-14 text-right text-sm font-bold ${signColor(g.chg ?? 0)}`}>
                      {g.chg === null ? "—" : pct(g.chg)}
                    </span>
                  </span>
                </button>

                {on && (
                  <ul className="flex flex-col border-t border-line bg-surface/40">
                    {g.themes.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(t.id, t.name)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 pl-8 text-left transition-colors hover:bg-canvas"
                        >
                          <span className="min-w-0 truncate text-[12.5px]">
                            <Mark text={t.name} q={needle} />
                          </span>
                          <span className="tnum shrink-0 text-[10.5px] text-muted">{t.count}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            <span className="hidden max-w-[9rem] truncate text-[11px] text-muted sm:block">
                              {t.leaders.map((l) => l.name).join(", ")}
                            </span>
                            <UpDown up={t.up} down={t.down} w={40} />
                            <span
                              className={`tnum w-14 text-right text-[12.5px] font-medium ${signColor(t.chg ?? 0)}`}
                            >
                              {t.chg === null ? "—" : pct(t.chg)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        테마 분류와 편입 사유는{" "}
        <b className="font-medium text-fg">SIGNO 가 DART 사업보고서로 직접 만든 것</b>이다.
        등락률은 편입 종목의 단순 평균이고, 막대는 상승 대 하락 비율이다.
        {data?.stale && <span className="text-signal"> · 장 시작 전이라 직전 거래일 기준</span>}
      </p>
    </Card>
  );
}
