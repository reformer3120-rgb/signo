// 최대주주 및 특수관계인 — 주주 구성 원형에서 빠져 있던 조각.
//
// ── 왜 필요한가 ───────────────────────────────────────────
// 지금까지는 majorstock(주식등의 대량보유상황보고, 이른바 5%룰)만 받아 왔다.
// 그런데 그건 '보유 상황이 바뀌었을 때 내는 공시'라, 지분을 쥐고 가만히 있는
// 지배주주는 최근 목록에 안 뜬다.
//
//   삼성전기  majorstock → 국민연금 9.87 · 블랙록 5.01  (합 14.9%)
//             실제 최대주주 삼성전자 23.69% 가 통째로 빠졌다
//
// 최대주주는 사업보고서 'Ⅷ. 주주에 관한 사항 → 최대주주 및 특수관계인의
// 주식소유 현황' 에 있다. DART 로는 hyslrSttus.
//
// ── 무엇을 담나 ───────────────────────────────────────────
// 본인 지분이 아니라 특수관계인까지 더한 합계를 담는다. 증권사 화면이
// 「삼성전자 외 5인 23.8%」 라고 쓰는 그 숫자다. 본인 이름은 따로 남겨
// 조각 이름에 쓴다.
//
// 지분율은 보통주 기준이다(보고서가 그렇게 적는다). 소액주주 비율은 총주식
// 기준이라 잣대가 다르니, 한 원형에 둘을 같이 놓지는 않는다.
//
// 실행
//   node scripts/theme/collect-largest.mjs --limit 20
//   node scripts/theme/collect-largest.mjs
import fs from "node:fs";
import path from "node:path";
import { KEY } from "./dart.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "largest.json");
const 인자 = (n, 기본) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : 기본; };
const LIMIT = 인자("--limit", Infinity);
const ONLY = (() => { const i = process.argv.indexOf("--only"); return i > 0 ? process.argv[i + 1] : null; })();

const 읽기 = (p, 기본) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : 기본);
const out = 읽기(OUT, {});
const corp = 읽기(path.join(DIR, "corp.json"), {});
const 코드 = {};
for (const v of Object.values(corp)) if (v?.code) 코드[v.code] = v.corp;
const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
let 종목 = themes.themes.flatMap((t) => t.stocks).filter((s) => 코드[s.code]);
if (ONLY) 종목 = 종목.filter((s) => s.code === ONLY);

const 쉼 = (ms) => new Promise((r) => setTimeout(r, ms));
async function 받기(url, 남은 = 3) {
  try { return await (await fetch(url)).json(); }
  catch (e) { if (남은 <= 0) throw e; await 쉼(2000); return 받기(url, 남은 - 1); }
}
const 수 = (s) => { const n = Number(String(s ?? "").replace(/[,%\s]/g, "")); return Number.isFinite(n) ? n : null; };
// 기말이 비면 기초를 쓴다. 기중에 새로 오른 최대주주는 기초가 비어 있다.
const 지분 = (r) => 수(r.trmend_posesn_stock_qota_rt) ?? 수(r.bsis_posesn_stock_qota_rt);

/** 보고서 한 건에서 최대주주 이름과 특수관계인 포함 합계를 뽑는다 */
function 추리기(list) {
  const 보통 = list.filter((r) => !r.stock_knd || /보통/.test(r.stock_knd));
  const 대상 = 보통.length ? 보통 : list;
  const 계 = 대상.find((r) => String(r.nm).trim() === "계");
  const 사람 = 대상.filter((r) => String(r.nm).trim() !== "계");
  const 본인 = 사람.find((r) => /최대주주 본인|본인/.test(r.relate ?? "")) ?? 사람[0];
  if (!본인) return null;

  // 합계 행이 있으면 그것을 쓰고, 없으면 직접 더한다
  let 합 = 계 ? 지분(계) : null;
  if (합 == null) 합 = 사람.reduce((a, r) => a + (지분(r) ?? 0), 0);
  const 본인몫 = 지분(본인);
  if (!(합 > 0) || 본인몫 == null) return null;

  return {
    name: String(본인.nm).trim(),
    pct: +Math.max(합, 본인몫).toFixed(2),   // 합이 본인보다 작게 적힌 보고서가 더러 있다
    본인: +본인몫.toFixed(2),
    인원: 사람.length,
    asOf: 본인.stlm_dt ?? null,
  };
}

const 올해 = new Date().getUTCFullYear();
let 한것 = 0, 새로 = 0, 없음 = 0;
const 시작 = Date.now();
for (const s of 종목) {
  if (한것 >= LIMIT) break;
  한것++;
  if (out[s.code] !== undefined && !ONLY) continue;
  try {
    let 찾음 = null;
    for (const 해 of [올해 - 1, 올해 - 2, 올해 - 3]) {
      await 쉼(45);
      const j = await 받기(
        `https://opendart.fss.or.kr/api/hyslrSttus.json?crtfc_key=${KEY}` +
        `&corp_code=${코드[s.code]}&bsns_year=${해}&reprt_code=11011`);
      if (j.status === "020") { fs.writeFileSync(OUT, JSON.stringify(out)); console.log("\n하루 호출 한도를 넘었다. 여기서 멈춘다."); process.exit(0); }
      찾음 = 추리기(j.list ?? []);
      if (찾음) break;
    }
    out[s.code] = 찾음;
    if (!찾음) 없음++;
    새로++;
  } catch { out[s.code] = null; 없음++; }
  if (새로 && 새로 % 200 === 0) {
    fs.writeFileSync(OUT, JSON.stringify(out));
    console.log(`  ${한것}/${Math.min(종목.length, LIMIT)} · 새로 ${새로} · 못 찾음 ${없음} · ${((Date.now()-시작)/1000).toFixed(0)}초`);
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
const 있는것 = Object.entries(out).filter(([, v]) => v?.pct != null);
console.log(`\n종목 ${Object.keys(out).length} · 최대주주 있는 것 ${있는것.length} · 못 찾음 ${없음}`);
if (ONLY || 한것 <= 20) {
  const nm = Object.fromEntries(themes.themes.flatMap((t) => t.stocks).map((s) => [s.code, s.name]));
  for (const [c, v] of 있는것.slice(0, 20)) console.log(`  ${nm[c]} ${c}  ${v.name} 외 ${v.인원 - 1}인  ${v.pct}% (본인 ${v.본인}%)`);
}
