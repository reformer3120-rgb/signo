// 거래 세션 판정 — 화면(클라이언트)과 서버가 함께 쓴다. 외부 의존 없음.

export type KrSession = "장전 NXT" | "정규장" | "장후 NXT" | "장마감";
export type UsSession = "주간거래" | "프리마켓" | "정규장" | "애프터" | "장마감";

function clockIn(tz: string, at: Date) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const h = g("hour") === "24" ? "00" : g("hour");
  return { weekday: g("weekday"), hm: `${h}:${g("minute")}` };
}

/**
 * 국내 증시 세션 (한국시간)
 *   08:00~09:00  넥스트레이드(NXT) 프리마켓 — KRX는 열려 있지 않다
 *   09:00~15:30  정규장 (KRX + NXT)
 *   15:30~20:00  NXT 애프터마켓 — KRX는 닫혀 있다
 * 휴장일은 판별하지 않는다(장 운영일 여부는 화면 상단에서 따로 표시).
 */
export function krSessionNow(at = new Date()): KrSession {
  const { weekday, hm } = clockIn("Asia/Seoul", at);
  if (weekday === "Sat" || weekday === "Sun") return "장마감";
  if (hm >= "08:00" && hm < "09:00") return "장전 NXT";
  if (hm >= "09:00" && hm <= "15:30") return "정규장";
  if (hm > "15:30" && hm <= "20:00") return "장후 NXT";
  return "장마감";
}

/** KRX가 닫혀 있고 NXT에서만 거래되는 시간대인가 */
export const isNxtOnly = (s: KrSession = krSessionNow()) =>
  s === "장전 NXT" || s === "장후 NXT";

/**
 * 미국 증시 세션 — 뉴욕 현지 시각으로 판정한다.
 * 한국시간으로 못 박으면 서머타임 전환 때 한 시간씩 어긋나므로.
 *   04:00~09:30 ET 프리마켓 (한국 18:00~23:30)
 *   09:30~16:00 ET 정규장   (한국 23:30~06:00)
 *   16:00~20:00 ET 애프터   (한국 06:00~10:00)
 *   20:00~04:00 ET 주간거래 (한국 10:00~18:00, 국내 증권사 야간 세션)
 */
export function usSessionNow(at = new Date()): UsSession {
  const { weekday, hm } = clockIn("America/New_York", at);
  if (weekday === "Sat" || weekday === "Sun") return "장마감";
  if (hm >= "04:00" && hm < "09:30") return "프리마켓";
  if (hm >= "09:30" && hm < "16:00") return "정규장";
  if (hm >= "16:00" && hm < "20:00") return "애프터";
  return "주간거래";
}
