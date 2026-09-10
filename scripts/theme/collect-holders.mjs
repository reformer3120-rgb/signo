// 5% 이상 대량보유자를 이름·지분·국적까지 모은다.
//
// ── 왜 필요한가 ───────────────────────────────────────────
// 주주 구성 원형에서 "외국인"만 한 조각으로 두면 누가 들고 있는지 알 수 없다.
// 블랙록이 7% 들고 있으면 블랙록이라고 적어야 한다.
//
// ── 국적을 이름으로 가르면 안 된다 ──────────────────────────
// 처음에는 이름이 로마자면 외국계로 보려 했다. 두 방향으로 다 틀린다.
//
//   국내인데 로마자   POSCO홀딩스 · LS전선 · KG케미칼
//   외국인데 한글     피델리티매니지먼트앤리서치컴퍼니엘엘씨 (대한약품 8.14%)
//
// 대량보유상황보고서에는 국적 칸이 따로 있다. 그것을 읽는다.
//
// ── 태그를 지우고 읽으면 안 된다 ───────────────────────────
// 태그를 지운 글에서 "국적" 뒤 첫 값을 집었더니 정의선 50.36% 가 외국법인으로
// 나왔다. 보고자가 여럿이고 첫 행이 Den Norske Amerikalinje AS(외국법인)
// 였을 뿐이다.
//
// DART 문서에는 기계용 코드가 붙어 있어 표를 헤아릴 필요가 없다.
//
//   ACODE="IFR_NM"    성명(한글)    "블랙록 펀드 어드바이저스"
//   ACODE="IFR_NT"    국적          "미국"
//   AUNIT="CRP_TP"    보고자 구분    "외국법인" / "개인(국내)"
//
// 한글 이름을 준다는 것이 덤이다 — majorstock 은 BlackRockFundAdvisors 로
// 주는데 이쪽은 화면에 그대로 쓸 수 있는 이름이다.
//
// 실행
//   node scripts/theme/collect-holders.mjs            이어서 모은다
//   node scripts/theme/collect-holders.mjs --limit 60 앞 60종목만 (시험용)
import fs from "node:fs";
import path from "node:path";
import { KEY, 원문글 } from "./dart.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "holders.json");
const DOCS = path.join(DIR, "holder-docs.json"); // rcept_no → 읽은 값. 문서는 안 바뀐다.
const MIN = 5; // 대량보유 보고 의무 기준

const 인자 = (n, 기본) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? Number(process.argv[i + 1]) : 기본;
};
const LIMIT = 인자("--limit", Infinity);

const 읽기 = (p, 기본) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : 기본);
const out = 읽기(OUT, {});
const docs = 읽기(DOCS, {});

const corp = 읽기(path.join(DIR, "corp.json"), {});
const 코드 = {};
for (const v of Object.values(corp)) if (v?.code) 코드[v.code] = v.corp;

const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const 종목 = themes.themes.flatMap((t) => t.stocks).filter((s) => 코드[s.code]);

const 값 = (xml, re) => (xml.match(re) ?? [])[1]?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null;

/** 보고서 한 건에서 보고자의 이름·국적·구분을 읽는다 */
async function 문서읽기(rcept) {
  if (docs[rcept]) return docs[rcept];
  // 원문은 dart.mjs 가 남겨 둔다 — 개요·매출·부문 수집기와 같은 것을 본다.
  const xml = await 원문글(rcept);
  if (!xml) return (docs[rcept] = null);
  const v = {
    이름: 값(xml, /ACODE="IFR_NM"[^>]*>([^<]*)</),
    국적: 값(xml, /ACODE="IFR_NT"[^>]*>([^<]*)</),
    구분: 값(xml, /AUNIT="CRP_TP"[^>]*>([^<]*)</),
  };
  return (docs[rcept] = v.이름 || v.국적 || v.구분 ? v : null);
}

/** 외국계인가 — 구분이 먼저고, 없으면 국적으로 본다. 이름은 보지 않는다. */
function 외국인가(v) {
  if (!v) return null;
  if (v.구분) return /외국/.test(v.구분);
  if (v.국적) return !/대한민국|한국/.test(v.국적);
  return null;
}

let 한것 = 0, 새로 = 0, 못읽음 = 0;
const 시작 = Date.now();
for (const s of 종목) {
  if (한것 >= LIMIT) break;
  한것++;
  if (out[s.code]) continue; // 이미 모은 종목은 건너뛴다

  let j;
  try {
    j = await (await fetch(`https://opendart.fss.or.kr/api/majorstock.json?crtfc_key=${KEY}&corp_code=${코드[s.code]}`)).json();
  } catch { continue; }
  if (j.status !== "000") { out[s.code] = { rows: [] }; continue; }

  // 보고자마다 가장 최근 보고서만 본다
  const 최근 = new Map();
  for (const r of j.list ?? []) {
    const k = (r.repror ?? "").trim();
    if (!k) continue;
    if (!최근.has(k) || r.rcept_dt > 최근.get(k).rcept_dt) 최근.set(k, r);
  }

  const rows = [];
  for (const r of [...최근.values()]) {
    const pct = parseFloat(r.stkrt) || 0;
    if (pct < MIN) continue; // 5% 밑으로 내려간 것은 지금 대량보유자가 아니다
    const v = await 문서읽기(r.rcept_no);
    if (!v) 못읽음++;
    rows.push({
      // 화면에는 문서의 한글 이름을 쓴다. majorstock 은 BlackRockFundAdvisors 로 준다.
      name: v?.이름 || r.repror,
      pct: +pct.toFixed(2),
      구분: v?.구분 ?? null,
      국적: v?.국적 ?? null,
      foreign: 외국인가(v),
      asOf: r.rcept_dt,
    });
  }
  rows.sort((a, b) => b.pct - a.pct);
  out[s.code] = { rows };
  새로++;

  if (새로 % 25 === 0) {
    fs.writeFileSync(OUT, JSON.stringify(out));
    fs.writeFileSync(DOCS, JSON.stringify(docs));
    const 초 = ((Date.now() - 시작) / 1000).toFixed(0);
    console.log(`  ${한것}/${Math.min(종목.length, LIMIT)} · 새로 ${새로} · 문서 못 읽음 ${못읽음} · ${초}초`);
  }
}

fs.writeFileSync(OUT, JSON.stringify(out));
fs.writeFileSync(DOCS, JSON.stringify(docs));

const 있는것 = Object.values(out).filter((v) => v.rows.length);
const 전체행 = 있는것.flatMap((v) => v.rows);
const 외국 = 전체행.filter((r) => r.foreign === true);
const 미상 = 전체행.filter((r) => r.foreign === null);
console.log(`\n종목 ${Object.keys(out).length} · 대량보유자 있는 종목 ${있는것.length}`);
console.log(`  보유자 ${전체행.length}명 · 외국계 ${외국.length}명 · 국적 미상 ${미상.length}명`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
if (외국.length) {
  console.log("\n외국계 보기:");
  for (const r of 외국.slice(0, 8)) console.log(`   ${String(r.pct).padStart(6)}%  ${r.구분}/${r.국적}  ${r.name}`);
}
