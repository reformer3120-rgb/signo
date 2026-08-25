// 사람이 확인한 것을 규칙 결과 위에 얹는다.
//
// 규칙은 사업보고서를 기계로 읽은 결과고, 사람이 적어 준 것은 확인된 사실이다.
// 부딪히면 사람 쪽이 이긴다. 다만 규칙 결과를 지우지는 않는다 — 사람이 손대지
// 않은 종목이 훨씬 많고, 그쪽은 규칙이 유일한 근거다.
//
// 하는 일
//   · 편입 사유를 사람이 쓴 한 문장으로 바꾼다 (원문 발췌보다 읽기 쉽다)
//   · 사람이 정한 테마를 더한다
//   · 스팩은 테마에서 뺀다 — 실사업이 없다
//
// 실행 (분류 뒤, 데이터 만들기 전)
//   node scripts/theme/classify.mjs
//   node scripts/theme/apply-manual.mjs
//   node scripts/theme/build-data.mjs
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "./dict.mjs";

const DIR = ".cache/theme";
const CLS = path.join(DIR, "classified.json");
const MAN = path.join(DIR, "manual.json");

if (!fs.existsSync(MAN)) {
  console.error("manual.json 이 없다 — ingest-xlsx.mjs 를 먼저 돌릴 것.");
  process.exit(1);
}
const cls = JSON.parse(fs.readFileSync(CLS, "utf8"));
const man = JSON.parse(fs.readFileSync(MAN, "utf8"));
const ov = JSON.parse(fs.readFileSync(path.join(DIR, "overview.json"), "utf8"));

const idOf = Object.fromEntries(THEMES.map((t) => [t.name, t.id]));
const nameOf = (code) => ov[code]?.name ?? code;

// 스팩은 실사업이 없다 — 어느 테마에도 두지 않는다
const spac = new Set(
  Object.entries(man.특수 ?? {})
    .filter(([, v]) => /스팩|SPAC/i.test(v.kind ?? ""))
    .map(([c]) => c),
);
let dropped = 0;
for (const [id, list] of Object.entries(cls)) {
  const before = list.length;
  cls[id] = list.filter((s) => !spac.has(s.code));
  dropped += before - cls[id].length;
}

// 사람이 정한 테마를 더한다
let added = 0;
for (const [code, names] of Object.entries(man.배정 ?? {})) {
  for (const nm of names) {
    const id = idOf[nm];
    if (!id) continue;
    cls[id] ??= [];
    if (cls[id].some((s) => s.code === code)) continue;
    cls[id].push({
      code,
      name: nameOf(code),
      score: 99, // 사람이 확인한 것이므로 규칙 점수보다 위에 둔다
      why: ["작업지"],
      manual: true,
    });
    added++;
  }
}

// 편입 사유를 사람이 쓴 문장으로
let reworded = 0;
for (const list of Object.values(cls)) {
  for (const s of list) {
    const d = man.설명?.[s.code];
    if (d) { s.manualWhy = d; reworded++; }
  }
}

for (const id of Object.keys(cls)) cls[id].sort((a, b) => b.score - a.score);
fs.writeFileSync(CLS, JSON.stringify(cls, null, 1));

const codes = new Set(Object.values(cls).flatMap((l) => l.map((s) => s.code)));
console.log(`사람 배정 더함 ${added}건 · 편입 사유 교체 ${reworded}건 · 스팩 제거 ${dropped}건`);
console.log(`편입 종목 ${codes.size} · 테마 ${Object.values(cls).filter((l) => l.length).length}/${THEMES.length}`);
