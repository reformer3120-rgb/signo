// 전 종목 분류 작업지 자료.
//
// 코스피·코스닥 상장 전 종목을 테마별로 묶고, 아직 어느 테마에도 못 붙인
// 종목을 따로 모은다. 사람이 채울 칸을 두려면 무엇이 비어 있는지부터
// 알아야 한다.
//
// 실행
//   node scripts/theme/doc-all.mjs
// 결과 → .cache/theme/doc-all.json
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "./dict.mjs";

const DIR = ".cache/theme";
const rd = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

const listed = rd("listed.json");
const ov = rd("overview.json");
const caps = rd("kiscaps.json");
const themesData = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));

const nameOf = Object.fromEntries(listed.map((s) => [s.code, s.name]));
const capOf = (c) => caps[c]?.cap ?? null;
const perOf = (c) => caps[c]?.per ?? null;

/** 사업의 개요 첫머리 — 무엇 하는 회사인지 가늠하는 실마리 */
function gist(code, max = 90) {
  const t = ov[code]?.text;
  if (!t) return null;
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, "") + "…" : s;
}

const byId = Object.fromEntries(THEMES.map((t) => [t.id, t]));
const inTheme = new Set();

const themes = themesData.themes
  .map((t) => {
    const def = byId[t.id];
    const rows = t.stocks
      .filter((s) => nameOf[s.code]) // 상장 폐지된 것은 뺀다
      .map((s) => {
        inTheme.add(s.code);
        return {
          code: s.code,
          name: s.name,
          cap: capOf(s.code),
          per: perOf(s.code),
          why: s.why,
        };
      })
      .sort((a, b) => (b.cap ?? -1) - (a.cap ?? -1));
    return {
      id: t.id,
      name: t.name,
      group: t.group,
      hint: def?.hint ?? "",
      must: def?.must ?? "",
      none: def?.none ?? "",
      rows,
    };
  })
  .filter((t) => t.rows.length);

// 어느 테마에도 안 든 종목 — 여기가 사람이 채울 자리다
const rest = listed
  .filter((s) => !inTheme.has(s.code))
  .map((s) => ({
    code: s.code,
    name: s.name,
    cap: capOf(s.code),
    per: perOf(s.code),
    gist: gist(s.code),
    사유: ov[s.code]?.text ? null : (ov[s.code]?.skip ?? "수집안함"),
  }))
  .sort((a, b) => (b.cap ?? -1) - (a.cap ?? -1));

// 대분류로 묶는다
const groups = new Map();
for (const t of themes) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);

const out = {
  만든날: new Date().toISOString().slice(0, 10),
  상장종목: listed.length,
  편입종목: inTheme.size,
  미분류: rest.length,
  개요확보: listed.filter((s) => ov[s.code]?.text).length,
  대분류: [...groups.entries()].map(([name, ts]) => ({
    name,
    themes: ts,
    stocks: ts.reduce((a, t) => a + t.rows.length, 0),
  })),
  미분류목록: rest,
};

fs.writeFileSync(path.join(DIR, "doc-all.json"), JSON.stringify(out));
console.log(
  `상장 ${out.상장종목} · 편입 ${out.편입종목} · 미분류 ${out.미분류} · 개요확보 ${out.개요확보}`,
);
console.log(`대분류 ${out.대분류.length} · 테마 ${themes.length}`);
const noGist = rest.filter((r) => !r.gist).length;
console.log(`미분류 중 사업 설명 있는 것 ${rest.length - noGist} · 없는 것 ${noGist}`);
