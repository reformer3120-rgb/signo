"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { Tabs } from "@/components/Tabs";
import { useSticky } from "@/lib/useSticky";
import { pct, signColor } from "@/lib/format";
import type { DailySignal, OwnThemeRow } from "@/lib/ownTheme";

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

/**
 * 오늘의 신호 띠.
 *
 * 크로스는 상태가 아니라 사건이라 목록 위에 따로 세운다. 종목 이름만 늘어놓지
 * 않고 테마로 묶는다 — 신호가 한 테마에 몰렸는지가 종목 하나가 신호를 냈다는
 * 사실보다 값어치 있다.
 *
 * 추세가 받쳐 주는 것만 센다. 그러지 않으면 지금 장세에서 621건이 걸려
 * 아무것도 못 고른다 (lib/score.ts 머리말).
 */
function SignalStrip({
  rows,
  onOpen,
  themes,
}: {
  rows: DailySignal[];
  themes: OwnThemeRow[];
  onOpen: (no: string, name: string) => void;
}) {
  const byTheme = useMemo(() => {
    const m = new Map<string, DailySignal[]>();
    for (const r of rows) m.set(r.theme, [...(m.get(r.theme) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);
  if (!rows.length) return null;
  const idOf = (name: string) => themes.find((t) => t.name === name)?.id;

  return (
    <div className="mb-3 rounded-lg border border-up/25 bg-up/5 px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[11px] font-semibold text-up">최근 5거래일 골든크로스</span>
        <span className="tnum text-[11px] text-muted">
          {rows.length}종목 · {byTheme.length}개 테마
        </span>
        <span className="ml-auto hidden text-[10px] text-muted sm:inline">
          60일선 방향과 거래량이 뒷받침하는 것만
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {byTheme.slice(0, 5).map(([theme, list]) => {
          const id = idOf(theme);
          return (
            <li key={theme} className="flex items-baseline gap-2 text-[12px]">
              {id ? (
                <button
                  type="button"
                  onClick={() => onOpen(id, theme)}
                  className="shrink-0 font-medium hover:text-brand hover:underline"
                >
                  {theme}
                </button>
              ) : (
                <span className="shrink-0 font-medium">{theme}</span>
              )}
              <span className="tnum shrink-0 text-[10.5px] text-muted">{list.length}</span>
              <span className="min-w-0 truncate text-[11.5px] text-muted">
                {list.slice(0, 5).map((r) => `${r.name} ${r.days}일 전`).join(", ")}
                {list.length > 5 && ` 외 ${list.length - 5}`}
              </span>
            </li>
          );
        })}
      </ul>
      {byTheme.length > 5 && (
        <p className="mt-1 text-[10.5px] text-muted">외 {byTheme.length - 5}개 테마</p>
      )}
    </div>
  );
}

/**
 * 기간 수익률 넉 줄 — 1D · 1W · 1M · 1Y.
 *
 * 오늘 등락률만 보면 테마가 계속 오르고 있는지 오늘만 튄 것인지 못 가른다.
 * 넷을 나란히 놓으면 그게 갈린다 — 1D 만 붉고 나머지가 파라면 오늘 반등한
 * 것이고, 넷이 다 붉으면 추세다.
 *
 * 크론이 절반도 안 훑은 테마는 기간 값이 없다. 그때는 1D 만 적고 나머지 자리를
 * 비워 둔다 — 자리를 지우면 아래 줄과 칸이 어긋나 훑기가 나빠진다.
 */
function Spans({ d, r }: { d: number | null; r: OwnThemeRow["ret"] }) {
  const 칸 = (k: string, v: number | null) => (
    <span className="w-[3.6rem] text-right">
      <span className="text-[9px] text-muted">{k}</span>
      <span className={`tnum ml-1 ${v === null ? "text-muted" : signColor(v)}`}>
        {v === null ? "·" : pct(v)}
      </span>
    </span>
  );
  const 값 = [
    ["1D", d],
    ["1W", r?.w1 ?? null],
    ["1M", r?.m1 ?? null],
    ["1Y", r?.y1 ?? null],
  ] as const;
  // 넷이 붙어 있으면 어디까지가 한 칸인지 안 읽힌다. 빗금으로 끊고,
  // 막대와는 한 칸 더 띄운다 — 성격이 다른 것끼리 붙어 있으면 눈이 헷갈린다.
  return (
    <span className="mr-3 hidden items-center gap-1.5 text-[10.5px] lg:flex">
      {값.map(([k, v], i) => (
        <span key={k} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted/50">/</span>}
          {칸(k, v)}
        </span>
      ))}
    </span>
  );
}

interface Group {
  name: string;
  themes: OwnThemeRow[];
  ret: OwnThemeRow["ret"];
  chg: number | null;
  up: number;
  down: number;
  stocks: number;
}

export function ThemeBoard({
  focus,
  onOpen,
}: {
  /** 상세에서 돌아왔을 때 펼쳐 둘 테마 — 그 테마가 든 대분류를 연다 */
  focus?: string;
  onOpen: (no: string, name: string) => void;
}) {
  const { data, isLoading, error } = useSWR<{
    data: OwnThemeRow[];
    stale?: boolean;
    meta?: { 만든날?: string };
  }>(
    "/api/themes",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 120_000 },
  );
  // 편입 종목 이름 목록. "삼성SDI 가 어느 테마에 있지" 가 실제 질문이라
  // 테마명만으로는 부족하다. 25KB 짜리 정적 자료를 한 번 받아 두고 여기서 찾는다.
  const { data: idx } = useSWR<{ data: { id: string; names: string[] }[] }>(
    "/api/theme-index",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 },
  );
  // 오늘의 신호 — 목록과 따로 받는다. 없으면 띠가 안 뜰 뿐이라 화면은 그대로다.
  const { data: sig } = useSWR<{ data: { golden: DailySignal[]; dead: DailySignal[] } }>(
    "/api/theme-signals",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 600_000 },
  );
  const [q, setQ] = useState("");
  const [sort, setSort] = useSticky<Sort>("kr.theme.sort", "chg");
  const [filter, setFilter] = useSticky<Filter>("kr.theme.filter", "all");
  // 어느 대분류를 펼쳐 두었는지 기억한다
  const [open, setOpen] = useSticky<string[]>("kr.theme.open", []);

  const needle = q.trim().toLowerCase();

  // 종목명이 걸린 테마와, 그 테마에서 걸린 종목 이름
  const byStock = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!needle || !idx?.data) return m;
    for (const t of idx.data) {
      const hit = t.names.filter((n) => n.toLowerCase().includes(needle));
      if (hit.length) m.set(t.id, hit);
    }
    return m;
  }, [idx, needle]);

  const { groups, shown, total } = useMemo(() => {
    const all = data?.data ?? [];
    const hit = needle
      ? all.filter(
          (t) =>
            t.name.toLowerCase().includes(needle) ||
            t.hint.toLowerCase().includes(needle) ||
            t.group.toLowerCase().includes(needle) ||
            byStock.has(t.id) ||
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
      // 대분류 기간수익률 — 그 안 테마들의 평균. 절반도 안 나오면 비운다.
      const rs = themes.map((t) => t.ret).filter(Boolean) as NonNullable<OwnThemeRow["ret"]>[];
      const 평균 = (f: (r: NonNullable<OwnThemeRow["ret"]>) => number) =>
        +(rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(2);
      return {
        name,
        themes: sorted,
        ret: rs.length >= themes.length / 2 ? { w1: 평균((r) => r.w1), m1: 평균((r) => r.m1), y1: 평균((r) => r.y1) } : null,
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
  }, [data, needle, sort, filter, byStock]);

  // 상세에서 돌아오면 그 테마가 든 대분류를 펼쳐 둔다. 접힌 목록만 덩그러니
  // 보이면 어디에 있었는지 알 수가 없다. 펼치기만 하고 접지는 않는다.
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || !data?.data || focused.current === focus) return;
    const g = data.data.find((t) => t.id === focus)?.group;
    focused.current = focus;
    if (g && !open.includes(g)) setOpen([...open, g]);
  }, [focus, data, open, setOpen]);

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
      {/* 규칙을 머리에 둔다. 아래 각주에 있을 때는 아무도 읽지 않았는데,
          "한 종목은 한 테마에만" 은 이 화면을 처음 보는 사람이 가장 먼저
          알아야 하는 것이다. 기준일도 같이 적는다 — 분류는 분기에 한 번
          바뀌므로 언제 자료인지 밝혀야 한다. */}
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        사업보고서를 읽어 만든 분류다. <b className="font-medium text-fg">한 종목은 한 테마에만</b> 들어간다.
        {data?.meta?.만든날 && <span className="tnum"> · {data.meta.만든날} 기준</span>}
      </p>

      {!needle && sig?.data?.golden?.length ? (
        <SignalStrip rows={sig.data.golden} themes={data?.data ?? []} onOpen={onOpen} />
      ) : null}

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
                    <Spans d={g.chg} r={g.ret} />
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
                          <span className="min-w-0 text-[12.5px]">
                            <Mark text={t.name} q={needle} />
                            {/* 이름만으로 애매한 테마가 있다 — 무엇을 묶었는지 한 줄.
                                줄을 새로 만들지 않고 이름 뒤에 작게 붙여 목록을
                                훑는 속도를 지킨다. */}
                            {t.hint && !needle && (
                              <span className="ml-1.5 hidden text-[11px] font-normal text-muted md:inline">
                                {t.hint}
                              </span>
                            )}
                            {/* 종목명으로 찾았을 때, 무엇이 걸렸는지 보여 준다 */}
                            {byStock.has(t.id) && (
                              <span className="ml-1.5 text-[11px] text-brand">
                                {byStock.get(t.id)!.slice(0, 2).join(", ")}
                                {byStock.get(t.id)!.length > 2 && ` 외 ${byStock.get(t.id)!.length - 2}`}
                              </span>
                            )}
                          </span>
                          <span className="tnum shrink-0 text-[10.5px] text-muted">{t.count}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            {/* 대장주는 등락률까지 적는다 — 테마는 올랐는데 한 종목이
                                혼자 끌었나를 펼치지 않고도 본다. 셋을 넘기면 줄이
                                길어져 훑기 어렵다. */}
                            <span className="hidden max-w-[16rem] truncate text-[11px] text-muted sm:block">
                              {t.leaders.slice(0, 3).map((l, i) => (
                                <span key={l.code}>
                                  {i > 0 && " · "}
                                  {l.name}
                                  <span className={`tnum ml-0.5 ${signColor(l.chg ?? 0)}`}>
                                    {l.chg === null ? "" : pct(l.chg)}
                                  </span>
                                </span>
                              ))}
                            </span>
                            {/* 기간 수익률은 대분류 줄에만 둔다. 테마 줄까지 넣으면
                                한 화면에 숫자가 너무 많아 대표종목이 안 읽힌다. */}
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
        테마 분류와 편입 사유는 SIGNO 가 직접 만든 것이다. 등락률은 편입 종목의
        단순 평균이고, 막대는 상승 대 하락 비율이다.
        {data?.stale && <span className="text-signal"> · 장 시작 전이라 직전 거래일 기준</span>}
      </p>
    </Card>
  );
}
