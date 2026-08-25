"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Tabs } from "@/components/Tabs";
import { pct, signColor } from "@/lib/format";

interface Point {
  d: string;
  v: number;
}

type Span = "20" | "60" | "120";
const SPANS: { key: Span; label: string }[] = [
  { key: "20", label: "1개월" },
  { key: "60", label: "3개월" },
  { key: "120", label: "6개월" },
];

const fmtDate = (d: string) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;

/**
 * 테마 등락률 그래프.
 *
 * 화면에 쓰는 테마 등락률이 "편입 종목의 단순 평균" 이므로 그래프도 같은
 * 방식으로 만든다(서버에서 계산). 시총 가중으로 그리면 위의 숫자와 어긋난다.
 *
 * 그리는 것은 면적 하나뿐이다. 눈금선·범례를 얹으면 카드 안에서 시끄럽고,
 * 여기서 알고 싶은 것은 "이 테마가 요즘 오르고 있나" 하나다.
 */
export function ThemeChart({ id, name }: { id: string; name: string }) {
  const [span, setSpan] = useState<Span>("60");
  const { data, isLoading } = useSWR<{ data: Point[] }>(
    `/api/themes/${id}/chart?days=${span}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 600_000 },
  );
  const pts = useMemo(() => data?.data ?? [], [data]);
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (pts.length < 2) return null;
    const W = 1000;
    const H = 200;
    const vs = pts.map((p) => p.v);
    const lo = Math.min(0, ...vs);
    const hi = Math.max(0, ...vs);
    const pad = (hi - lo) * 0.12 || 1;
    const top = hi + pad;
    const bot = lo - pad;
    const x = (i: number) => (i / (pts.length - 1)) * W;
    const y = (v: number) => ((top - v) / (top - bot)) * H;
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
    return { W, H, x, y, line, zero: y(0), area: `${line} L${W} ${y(0)} L0 ${y(0)} Z` };
  }, [pts]);

  const last = pts.length ? pts[pts.length - 1].v : null;
  const up = (last ?? 0) >= 0;
  const at = hover !== null && pts[hover] ? pts[hover] : null;

  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <span className="text-[11px] text-muted">
            {at ? fmtDate(at.d) : `${SPANS.find((s) => s.key === span)?.label} 누적`}
          </span>
          <b className={`tnum text-base font-bold ${signColor(at ? at.v : (last ?? 0))}`}>
            {at ? pct(at.v) : last === null ? "—" : pct(last)}
          </b>
        </span>
        <Tabs value={span} onChange={setSpan} items={SPANS} />
      </div>

      {isLoading || !geom ? (
        <div className="h-[120px] animate-pulse rounded-md bg-line/25" />
      ) : (
        <svg
          viewBox={`0 0 ${geom.W} ${geom.H}`}
          className="h-[120px] w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${name} 최근 ${SPANS.find((s) => s.key === span)?.label} 누적 등락률 ${last === null ? "" : pct(last)}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const t = (e.clientX - r.left) / r.width;
            setHover(Math.max(0, Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))));
          }}
        >
          <defs>
            <linearGradient id={`tg-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={up ? "var(--color-up)" : "var(--color-down)"} stopOpacity="0.28" />
              <stop offset="100%" stopColor={up ? "var(--color-up)" : "var(--color-down)"} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={geom.area} fill={`url(#tg-${id})`} />
          {/* 0% 선 — 본전 자리를 알아야 오른 건지 내린 건지 읽힌다 */}
          <line
            x1="0"
            x2={geom.W}
            y1={geom.zero}
            y2={geom.zero}
            stroke="var(--color-line)"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={geom.line}
            fill="none"
            stroke={up ? "var(--color-up)" : "var(--color-down)"}
            strokeWidth="1.6"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {at && hover !== null && (
            <line
              x1={geom.x(hover)}
              x2={geom.x(hover)}
              y1="0"
              y2={geom.H}
              stroke="var(--color-muted)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}

      {geom && (
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span className="tnum">{fmtDate(pts[0].d)}</span>
          <span className="tnum">{fmtDate(pts[pts.length - 1].d)}</span>
        </div>
      )}
    </div>
  );
}
