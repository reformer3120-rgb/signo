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

/** 주가흐름 등급(A+~D) 배지 색 */
export function gradeColor(g: string) {
  if (g.startsWith("A")) return "bg-up/15 text-up border-up/30";
  if (g === "B") return "bg-signal/15 text-signal border-signal/30";
  if (g === "C") return "bg-muted/10 text-muted border-line";
  return "bg-down/15 text-down border-down/30";
}

/** 이동평균 교차 신호 배지 색 */
export function maColor(s: string) {
  if (s === "골든크로스") return "bg-up/20 text-up border-up/40";
  if (s === "정배열") return "bg-up/10 text-up border-up/25";
  if (s === "데드크로스") return "bg-down/20 text-down border-down/40";
  return "bg-down/10 text-down border-down/25";
}
