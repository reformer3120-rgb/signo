// 사업부문별 매출을 표 구조 그대로 읽는다.
//
// ── 왜 다시 만드나 ────────────────────────────────────────
// sales.json 은 테마 분류에는 충분했지만 화면에 낼 품질이 아니었다. 원형
// 그래프로 띄우자마자 드러났다.
//
//   셀트리온     "및 용역 등 CT-P13 바이오시밀러 외"   ← 세 칸이 붙었다
//   링크제니시스  "중국外 63% · 대만 13% · 북미 7%"     ← 지역별 표를 긁었다
//   노타         "다음과 같습니다. 구분 도 도 고객 A"   ← 환율 민감도 표
//
// 원인은 태그를 지운 글에서 낱말을 걸어 읽은 것이다. 컬럼 경계가 사라지니
// 이어붙고, 어느 표에서 왔는지도 알 수 없다.
//
// ── 표를 표로 읽는다 ──────────────────────────────────────
// 매출실적표는 머리글이 정해져 있다.
//
//   <TH>사업부문</TH> <TH>매출유형</TH> <TH>품 목</TH> <TH>제35기</TH> …
//
// 머리글로 표를 고르고, 컬럼 자리로 값을 집는다. 옆 칸이 딸려 올 수 없다.
//
// ── 병합을 풀어야 한다 ────────────────────────────────────
// 사업부문 칸은 ROWSPAN 으로 묶여 있다. 둘째 행에는 그 칸이 아예 없다.
//
//   <TD ROWSPAN="2">바이오의약품</TD> <TD>제품 및 용역 등</TD> …
//   <TD>기타</TD> <TD>기타</TD> …      ← 사업부문 자리가 비어 있다
//
// 그대로 읽으면 "기타" 가 사업부문이 된다. 위에서 이어받아야 한다.
//
// 실행
//   node scripts/theme/collect-segments.mjs             이어서 모은다
//   node scripts/theme/collect-segments.mjs --limit 40  앞 40종목만
import fs from "node:fs";
import path from "node:path";
import { KEY, unzipAll, decode } from "./dart.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "segments.json");
const 인자 = (n, 기본) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : 기본; };
const LIMIT = 인자("--limit", Infinity);

const 읽기 = (p, 기본) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : 기본);
const out = 읽기(OUT, {});
const corp = 읽기(path.join(DIR, "corp.json"), {});
const 코드 = {};
for (const v of Object.values(corp)) if (v?.code) 코드[v.code] = v.corp;
const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const 종목 = themes.themes.flatMap((t) => t.stocks).filter((s) => 코드[s.code]);

const 글 = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
/**
 * 칸에서 금액을 읽는다.
 *
 * 그냥 Number() 로는 안 된다. 실제 칸은 이렇게 생겼다.
 *   "21,094(14,745)"  원화 뒤에 괄호로 외화를 적는다 (딜리)
 *   "△1,234"          음수를 세모로 적는다
 *   "74.4%"           비중을 적은 칸
 *   "-"               값 없음
 * 앞머리의 수만 집는다.
 */
const 돈 = (s) => {
  const m = String(s ?? "").trim().match(/^[△▲▽▼-]?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return NaN;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return /^[△▲▽▼-]/.test(String(s).trim()) ? -n : n;
};

/** 표 한 덩이를 행×칸 배열로 편다. ROWSPAN·COLSPAN 을 풀어 자리를 맞춘다. */
function 표풀기(tbl) {
  const rows = [];
  const 이월 = []; // {값, 남음} — 아래로 이어지는 칸
  for (const m of tbl.matchAll(/<TR\b[^>]*>([\s\S]*?)<\/TR>/gi)) {
    const 칸 = [];
    let 자리 = 0;
    const 남은것 = [...(m[1].matchAll(/<T[DHUE]\b([^>]*)>([\s\S]*?)<\/T[DHUE]>/gi))];
    let 다음 = 0;
    while (다음 < 남은것.length || 이월.some((c) => c && c.남음 > 0)) {
      const c = 이월[자리];
      if (c && c.남음 > 0) { 칸[자리] = c.값; c.남음--; 자리++; continue; }
      if (다음 >= 남은것.length) break;
      const [, 속성, 속] = 남은것[다음++];
      const 값 = 글(속);
      const rs = Number((속성.match(/ROWSPAN="(\d+)"/i) ?? [])[1] ?? 1);
      const cs = Number((속성.match(/COLSPAN="(\d+)"/i) ?? [])[1] ?? 1);
      for (let k = 0; k < cs; k++) {
        칸[자리] = 값;
        if (rs > 1) 이월[자리] = { 값, 남음: rs - 1 };
        자리++;
      }
    }
    if (칸.length) rows.push(칸);
  }
  return rows;
}

/**
 * 매출실적표를 찾아 부문별 금액을 뽑는다.
 *
 * 머리글 낱말로 표를 고르려다 실패했다. 회사마다 머리글이 다르고
 * (사업부문 / 품목 / 구분), 엉뚱한 표가 같은 낱말을 쓴다 — 사람인은
 * "사업부문" 이 든 표가 직원 현황표 하나뿐이었다.
 *
 * 그래서 사람이 읽는 대로 한다. "매출실적" 이라는 제목 바로 뒤의 표를 잡고,
 * 컬럼은 이름이 아니라 자리로 정한다.
 *
 *   값 칸    데이터 행 대부분이 숫자인 가장 왼쪽 칸 (= 당기)
 *   이름 칸  그 왼쪽의 첫 글자 칸 (= 사업부문, 없으면 품목)
 *
 * 셀트리온 [사업부문 매출유형 품목 값…] · 알서포트 [품목 값…] ·
 * 사람인 [사업부문 구분 값…] 이 모두 같은 규칙으로 풀린다.
 */
function 부문뽑기(xml) {
  // 제목은 문서 앞 목차에도 나온다. 첫 매치만 보면 목차 뒤를 뒤지다 만다.
  // 나오는 자리를 모두 훑어 표가 풀리는 곳을 쓴다.
  const 자리 = [...xml.matchAll(/매\s*출\s*실\s*적|매출\s*및\s*수주/g)].map((x) => x.index);
  for (const 시작 of 자리) {
    const 뽑은것 = 구역에서(xml.slice(시작, 시작 + 60000));
    if (뽑은것) return 뽑은것;
  }
  return null;
}

/** 한 구역 안의 표들을 차례로 보며 부문별 금액을 뽑는다 */
function 구역에서(구역) {
  for (const m of 구역.matchAll(/<TABLE\b[\s\S]*?<\/TABLE>/gi)) {
    const tbl = m[0];
    const rows = 표풀기(tbl).filter((r) => r.length >= 2);
    if (rows.length < 2) continue;

    const 폭 = Math.max(...rows.map((r) => r.length));
    const 숫자 = (v) => Number.isFinite(돈(v)) && String(v).trim() !== "";
    // 값 칸 — 데이터 행의 절반 넘게가 숫자인 가장 왼쪽 칸
    let 값칸 = -1;
    for (let c = 1; c < 폭; c++) {
      const 있는것 = rows.filter((r) => (r[c] ?? "").trim());
      if (있는것.length < 2) continue;
      if (있는것.filter((r) => 숫자(r[c])).length / 있는것.length > 0.5) { 값칸 = c; break; }
    }
    if (값칸 < 1) continue;

    // 이름 칸 — 값 칸 왼쪽에서 숫자가 아닌 가장 왼쪽 칸.
    // 0번이 일련번호인 표가 있어 숫자 칸은 건너뛴다.
    let 이름칸 = -1;
    for (let c = 0; c < 값칸; c++) {
      const 있는것 = rows.filter((r) => (r[c] ?? "").trim());
      if (있는것.length < 2) continue;
      if (있는것.filter((r) => 숫자(r[c])).length / 있는것.length < 0.5) { 이름칸 = c; break; }
    }
    if (이름칸 < 0) continue;

    const 합 = new Map();
    for (const r of rows) {
      const 이름 = (r[이름칸] ?? "").trim();
      const v = 돈(r[값칸]);
      if (!이름 || !Number.isFinite(v) || v <= 0) continue;
      if (/합\s*계|총\s*계|^계$|^소\s*계$/.test(이름)) continue;
      if (/^\d/.test(이름)) continue;            // 머리글 행·연도 행
      if (이름.length > 24) continue;             // 문장이 들어온 것
      // 머리글 행이 데이터인 척 섞여 든다 — "매출유형 0%" "사업부문 0%"
      if (/^(사업\s*부문|매출\s*유형|품\s*목|구\s*분|부\s*문|사업|유형|제품|품명)$|매출\s*유형\s*및\s*품목/.test(이름)) continue;
      // 소계는 조각이 아니라 그 위 묶음이다. "용역매출 소계" 처럼 붙어 오기도 한다.
      if (/소\s*계|합\s*계|총\s*계/.test(이름)) continue;
      // 각주 표를 잡은 것 — "주1)" "주2)"
      if (/^주\s*\d/.test(이름)) continue;
      합.set(이름, (합.get(이름) ?? 0) + v);
    }
    if (합.size < 1) continue;
    // 이름이 죄다 한두 글자 로마자면 사업부문이 아니라 등급표다 (D · C · CC · CCC)
    const 이름들 = [...합.keys()];
    if (이름들.every((n) => /^[A-Za-z+-]{1,4}$/.test(n))) continue;
    // 이름이 죄다 판로·지역이면 사업부문 표가 아니다 (내수/수출, 국내/해외)
    if (이름들.every((n) => /^(내수|수출|국내|해외|기타|아시아|미주|유럽|중국|일본|미국)$/.test(n))) continue;


    const 앞 = 구역.slice(Math.max(0, m.index - 700), m.index);
    const u = 글(앞).match(/단위\s*[:：]\s*(백만원|천원|억원|원)/);
    const 단위 = { 원: 1, 천원: 1e3, 백만원: 1e6, 억원: 1e8 }[u?.[1] ?? "원"];
    return { 단위, rows: [...합].map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v) };
  }
  return null;
}

async function 최근보고서(corpCode) {
  const j = await (await fetch(
    `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}&corp_code=${corpCode}` +
    `&bgn_de=20240101&end_de=20301231&pblntf_ty=A&page_count=20`)).json();
  if (j.status !== "000") return null;
  // 사업보고서를 먼저, 없으면 반기·분기
  const 목록 = (j.list ?? []).sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt));
  return 목록.find((r) => /사업보고서/.test(r.report_nm)) ?? 목록[0] ?? null;
}

let 한것 = 0, 새로 = 0, 못찾음 = 0;
const 시작 = Date.now();
for (const s of 종목) {
  if (한것 >= LIMIT) break;
  한것++;
  if (out[s.code] !== undefined) continue;
  try {
    const r0 = await 최근보고서(코드[s.code]);
    if (!r0) { out[s.code] = null; 못찾음++; continue; }
    const res = await fetch(`https://opendart.fss.or.kr/api/document.xml?crtfc_key=${KEY}&rcept_no=${r0.rcept_no}`);
    let xml = "";
    for (const f of unzipAll(Buffer.from(await res.arrayBuffer()))) if (f.data) xml += decode(f.data);
    const seg = 부문뽑기(xml);
    if (!seg) 못찾음++;
    out[s.code] = seg ? { ...seg, report: r0.report_nm, asOf: r0.rcept_dt } : null;
    새로++;
  if (새로 && 새로 % 50 === 0) {
    fs.writeFileSync(OUT, JSON.stringify(out));
    console.log(`  ${한것}/${Math.min(종목.length, LIMIT)} · 새로 ${새로} · 못 찾음 ${못찾음} · ${((Date.now()-시작)/1000).toFixed(0)}초`);
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
const 있는것 = Object.values(out).filter(Boolean);
console.log(`\n종목 ${Object.keys(out).length} · 부문 뽑힌 종목 ${있는것.length}`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size/1024).toFixed(0)}KB`);
