// 사람이 채운 작업지(xlsx)를 분류에 반영한다.
//
// ── 무엇을 받아들이고 무엇을 버리나 ────────────────────────
// 받아들인다
//   · 수기검증 설명    — 사람이 확인한 한 문장. 원문 발췌보다 낫다.
//   · 확정 배정        — (종목, 테마) 가 함께 적힌 행
//   · 특수목적법인 구분 — 지주회사·리츠·스팩
//
// 버린다
//   · 자동요약(원문기반) — 규칙으로 뽑은 것이라 목차·안내문이 섞여 있다.
//     "III. 재무에 관한 사항 1. 요약재무정보", "'를 참조하시기 바랍니다" 같은
//     것들이다. 내 파서가 뽑은 것과 같은 종류의 결과라 넣을 이유가 없다.
//
// ── 테마가 안 적힌 행 ──────────────────────────────────────
// 미분류였다가 편입된 1,060종목은 시트(대분류)만 있고 세부 테마가 없다.
// 사람이 적어 준 설명을 근거로, 그 대분류 안에서만 세부 테마를 고른다.
// 원문 전체가 아니라 한 문장을 보는 것이라 잡음이 거의 없다.
//
// 실행
//   node scripts/theme/ingest-xlsx.mjs <xlsx경로>
// 결과 → .cache/theme/manual.json  { 설명, 배정, 특수 }
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { THEMES } from "./dict.mjs";
import { wordIn } from "./classify.mjs";


const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error("작업지 xlsx 경로를 달라.");
  process.exit(1);
}
const DIR = ".cache/theme";
fs.mkdirSync(DIR, { recursive: true });

// 파이썬으로 시트를 JSON 으로 뽑아 온다 (노드에 xlsx 라이브러리가 없다)
const py = `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
out = {}
for ws in wb.worksheets:
    rows = []
    for r in ws.iter_rows(values_only=True):
        rows.append(["" if c is None else str(c) for c in r])
    out[ws.title] = rows
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
`;
const tmpPy = path.join(DIR, "_xlsx.py");
const tmpJson = path.join(DIR, "_xlsx.json");
fs.writeFileSync(tmpPy, py);
execFileSync("python", [tmpPy, SRC, tmpJson], { stdio: "inherit" });
const book = JSON.parse(fs.readFileSync(tmpJson, "utf8"));
fs.rmSync(tmpPy, { force: true });
fs.rmSync(tmpJson, { force: true });

const byName = Object.fromEntries(THEMES.map((t) => [t.name, t]));
const pad = (c) => String(c ?? "").replace(/\D/g, "").padStart(6, "0");
const isManual = (c) => /수기/.test(c ?? "");

/** 대분류 시트 이름 → 테마 id 앞머리 */
const GROUP = {
  "2차전지": "batt", 반도체: ["semi", "elec"], 디스플레이: ["disp", "elec"],
  제약바이오: ["bio", "med"], 산업재: ["ind", "mat"], 에너지전력: "eng",
  소재: ["mat", "elec"], 자동차: "car", IT플랫폼: "it",
  소비재: ["csm", "it"], 금융: "fin",
};
const themesOfGroup = (sheet) => {
  const p = GROUP[sheet];
  if (!p) return THEMES;
  const ps = Array.isArray(p) ? p : [p];
  return THEMES.filter((t) => ps.some((x) => t.id.startsWith(x + "-")));
};

const 설명 = {};   // code -> desc
const 배정 = {};   // code -> Set(theme name)
const 특수 = {};   // code -> 구분
let auto = 0, blank = 0, unassigned = [];

for (const [sheet, rows] of Object.entries(book)) {
  if (sheet === "읽어주세요") continue;

  if (sheet === "특수목적법인") {
    for (const r of rows.slice(1)) {
      const [kind, name, code] = r;
      if (!code) continue;
      특수[pad(code)] = { kind, name };
    }
    continue;
  }
  if (sheet === "미분류") continue; // 제안일 뿐 확정이 아니다

  for (const r of rows.slice(1)) {
    const [sub, name, code, , , desc, conf] = r;
    if (!name) continue;
    const c = pad(code);
    if (!/^\d{6}$/.test(c)) continue;

    if (!isManual(conf)) { auto++; continue; }
    if (!desc || desc.startsWith("(설명 미확보")) { blank++; continue; }

    설명[c] = desc.trim();
    const t = String(sub ?? "").replace(/\(재분류\)/g, "").trim();
    if (t && byName[t]) (배정[c] ??= new Set()).add(t);
    else unassigned.push({ code: c, name, sheet, desc: desc.trim() });
  }
}

/**
 * 사람이 쓴 한 문장에서 테마를 고른다.
 *
 * 분류기의 규칙을 그대로 쓰면 거의 안 걸린다. 그쪽 낱말은 사업보고서 문어체에
 * 맞춰져 있기 때문이다 — "완성차를 제조" 를 찾는데 사람은 "완성차 제조사로" 라고
 * 쓴다. 1,071건 중 129건만 잡혔다.
 *
 * 그래서 여기서는 느슨하게 본다. 근거가 셋이나 있기 때문이다.
 *   · 문장이 이미 사람 손을 거쳤다 (시황·표·전방산업 같은 잡음이 없다)
 *   · 대분류가 정해져 있어 후보가 두세 개뿐이다
 *   · 테마 이름 자체가 문장에 자주 그대로 들어 있다 ("완성차 제조사로")
 */
// 낱말 찾기는 분류기와 같은 자를 쓴다 — 띄어쓰기를 넘나들되 낱말 한가운데에서는
// 시작하지 않는다. 예전에는 여기서도 양쪽 띄어쓰기를 지우고 견줬는데,
// "특수 산업기계를 생산하는 DKME" 가 "특수산업기계" 안의 "수산" 으로
// 농수축산에 들어갔다.
// 울타리 밖을 볼 때는 엄격하게 본다 — 낱말 한가운데에서 시작하는 짝을 받지
// 않는다. "석유제품 유통업" 이 유"제품" 으로 음식료에, "LPG" 가 -PG 로 결제에
// 잡히던 것이 그래서다. 울타리 안에서는 시트가 문맥을 주므로 느슨하게 둔다 —
// 조이면 "가죽원단" 의 -원단 같은 멀쩡한 짝까지 놓친다.
const 있나 = (desc, word, 엄격) => wordIn(desc.replace(/[()]/g, " "), word, 엄격);

/**
 * 흔한 낱말은 홀로 서지 못한다.
 *
 * 사업보고서 3,035건 중 "건설" 은 511건(16.8%), "유통" 은 783건(25.8%),
 * "솔루션" 은 746건(24.6%), "인프라" 는 513건(16.9%)에 나온다. 이런 말 하나로는
 * 업종이 안 정해진다 — 동국제강(철근)이 "건설경기의 영향을 받는다" 로 건설사가,
 * 흥구석유(석유 유통)가 "유통업을 영위" 로 편의점 테마가 됐다.
 * 대분류 울타리 안에서는 시트가 문맥을 주지만, 밖에서 찾을 때는 그게 없다.
 * 그래서 울타리 밖 판정에는 10% 미만으로 나오는 낱말이 하나는 있어야 한다.
 */
const DF = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "df.json"), "utf8")); } catch { return null; }
})();
const 드문말 = (w) => {
  const n = DF?.[w];
  return n == null ? true : n / DF["__문서수"] < 0.1;
};

/** 테마 이름에서 알맹이 낱말을 뽑는다 — "2차전지 양극재" → [2차전지, 양극재] */
function nameWords(name) {
  return name
    .replace(/[()]/g, " ")
    .split(/[·\s]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

let matched = 0, 건너뜀 = 0;
const 미배정 = [];
const 울타리밖 = [];
for (const u of unassigned) {
  const d = u.desc;
  const 채점 = (후보, 엄격 = false) => 후보
    .map((t) => {
      let sc = 0;
      const why = [];
      const 짚 = [];
      const 세기 = (w, p) => { if (있나(d, w, 엄격)) { sc += p; why.push(w); 짚.push(w); } };
      for (const w of t.core ?? []) 세기(w, 3);
      for (const w of t.sub ?? []) 세기(w, 1);
      // also 는 짧은 문장용 낱말이다. 사업보고서 문어체가 아니라 사람이 쓰는 말로
      // 적어 둔 것이라 여기서만 쓴다 ("이동통신", "카지노", "정수기" 같은 것들).
      for (const w of t.also ?? []) 세기(w, 3);
      // 테마 이름이 문장에 그대로 있으면 가장 강한 단서다
      for (const w of nameWords(t.name)) 세기(w, 2);

      // 낱말이 통째로는 없어도 조각이 다 있으면 센다.
      // "자동차 부품" 을 찾는데 사람은 "자동차용 열관리시스템 … 부품사다" 라고 쓴다.
      // 붙어 있지 않을 뿐 둘 다 있으면 같은 뜻이다.
      for (const w of [...(t.core ?? []), t.name]) {
        const parts = w.split(/[\s·]+/).filter((x) => x.length >= 2);
        if (parts.length < 2) continue;
        if (parts.every((x) => 있나(d, x, 엄격)) && !있나(d, w, 엄격)) {
          sc += 2;
          why.push(w + "(조각)");
          짚.push(...parts);
        }
      }
      return { t, sc, why, 드묾: 짚.some(드문말) };
    })
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc);

  let scored = 채점(themesOfGroup(u.sheet));

  // 대분류 안에서 못 찾으면 전체에서 한 번 더 본다.
  //
  // 대분류는 작업지의 시트 이름이고, 테마는 산업 구조를 따라 나눈 것이라 둘이
  // 늘 맞아떨어지지 않는다. 웅진은 소비재 시트에 있지만 "웅진그룹 지주회사다"
  // 이므로 지주회사(fin-)여야 하고, 대원전선은 산업재 시트에 있지만
  // "전선을 생산" 이므로 전력기기·전선(eng-)이다. 시트만 보면 둘 다 미배정이 된다.
  //
  // 다만 울타리를 걷으면 후보가 아흔 개 넘게 늘어 엉뚱한 낱말 하나에 걸리기 쉽다.
  // 그래서 밖에서 찾을 때는 (1) 핵심 낱말이나 테마 이름이 통째로 들어 있어야 하고
  // (3점), (2) 그중 하나는 흔치 않은 말이어야 하며, (3) 으뜸이 하나뿐이어야 한다.
  let 밖 = false;
  if (!scored.length) {
    const all = 채점(THEMES, true).filter((x) => x.sc >= 3 && x.드묾);
    if (all.length && (all.length === 1 || all[0].sc > all[1].sc)) {
      scored = [all[0]];
      밖 = true;
      울타리밖.push({ ...u, theme: all[0].t.name, sc: all[0].sc, next: all[1]?.sc ?? 0, why: all[0].why });
    }
    else if (all.length) 건너뜀++;
  }

  if (scored.length) {
    matched++;
    (배정[u.code] ??= new Set()).add(scored[0].t.name);
    // 점수가 비등하면 둘 다 넣는다 — 한 종목이 여러 테마에 드는 것은 정상이다
    if (!밖) for (const x of scored.slice(1)) if (x.sc >= scored[0].sc) 배정[u.code].add(x.t.name);
  } else {
    미배정.push(u);
  }
}
fs.writeFileSync(
  path.join(DIR, "manual-outgroup.json"),
  JSON.stringify(울타리밖, null, 1),
);
fs.writeFileSync(
  path.join(DIR, "manual-unmatched.json"),
  JSON.stringify(미배정.map((u) => ({ code: u.code, name: u.name, sheet: u.sheet, desc: u.desc })), null, 1),
);

const outObj = {
  만든날: new Date().toISOString().slice(0, 10),
  설명,
  배정: Object.fromEntries(Object.entries(배정).map(([k, v]) => [k, [...v]])),
  특수,
};
fs.writeFileSync(path.join(DIR, "manual.json"), JSON.stringify(outObj));

console.log(`수기검증 설명 ${Object.keys(설명).length}종목 · 자동요약 ${auto}행 버림 · 빈칸 ${blank}행`);
console.log(`테마 배정 ${Object.keys(배정).length}종목`);
console.log(`  테마가 적혀 있던 것 ${Object.keys(배정).length - matched}`);
console.log(`  설명으로 찾아낸 것  ${matched} / ${unassigned.length}` +
  `  (못 찾은 것은 .cache/theme/manual-unmatched.json)`);
console.log(`특수목적법인 ${Object.keys(특수).length}종목`);
const kinds = {};
for (const v of Object.values(특수)) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
console.log("  " + Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(" · "));
