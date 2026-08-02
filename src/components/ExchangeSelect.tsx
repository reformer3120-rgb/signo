"use client";

export type Exch = "KRX" | "NXT" | "UN";

export const EXCHANGES: { key: Exch; label: string }[] = [
  { key: "KRX", label: "KRX" },
  { key: "NXT", label: "NXT" },
  { key: "UN", label: "통합" },
];

/** 거래소 선택 (KRX / NXT / 통합) — 버튼 나열 대신 선택창 */
export function ExchangeSelect({
  value,
  onChange,
  className = "",
}: {
  value: Exch;
  onChange: (v: Exch) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Exch)}
      title="거래소 (KRX · NXT · 통합)"
      className={`rounded-lg border border-line bg-canvas px-2 py-1 text-xs font-medium outline-none focus:border-brand ${className}`}
    >
      {EXCHANGES.map((x) => (
        <option key={x.key} value={x.key}>
          {x.label}
        </option>
      ))}
    </select>
  );
}
