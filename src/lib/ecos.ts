// 한국은행 ECOS — 명목 GDP.
//
// 버핏지수(시가총액 ÷ GDP)의 분모다. 이것만 우리에게 없어서 받아 온다.
//
// ── 왜 명목인가 ───────────────────────────────────────────
// 분자인 시가총액이 현재 가격이므로 분모도 현재 가격이어야 짝이 맞는다.
// 실질 GDP(2020년 연쇄가격)를 쓰면 그 사이 물가 상승분만큼 지수가 부풀려진다.
//
// ── 왜 연간인가 ───────────────────────────────────────────
// 명목 GDP 는 ECOS 에 연간(200Y101/10101)으로만 있다. 분기 국민소득 속보는
// 실질만 낸다 — 마지막 달 실적을 다 못 받은 채 내기 때문이다(명목은 한 달
// 뒤 잠정치에서 나온다).
//
// 그래서 분모는 직전 연도 값이고, 분자(시가총액)는 지금이다. 이 어긋남은
// 버핏지수의 성질이므로 기준 연도를 함께 내보내 화면이 밝히게 한다.
//
//   ECOS_API_KEY  https://ecos.bok.or.kr 회원가입 후 인증키 신청. 무료
import { cached } from "@/lib/cache";

const KEY = process.env.ECOS_API_KEY?.trim();
export const hasECOS = () => Boolean(KEY);

export interface 명목GDP {
  /** 연도 */
  해: number;
  /** 조원 */
  값: number;
}

/**
 * 최신 명목 GDP. 하루 한 번이면 넉넉하다 — 1년에 한 번 바뀐다.
 *
 * 키가 없으면 null 을 돌려준다. 버핏지수만 빠지고 나머지 지표는 그대로 나온다.
 */
export const nominalGDP = () =>
  cached<명목GDP | null>("ecos:gdp:v1", 24 * 3600, async () => {
    if (!KEY) return null;
    const 올해 = new Date().getUTCFullYear();
    const url =
      `https://ecos.bok.or.kr/api/StatisticSearch/${KEY}/json/kr/1/10` +
      `/200Y101/A/${올해 - 6}/${올해}/10101/`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      StatisticSearch?: { row?: { TIME: string; DATA_VALUE: string }[] };
    };
    const rows = j.StatisticSearch?.row ?? [];
    if (!rows.length) return null;
    // 가장 최근 연도. 단위는 십억원이라 조원으로 바꾼다.
    const 마지막 = rows[rows.length - 1];
    const v = Number(마지막.DATA_VALUE);
    const y = Number(마지막.TIME);
    if (!Number.isFinite(v) || !Number.isFinite(y)) return null;
    return { 해: y, 값: +(v / 1000).toFixed(1) };
  });
