// 개요 카드의 그림 재료 — 매출 구성과 대량보유자.
//
// 문장(about.json)과 나눠 둔 이유는 만드는 주기가 달라서다. 문장은 사업보고서
// 원문에서 뽑고, 이쪽은 매출실적표·대량보유 공시·회사개황에서 온다.
//
// 외국인 보유비중은 여기 없다. 시세와 함께 하루에도 바뀌어 굳혀 두면 낡는다.
// 화면이 종목상세에서 받아 합친다 — 대량보유자에 달린 foreign 이 그때
// 겹침을 밝히는 데 쓰인다("외국인 25.4% (블랙록 7.1% 포함)").
//
// 만드는 곳 scripts/theme/build-profile.mjs (분기에 한 번)
import RAW from "@/data/profile.json";

export interface 조각 {
  name: string;
  pct: number;
}
export interface 보유자 extends 조각 {
  /** 공시의 국적 칸으로 판정한다. 이름으로 가르지 않는다 —
      「임 창 완」 47%가 개인(외국)·미국이고 POSCO홀딩스는 국내다. */
  foreign: boolean;
  구분: string | null;
}
export interface Profile {
  매출?: {
    rows: 조각[];
    asOf: string | null;
    report: string | null;
    /** 조각의 합이 그 해 매출액과 맞는가. 아니면 화면이 「사업 구성」이라 부른다. */
    검증?: boolean;
    /** 손보기로 달리 준 제목 — 금융지주의 「영업이익 구성」 같은 것 */
    제목?: string;
  };
  주주?: { rows: 보유자[]; asOf: string | null };
}

const DATA = RAW as unknown as Record<string, Profile>;

export const profileOf = (code: string): Profile | null => DATA[code] ?? null;
