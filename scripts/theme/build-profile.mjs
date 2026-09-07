// 개요 카드가 쓸 것들을 하나로 굳힌다 — 매출 구성과 대량보유자.
//
// ── 설립 연도는 싣지 않는다 ────────────────────────────────
// 처음에는 넣었다가 뺐다. 셋이 걸렸다.
//   커버리지 54%   1,343/2,496. 칩이 있다 없다 하면 없는 종목이 빠진 것처럼 보인다.
//   연혁은 문장에  의미가 생기는 것은 설립 연도가 아니라 그 뒤의 사건이고,
//                 사업보고서에 적힌 회사는 개요 문장이 이미 담는다
//                 (셀트리온 "2023년 12월 셀트리온헬스케어를 합병").
//   판단에 안 쓰임 "1973년 설립"이 삼성전기를 볼 때 바꾸는 것이 별로 없다.
// 받아 둔 company.json 은 지운 것이 아니라 그대로 둔다 — 연혁을 제대로 다룰
// 일이 생기면 그때 쓴다.
//
// 모으는 것과 굳히는 것을 나눈 이유는 themes.json·about.json 과 같다.
// 원문 39MB 를 배포에 실을 수 없으므로 만든 결과만 커밋한다.
//
// ── 조각을 몇 개까지 보이나 ────────────────────────────────
// 조각 수 중앙이 2 이고 9할이 4 이하다. 넷을 넘는 것은 110종목뿐이라
// 상위 넷만 두고 나머지를 "그 밖" 으로 묶는다. 범례가 길어지면 폰에서
// 카드가 통째로 길어진다.
//
// ── 외국인 조각은 여기서 만들지 않는다 ──────────────────────
// 외국인 보유비중은 시세와 함께 움직여 하루에도 바뀐다. 굳혀 두면 낡는다.
// 화면이 그릴 때 시세에서 받아 합친다. 여기서는 대량보유자가 외국계인지만
// 표시해 둔다 — 그래야 화면이 "외국인 25.4% (블랙록 7.1% 포함)" 처럼
// 겹침을 밝힐 수 있다.
//
// 실행
//   node scripts/theme/build-profile.mjs   → src/data/profile.json
import fs from "node:fs";
import path from "node:path";

const DIR = ".cache/theme";
const OUT = "src/data/profile.json";
const MAX조각 = 4;

const 읽기 = (p, 기본) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : 기본);
const segments = 읽기(path.join(DIR, "segments.json"), {});
const holders = 읽기(path.join(DIR, "holders.json"), {});
const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const 종목 = themes.themes.flatMap((t) => t.stocks);

/** 매출 구성 — 상위 넷 + 그 밖. 백분율로 굳혀 화면이 다시 계산하지 않게 한다. */
function 매출(code) {
  const v = segments[code];
  if (!v?.rows?.length) return null;
  const 합 = v.rows.reduce((a, r) => a + r.v, 0);
  if (합 <= 0) return null;
  const 몫 = (x) => +((100 * x) / 합).toFixed(1);
  const 상위 = v.rows.slice(0, MAX조각).map((r) => ({ name: r.label, pct: 몫(r.v) }));
  const 밖 = v.rows.slice(MAX조각).reduce((a, r) => a + r.v, 0);
  // 0.1% 도 안 되는 "그 밖" 은 조각으로 두지 않는다 — 범례만 한 줄 늘린다
  if (밖 > 0 && 몫(밖) >= 0.1) 상위.push({ name: "그 밖", pct: 몫(밖) });
  return { rows: 상위, asOf: v.asOf ?? null, report: v.report ?? null };
}

/** 대량보유자 — 5% 이상. 외국계 여부를 달아 둔다. */
function 주주(code) {
  const rows = holders[code]?.rows ?? [];
  if (!rows.length) return null;
  return {
    rows: rows.slice(0, 4).map((r) => ({
      name: r.name,
      pct: r.pct,
      // 국적은 공시의 국적 칸에서 읽은 것이다. 이름으로 가르지 않았다.
      foreign: r.foreign === true,
      구분: r.구분 ?? null,
    })),
    asOf: rows[0]?.asOf ?? null,
  };
}

const out = {};
let 매출수 = 0, 주주수 = 0;
for (const s of 종목) {
  const m = 매출(s.code);
  const h = 주주(s.code);
  if (!m && !h) continue;
  if (m) 매출수++;
  if (h) 주주수++;
  out[s.code] = { ...(m ? { 매출: m } : {}), ...(h ? { 주주: h } : {}) };
}

fs.writeFileSync(OUT, JSON.stringify(out));
const 원형둘 = Object.values(out).filter((v) => (v.매출?.rows.length ?? 0) >= 2 && v.주주).length;
console.log(`종목 ${Object.keys(out).length} / ${종목.length}`);
console.log(`  매출 구성 ${매출수} · 대량보유자 ${주주수}`);
console.log(`  원형 둘 다 서는 종목 ${원형둘}`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
