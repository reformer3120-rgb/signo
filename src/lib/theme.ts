// 네이버 금융 테마(세부 섹터) 인덱스. 서버 전용.
// 업종(예: "반도체와반도체장비")보다 훨씬 세분화된 그룹(HBM, 반도체 장비, 반도체 기판 …)을 제공.
import { cached } from "./cache";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" };

async function eucKr(url: string): Promise<string> {
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  const b = await r.arrayBuffer();
  return new TextDecoder("euc-kr").decode(b);
}

export interface ThemeGroup {
  no: string;
  name: string;
  codes: string[];
}
export interface ThemeIndex {
  groups: ThemeGroup[];
  /** 종목코드 → 소속 테마 no 목록 */
  byCode: Record<string, string[]>;
}

async function build(): Promise<ThemeIndex> {
  // 1) 테마 목록 (페이지네이션)
  const metas: { no: string; name: string }[] = [];
  const seen = new Set<string>();
  for (let p = 1; p <= 10; p++) {
    const html = await eucKr(`https://finance.naver.com/sise/theme.naver?&page=${p}`);
    const found = [...html.matchAll(/no=(\d+)"[^>]*>([^<]+)<\/a>/g)];
    if (!found.length) break;
    for (const m of found) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      metas.push({ no: m[1], name: m[2].trim() });
    }
  }
  // 2) 테마별 구성종목 (배치 병렬)
  const groups: ThemeGroup[] = [];
  for (let i = 0; i < metas.length; i += 30) {
    const batch = await Promise.all(
      metas.slice(i, i + 30).map(async (m) => {
        try {
          const html = await eucKr(
            `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${m.no}`,
          );
          const codes = [...new Set([...html.matchAll(/code=(\d{6})"/g)].map((x) => x[1]))];
          return { ...m, codes };
        } catch {
          return { ...m, codes: [] as string[] };
        }
      }),
    );
    groups.push(...batch.filter((g) => g.codes.length));
  }
  const byCode: Record<string, string[]> = {};
  for (const g of groups) {
    for (const c of g.codes) (byCode[c] ??= []).push(g.no);
  }
  return { groups, byCode };
}

/** 테마 인덱스 (12시간 캐시 — 구성종목은 자주 바뀌지 않음) */
export const themeIndex = () => cached("themeIndex:v1", 43_200, build);

/** 특정 종목이 속한 테마들 (구성종목 적은 = 더 구체적인 순) */
export async function themesOf(code: string): Promise<ThemeGroup[]> {
  const idx = await themeIndex();
  const nos = new Set(idx.byCode[code] ?? []);
  return idx.groups
    .filter((g) => nos.has(g.no))
    .sort((a, b) => a.codes.length - b.codes.length);
}

export async function themeByNo(no: string): Promise<ThemeGroup | undefined> {
  const idx = await themeIndex();
  return idx.groups.find((g) => g.no === no);
}
