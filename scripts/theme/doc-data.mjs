// 문서(PDF)에 넣을 자료를 한 덩어리로 모은다.
//
// 사전(dict.mjs)의 정의, 실제 편입 결과(themes.json), 응집도 측정값을
// 한곳에 모아 준다. 문서를 손으로 옮겨 적으면 사전을 고쳤을 때 어긋난다.
//
// 실행
//   node scripts/theme/doc-data.mjs
// 결과 → .cache/theme/doc.json
import fs from "node:fs";
import path from "node:path";
import { THEMES, EXCLUDED } from "./dict.mjs";

const DIR = ".cache/theme";
const data = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const byId = Object.fromEntries(data.themes.map((t) => [t.id, t]));

/** 평가 결과에서 테마별 응집도를 긁는다 */
function cohesionMap() {
  const m = {};
  for (const f of ["report-doc.txt", "report-final.txt"]) {
    const p = path.join(DIR, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      // "  ★ 2차전지 양극재            0.759  (12/25종목)"
      const g = /^\s*[★·\s]\s*(.+?)\s{2,}(\d\.\d{3})\s+\(\d+\/(\d+)종목\)/.exec(line);
      if (g) m[g[1].trim()] = { v: Number(g[2]), n: Number(g[3]) };
    }
    if (Object.keys(m).length) break;
  }
  return m;
}

/** 견줌 요약 */
function summary() {
  const p = path.join(DIR, "report-doc.txt");
  const txt = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  const pick = (re) => {
    const m = re.exec(txt);
    return m ? m[1] : null;
  };
  return {
    ours: pick(/우리 분류 평균\s+([\d.]+)/),
    random: pick(/무작위 묶음 평균\s+([\d.]+)/),
    p95: pick(/무작위 상위 5% 경계\s+([\d.]+)/),
    beat: pick(/무작위 상위 5% 를 넘은 테마\s+(\d+\/\d+)/),
    fn: pick(/에프앤가이드 평균\s+([\d.]+)/),
    ratio: pick(/응집도 자체로는 (\d+)%/),
  };
}

const coh = cohesionMap();
const groups = new Map();
for (const t of THEMES) {
  const live = byId[t.id];
  if (!live) continue;
  const c = coh[t.name] ?? null;
  const row = {
    id: t.id,
    name: t.name,
    group: live.group,
    hint: t.hint,
    must: t.must,
    none: t.none,
    core: t.core ?? [],
    sub: t.sub ?? [],
    ctx: t.ctx ? String(t.ctx) : null,
    notWith: t.notWith ? String(t.notWith) : null,
    veto: t.veto ?? [],
    count: live.stocks.length,
    cohesion: c ? c.v : null,
    // 시총 순은 여기서 모르므로, 사전 점수 순 상위 몇 개를 보기용으로
    sample: live.stocks.slice(0, 6).map((s) => s.name),
  };
  groups.set(live.group, [...(groups.get(live.group) ?? []), row]);
}

const out = {
  만든날: data.만든날,
  기준: data.기준,
  출처: data.출처,
  테마수: THEMES.length,
  종목수: new Set(data.themes.flatMap((t) => t.stocks.map((s) => s.code))).size,
  편입건수: data.themes.reduce((a, t) => a + t.stocks.length, 0),
  요약: summary(),
  대분류: [...groups.entries()].map(([name, themes]) => ({
    name,
    themes,
    count: themes.reduce((a, t) => a + t.count, 0),
  })),
  제외: EXCLUDED,
};

fs.writeFileSync(path.join(DIR, "doc.json"), JSON.stringify(out, null, 1));
console.log(
  `대분류 ${out.대분류.length} · 테마 ${out.테마수} · 종목 ${out.종목수} · 편입 ${out.편입건수}`,
);
console.log(`응집도 확보 ${Object.keys(coh).length}개 · 요약 ${JSON.stringify(out.요약)}`);
