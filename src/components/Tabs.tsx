"use client";

/** 카드 머리에 붙는 작은 탭 줄 */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { key: T; label: string }[];
}) {
  return (
    <div className="flex rounded-lg border border-line p-0.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
            value === it.key ? "bg-brand text-white" : "text-muted hover:text-fg"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
