// 숫자/통화 포맷 + 상승(빨강)/하락(파랑) 헬퍼

export const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

export const num = (n: number, digits = 0) =>
  n.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

/** 억/조 단위 축약 (거래대금 등 큰 금액) */
export function compactWon(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}조`;
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(0)}억`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)}만`;
  return n.toLocaleString("ko-KR");
}

/** 상승=빨강 / 하락=파랑 / 보합=muted */
export const signColor = (n: number) =>
  n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted";

export const signBg = (n: number) =>
  n > 0 ? "bg-up/10 text-up" : n < 0 ? "bg-down/10 text-down" : "bg-muted/10 text-muted";
