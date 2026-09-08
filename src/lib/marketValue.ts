// 코스피·코스닥 PER·PBR 을 우리가 센다.
//
// ── 왜 직접 세나 ──────────────────────────────────────────
// 지수 PER/PBR 을 그냥 주는 무료 출처가 없다.
//   네이버 지수 API·웹  전일·시가·52주만
//   KRX 정보데이터      공식 수치가 있지만 로그인이 필요하다
// 시가총액과 재무는 이미 갖고 있으니 셀 수 있다.
//
// ── 우리 수치는 KRX 공식치와 다르다 ────────────────────────
// 셋이 구조적으로 다르다. 감추지 말고 화면에 밝힌다.
//   편입 범위   우리 분류표의 2,234종목. KRX 는 전 상장사
//   우선주      우리 표에는 사실상 없다(4종목). KRX 는 포함 → 시총이 덜 잡힌다
//   기준 시점   시총은 지금, 재무는 직전 사업연도 (= 후행 PER)
// 그래서 "코스피 PER 21.4배" 라고 단정하지 않고 SIGNO 산출임을 적는다.
//
// 그래서 절대 수치를 단정하지 않는다. 추세(지난달 대비)나 두 시장 비교로
// 읽는 편이 안전하다.
import RAW from "@/data/valuation.json";
import { cached, redis } from "@/lib/cache";

interface 재무 { 순: number; 자: number; 시: "Y" | "K"; 해: number }
const DATA = RAW as unknown as Record<string, 재무>;

export type 시장 = "코스피" | "코스닥";
const 이름: Record<string, 시장> = { Y: "코스피", K: "코스닥" };

export interface 시장가치 {
  시장: 시장;
  /** 흑자기업만으로 센 PER. 이것을 대표값으로 쓴다. */
  per: number | null;
  /** 적자까지 넣어 센 PER — 참고용 */
  perAll: number | null;
  pbr: number | null;
  /** 센 데 들어간 종목 수 */
  종목: number;
  적자: number;
  /** 시가총액 합 (조원) */
  시총: number;
  해: number | null;
}

/**
 * PER 은 흑자기업만으로 센다.
 *
 * 적자를 합계에 넣으면 분모가 깎여 수치가 뒤집힌다. 코스닥은 1,494종목 중
 * 840이 적자라, 전체로 세면 72배가 나오고 흑자만 세면 16배가 나온다.
 * 72배는 "코스닥이 비싸다" 가 아니라 "적자 회사가 많다" 는 뜻이라 PER 이라는
 * 이름으로 부르면 안 된다. KRX 공식 수치도 흑자기업 기준이다.
 *
 * PBR 은 전체로 센다. 자본은 적자여도 남아 있고, 자본잠식(자본 ≤ 0)은
 * 굳힐 때 이미 빼 두었다.
 */
function 세기(codes: string[], cap: Map<string, number>, 시장코드: "Y" | "K"): 시장가치 {
  let 시총 = 0, 자본 = 0, 순이익 = 0, 흑시총 = 0, 흑순이익 = 0;
  let 종목 = 0, 적자 = 0, 해: number | null = null;
  for (const code of codes) {
    const f = DATA[code];
    const c = cap.get(code);
    // 시총을 모르면 그 종목은 분자에서도 빼야 한다. 재무만 넣으면 값이 왜곡된다.
    if (!f || f.시 !== 시장코드 || !c || !(c > 0)) continue;
    종목++;
    해 ??= f.해;
    시총 += c;
    자본 += f.자;
    순이익 += f.순;
    if (f.순 > 0) { 흑시총 += c; 흑순이익 += f.순; } else 적자++;
  }
  const 나누기 = (a: number, b: number) => (b > 0 && a > 0 ? +(a / b).toFixed(2) : null);
  return {
    시장: 이름[시장코드],
    per: 나누기(흑시총, 흑순이익),
    perAll: 나누기(시총, 순이익),
    pbr: 나누기(시총, 자본),
    종목, 적자,
    시총: +(시총 / 1e12).toFixed(0),
    해,
  };
}

/** Redis 에 지표 크론이 넣어 둔 시가총액 (log10 원) 을 되읽는다 */
async function 시총읽기(codes: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!redis) return map;
  for (let i = 0; i < codes.length; i += 50) {
    const part = codes.slice(i, i + 50);
    const hit = await redis
      .mget<({ cap?: number } | null)[]>(...part.map((c) => `mx:${c}`))
      .catch(() => null);
    if (!hit) continue;
    hit.forEach((m, j) => {
      if (m && Number.isFinite(m.cap)) map.set(part[j], 10 ** (m.cap as number));
    });
  }
  return map;
}

/**
 * 코스피·코스닥 PER·PBR.
 *
 * 시총은 지표 크론이 채우는 것이라 크론이 아직 안 훑은 종목은 빠진다.
 * 몇 종목으로 셌는지 같이 돌려주므로 화면이 그것을 밝힐 수 있다.
 */
export const marketValue = () =>
  cached<시장가치[]>("mktval:v1", 3600, async () => {
    const codes = Object.keys(DATA);
    const cap = await 시총읽기(codes);
    return (["Y", "K"] as const).map((m) => 세기(codes, cap, m));
  });
