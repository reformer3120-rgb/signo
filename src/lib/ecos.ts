// 한국은행 ECOS — 명목 GDP.
//
// 버핏지수(시가총액 ÷ GDP)의 분모다. 이것만 우리에게 없어서 받아 온다.
//
// ── 왜 명목인가 ───────────────────────────────────────────
// 분자인 시가총액이 현재 가격이므로 분모도 현재 가격이어야 짝이 맞는다.
// 실질 GDP(2020년 연쇄가격)를 쓰면 그 사이 물가 상승분만큼 지수가 부풀려진다.
//
// ── 왜 최근 4분기 합인가 ──────────────────────────────────
// 처음에는 연간(200Y101/10101)을 썼다. 그러면 분모가 직전 연도라 분자와
// 1년 넘게 어긋난다. 명목 GDP 는 해마다 5% 안팎 늘기 때문에 그만큼 지수가
// 부풀려진다.
//
//   2025 연간      2,677조   →  버핏지수 223.7%
//   최근 4분기 합   2,959조   →  버핏지수 202.4%    21%p 차이
//
// 분기 명목 GDP 는 200Y105(원계열, 명목, 분기)에 있다. 2026Q2 까지 나와
// 있어서 어긋남이 최대 세 달로 줄어든다.
//
// ── 왜 예상 GDP 를 쓰지 않나 ──────────────────────────────
// 원조 버핏지수도 예상이 아니라 실현치를 쓴다. 셋 때문이다.
//   기관마다 다르다   한은·KDI·IMF·정부 전망이 제각각이라 고르는 순간
//                    그 선택을 설명해야 한다
//   경고가 무뎌진다   분자에 이미 기대가 들어 있는데 분모에도 넣으면
//                    같은 기대를 두 번 반영하는 셈이다
//   필요가 없다       최근 4분기면 실현치만으로 충분히 최신이다
//
//   ECOS_API_KEY  https://ecos.bok.or.kr 회원가입 후 인증키 신청. 무료
import { cached } from "@/lib/cache";

const KEY = process.env.ECOS_API_KEY?.trim();
export const hasECOS = () => Boolean(KEY);

export interface 명목GDP {
  /** 조원 — 최근 4분기 합 */
  값: number;
  /** 어느 분기까지인가 — "2025Q3~2026Q2" */
  기간: string;
}

/** 분기 문자열에서 다음 분기를 구한다 — 조회 범위를 넉넉히 잡을 때 쓴다 */
const 올해분기 = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
};

/**
 * 최근 4분기 명목 GDP 합.
 *
 * 하루 한 번이면 넉넉하다 — 분기에 한 번 바뀐다.
 * 키가 없으면 null 을 돌려준다. 버핏지수만 빠지고 나머지 지표는 그대로 나온다.
 */
export const nominalGDP = () =>
  cached<명목GDP | null>("ecos:gdp:v2", 24 * 3600, async () => {
    if (!KEY) return null;
    const 올해 = new Date().getUTCFullYear();
    const url =
      `https://ecos.bok.or.kr/api/StatisticSearch/${KEY}/json/kr/1/12` +
      `/200Y105/Q/${올해 - 2}Q1/${올해분기()}/1400/`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      RESULT?: { CODE: string };
      StatisticSearch?: { row?: { TIME: string; DATA_VALUE: string }[] };
    };
    if (j.RESULT) return null; // 키가 틀렸거나 한도를 넘었다
    // 같은 표에 연간 자료가 섞여 오므로 분기 것만 고른다
    const rows = (j.StatisticSearch?.row ?? [])
      .filter((x) => /^\d{4}Q[1-4]$/.test(x.TIME))
      .sort((a, b) => a.TIME.localeCompare(b.TIME));
    if (rows.length < 4) return null;
    const 넷 = rows.slice(-4);
    const 합 = 넷.reduce((a, x) => a + Number(x.DATA_VALUE), 0);
    if (!Number.isFinite(합) || 합 <= 0) return null;
    return {
      값: +(합 / 1000).toFixed(1),
      기간: `${넷[0].TIME}~${넷[3].TIME}`,
    };
  });
