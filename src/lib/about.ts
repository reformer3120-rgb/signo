// 기업 개요 — "이 회사가 무슨 일을 하는가" 두세 문장.
//
// 종목 화면 맨 위의 개요 카드에만 쓴다. 예전에는 그 자리에 점수·시총·PER·
// 매출성장·이익률·외국인이 들어 있었는데, 그 값들이 하나같이 아래 카드에
// 그대로 또 있었다. 숫자를 걷어내고 나니 정작 "무슨 회사인가" 를 말해 줄
// 것이 남지 않아 이 파일을 따로 만들었다.
//
// themes.json 의 why 와는 쓰임이 다르다. 그쪽은 "왜 이 테마에 넣었나" 라는
// 분류 근거라 한 문장이고, 사람이 손본 것은 중앙값이 30자다 — 테마 카드에는
// 알맞지만 종목 개요로는 얇다.
//
// 지어낸 문장이 아니다. 사업보고서 '사업의 내용 — 사업의 개요' 원문에서
// 문장을 골라 옮긴 것이다. 만드는 규칙은 scripts/theme/build-about.mjs.
import RAW from "@/data/about.json";

const DATA = RAW as Record<string, string[]>;

/** 이 종목의 개요 문장들 — 없으면 빈 배열 */
export function aboutOf(code: string): string[] {
  return DATA[code] ?? [];
}
