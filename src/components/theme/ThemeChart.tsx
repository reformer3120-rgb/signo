"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Tabs } from "@/components/Tabs";
import { pct, signColor } from "@/lib/format";

interface Point {
  d: string;
  v: number;
  lead: number | null;
  ks: number | null;
  kq: number | null;
}

type Span = "20" | "60" | "120";
const SPANS: { key: Span; label: string }[] = [
  { key: "20", label: "1개월" },
  { key: "60", label: "3개월" },
  { key: "120", label: "6개월" },
];

/** 어느 계열을 그릴지. 테마는 언제나 그린다. */
type Key = "lead" | "ks" | "kq";

const fmtDate = (d: string) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;

/**
 * 테마 등락률 그래프. 테마와 함께 대장주·코스피·코스닥을 겹쳐 놓는다.
 *
 * 겹쳐 놓는 이유는 하나다 — "이 테마가 올랐다" 만으로는 시장이 오른 것인지
 * 테마가 오른 것인지 알 수 없다. 지수를 같이 봐야 갈린다. 대장주를 함께 두면
 * 테마 전체가 움직인 것인지 한 종목이 끌고 간 것인지도 보인다.
 *
 * 넷 다 첫날 0 에서 시작한다. 값의 단위가 달라도(지수 대 주가) 그래야 겹친다.
 *
 * 색은 계열마다 다르게 두되, 테마만 굵게 그린다. 나머지는 배경이다.
 */
export function ThemeChart({ id, name }: { id: string; name: string }) {
  const [span, setSpan] = useState<Span>("60");
  const [off, setOff] = useState<Key[]>([]);
  const { data, isLoading } = useSWR<{ data: Point[]; leadName: string | null }>(
    `/api/themes/${id}/chart?days=${span}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 600_000 },
  );
  const pts = useMemo(() => data?.data ?? [], [data]);
  const leadName = data?.leadName ?? null;
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(() => {
    const has = (k: Key) => pts.some((p) => p[k] !== null);
    return [
      { key: "lead" as Key, label: leadName ?? "대장주", color: "var(--color-signal)", on: has("lead") },
      { key: "ks" as Key, label: "코스피", color: "var(--color-brand)", on: has("ks") },
      { key: "kq" as Key, label: "코스닥", color: "var(--color-muted)", on: has("kq") },
    ].filter((s) => s.on);
  }, [pts, leadName]);

  const geom = useMemo(() => {
    if (pts.length < 2) return null;
    const W = 1000;
    const H = 220;
    const vals: number[] = [];
    for (const p of pts) {
      vals.push(p.v);
      for (const s of series) if (!off.includes(s.key)) {
        const x = p[s.key];
        if (x !== null) vals.push(x);
      }
    }
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    const pad = (hi - lo) * 0.12 || 1;
    const top = hi + pad;
    const bot = lo - pad;
    const x = (i: number) => (i / (pts.length - 1)) * W;
    const y = (v: number) => ((top - v) / (top - bot)) * H;
    const path = (get: (p: Point) => number | null) => {
      let d = "";
      let started = false;
      pts.forEach((p, i) => {
        const val = get(p);
        if (val === null) { started = false; return; }
        d += `${started ? "L" : "M"}${x(i).toFixed(1)} ${y(val).toFixed(1)} `;
        started = true;
      });
      return d.trim();
    };
    const theme = path((p) => p.v);
    return {
      W, H, x, y, theme,
      zero: y(0),
      area: `${theme} L${W} ${y(0)} L0 ${y(0)} Z`,
      of: (k: Key) => path((p) => p[k]),
    };
  }, [pts, series, off]);

  const last = pts.length ? pts[pts.length - 1] : null;
  const up = (last?.v ?? 0) >= 0;
  const at = hover !== null && pts[hover] ? pts[hover] : null;
  const cur = at ?? last;

  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <span className="text-[11px] text-muted">
            {at ? fmtDate(at.d) : `${SPANS.find((s) => s.key === span)?.label} 누적`}
          </span>
          <b className={`tnum text-base font-bold ${signColor(cur?.v ?? 0)}`}>
            {cur ? pct(cur.v) : "—"}
          </b>
        </span>
        <Tabs value={span} onChange={setSpan} items={SPANS} />
      </div>

      {isLoading || !geom ? (
        <div className="h-[132px] animate-pulse rounded-md bg-line/25" />
      ) : (
        <svg
          viewBox={`0 0 ${geom.W} ${geom.H}`}
          className="h-[132px] w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${name} 최근 ${SPANS.find((s) => s.key === span)?.label} 누적 등락률 ${last ? pct(last.v) : ""}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const t = (e.clientX - r.left) / r.width;
            setHover(Math.max(0, Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))));
          }}
        >
          <defs>
            <linearGradient id={`tg-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={up ? "var(--color-up)" : "var(--color-down)"} stopOpacity="0.22" />
              <stop offset="100%" stopColor={up ? "var(--color-up)" : "var(--color-down)"} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={geom.area} fill={`url(#tg-${id})`} />
          {/* 0% 선 — 본전 자리를 알아야 오른 건지 내린 건지 읽힌다 */}
          <line
            x1="0" x2={geom.W} y1={geom.zero} y2={geom.zero}
            stroke="var(--color-line)" strokeWidth="1" strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          {/* 견줄 것들은 얇게 — 배경이지 주인공이 아니다 */}
          {series.map((s) =>
            off.includes(s.key) ? null : (
              <path
                key={s.key}
                d={geom.of(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth="1.1"
                strokeOpacity="0.85"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ),
          )}
          <path
            d={geom.theme}
            fill="none"
            stroke={up ? "var(--color-up)" : "var(--color-down)"}
            strokeWidth="1.9"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {at && hover !== null && (
            <line
              x1={geom.x(hover)} x2={geom.x(hover)} y1="0" y2={geom.H}
              stroke="var(--color-muted)" strokeWidth="1" vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}

      {/* 범례 — 누르면 켜고 끈다. 지금 값도 같이 보여 준다. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <i
            className="inline-block h-[3px] w-4 rounded-full"
            style={{ background: up ? "var(--color-up)" : "var(--color-down)" }}
            aria-hidden="true"
          />
          <span className="font-medium">테마</span>
          <b className={`tnum ${signColor(cur?.v ?? 0)}`}>{cur ? pct(cur.v) : "—"}</b>
        </span>
        {series.map((s) => {
          const hidden = off.includes(s.key);
          const val = cur?.[s.key] ?? null;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setOff(hidden ? off.filter((k) => k !== s.key) : [...off, s.key])}
              aria-pressed={!hidden}
              className={`flex items-center gap-1.5 transition-opacity ${hidden ? "opacity-35" : ""}`}
            >
              <i
                className="inline-block h-[2px] w-4 rounded-full"
                style={{ background: s.color }}
                aria-hidden="true"
              />
              <span className="max-w-[7rem] truncate text-muted">{s.label}</span>
              <b className={`tnum ${val === null ? "text-muted" : signColor(val)}`}>
                {val === null ? "—" : pct(val)}
              </b>
            </button>
          );
        })}
        {geom && (
          <span className="tnum ml-auto text-[10px] text-muted">
            {fmtDate(pts[0].d)} ~ {fmtDate(pts[pts.length - 1].d)}
          </span>
        )}
      </div>
    </div>
  );
}
