import { MA_PERIODS, MA_COLORS } from "@/lib/indicators";

export function MaLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[11px] tnum ${className}`}>
      {MA_PERIODS.map((p) => (
        <span key={p} style={{ color: MA_COLORS[p] }}>
          MA{p}
        </span>
      ))}
    </div>
  );
}
