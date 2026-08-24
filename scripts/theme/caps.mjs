// 종목별 시가총액. 응집도를 공정하게 재려면 필요하다.
//
// 기준선 0.579 는 에프앤가이드 테마의 "시총 상위 12종목" 으로 쟀다.
// 우리 분류를 점수 상위로 뽑아 견주면 소형주끼리 견주는 셈이라 불리하다.
// 같은 조건으로 맞추려면 우리 쪽도 시총 순으로 뽑아야 한다.
//
// 네이버 종목 통합 API 의 totalInfos 에 "시총" 이 들어 있다.
// "1,502조 4,936억" 같은 한글 표기라 억 단위 숫자로 바꾼다.
import fs from "node:fs";
import path from "node:path";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0" };
const DIR = ".cache/theme";
const OUT = path.join(DIR, "caps.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "1,502조 4,936억" · "8,877억" → 억 단위 숫자 */
export function parseCap(s) {
  if (!s) return null;
  const t = String(s).replace(/,/g, "");
  const jo = /(\d+)\s*조/.exec(t);
  const eok = /(\d+)\s*억/.exec(t);
  if (!jo && !eok) return null;
  return (jo ? Number(jo[1]) * 10_000 : 0) + (eok ? Number(eok[1]) : 0);
}

async function capOf(code) {
  const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
    headers: UA,
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = await r.json();
  const hit = (j.totalInfos ?? []).find((t) => t.code === "marketValue");
  return parseCap(hit?.value);
}

/** 필요한 종목의 시총을 채운다 (이어받기) */
export async function ensureCaps(codes, log = () => {}) {
  fs.mkdirSync(DIR, { recursive: true });
  const have = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = codes.filter((c) => have[c] === undefined);
  if (!todo.length) return have;
  log(`시총 수집 ${todo.length}종목`);
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(
      todo.slice(i, i + 8).map(async (c) => {
        try { have[c] = await capOf(c); } catch { have[c] = null; }
      }),
    );
    if (i % 80 === 0) fs.writeFileSync(OUT, JSON.stringify(have));
    await sleep(120);
  }
  fs.writeFileSync(OUT, JSON.stringify(have));
  return have;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const cls = JSON.parse(fs.readFileSync(path.join(DIR, "classified.json"), "utf8"));
  const codes = [...new Set(Object.values(cls).flat().map((x) => x.code))];
  const caps = await ensureCaps(codes, console.log);
  const got = codes.filter((c) => caps[c]).length;
  console.log(`완료 — ${got}/${codes.length}`);
}
