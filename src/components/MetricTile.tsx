import { num, pct, signColor } from "@/lib/format";

export function MetricTile({
  label,
  value,
  changePct,
  suffix = "",
  digits = 2,
}: {
  label: string;
  value: number;
  changePct?: number;
  suffix?: string;
  digits?: number;
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas/40 px-3.5 py-3 min-w-[120px] flex-1">
      <div className="text-xs text-muted truncate">{label}</div>
      <div className="tnum mt-1 text-lg font-semibold">
        {num(value, digits)}
        {suffix && <span className="text-xs text-muted ml-0.5">{suffix}</span>}
      </div>
      {changePct !== undefined && (
        <div className={`tnum text-xs font-medium ${signColor(changePct)}`}>{pct(changePct)}</div>
      )}
    </div>
  );
}
