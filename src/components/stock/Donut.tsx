"use client";

/**
 * 작은 도넛 하나 — 매출 구성·주주 구성에 쓴다.
 *
 * ── 왜 범례를 아래에 두나 ──────────────────────────────────
 * 처음에는 도넛 옆에 나란히 두었다. 카드 폭 328px 을 둘로 나누면 한 칸이
 * 164px 이고, 도넛 72px 과 간격을 빼면 범례에 87px 밖에 안 남는다.
 * "바이오시밀러 93.3%" 가 들어갈 수 없는 폭이라 글씨가 잘렸다.
 *
 * 그래서 세로로 쌓아 범례가 칸 폭을 다 쓰게 한다. 원형이 하나뿐일 때는
 * (matches 가 false) 가로로 눕혀 폭 240px 을 쓴다 — 그때는 잘릴 일이 없다.
 *
 * ── 색 ────────────────────────────────────────────────
 * up/down(빨강·파랑)을 쓰지 않는다. 이 앱에서 그 둘은 등락을 뜻해서,
 * 매출 조각에 쓰면 "이 사업이 올랐다" 로 잘못 읽힌다.
 */
const 색 = [
  "var(--color-brand)",
  "#9aa0e4",
  "var(--color-signal)",
  "#7a80a8",
  "var(--color-line)",
];

export interface 조각 {
  name: string;
  pct: number;
  /** 범례에 덧붙일 잔글씨 — "블랙록 7.1% 포함" 같은 것 */
  note?: string;
}

export function Donut({
  title,
  rows,
  foot,
  wide = false,
}: {
  title: string;
  rows: 조각[];
  foot?: string;
  /** 원형이 하나뿐일 때 — 가로로 눕혀 폭을 다 쓴다 */
  wide?: boolean;
}) {
  if (!rows.length) return null;
  // 반지름 15.9155 면 둘레가 정확히 100 이라 비중을 그대로 쓸 수 있다
  const R = 15.9155;
  const C = 2 * Math.PI * R;
  let 누적 = 0;

  return (
    <div className={`min-w-0 ${wide ? "flex flex-wrap items-center gap-3" : "flex flex-col items-center gap-2"}`}>
      <h4 className={`text-[10.5px] font-bold tracking-wide text-muted ${wide ? "basis-full" : "self-start"}`}>
        {title}
      </h4>
      <svg width="72" height="72" viewBox="0 0 42 42" className="shrink-0" role="img"
           aria-label={`${title}: ${rows.map((r) => `${r.name} ${r.pct}%`).join(", ")}`}>
        <circle cx="21" cy="21" r={R} fill="none" strokeWidth="10.5" stroke="var(--color-line)" />
        {rows.map((r, i) => {
          const el = (
            <circle
              key={r.name}
              cx="21" cy="21" r={R} fill="none" strokeWidth="10.5"
              stroke={색[Math.min(i, 색.length - 1)]}
              strokeDasharray={`${((C * r.pct) / 100).toFixed(3)} ${C.toFixed(3)}`}
              strokeDashoffset={(-(C * 누적) / 100).toFixed(3)}
              transform="rotate(-90 21 21)"
            />
          );
          누적 += r.pct;
          return el;
        })}
      </svg>
      <div className={`grid gap-1 text-[10.5px] ${wide ? "min-w-0 flex-1" : "w-full"}`}>
        {rows.map((r, i) => (
          <div key={r.name} className="grid grid-cols-[7px_minmax(0,1fr)_auto] items-center gap-1.5">
            <span className="size-[7px] rounded-sm" style={{ background: 색[Math.min(i, 색.length - 1)] }} />
            <span className="truncate" title={r.note ? `${r.name} · ${r.note}` : r.name}>
              {r.name}
              {r.note && <span className="text-muted"> · {r.note}</span>}
            </span>
            <span className="tnum text-muted">{r.pct}%</span>
          </div>
        ))}
        {foot && <p className={`mt-0.5 text-[10px] text-muted ${wide ? "" : "self-start"}`}>{foot}</p>}
      </div>
    </div>
  );
}
