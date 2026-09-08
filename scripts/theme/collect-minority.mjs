// 소액주주 현황 — 법인팀에 넘길 자료.
//
// 사업보고서 'Ⅷ. 주주에 관한 사항 → 소액주주 현황' 의 집계 행이다.
// DART 로는 mrhlSttus 의 hold_stock_rate(보유비율)·shrholdr_co(주주 수).
//
// ── 소액주주는 개인투자자가 아니다 ─────────────────────────
// 지분 1% 미만 주주 전부다 — 개인뿐 아니라 1% 미만씩 든 외국계·국내 기관이
// 다 들어간다. 국적 구분도 없다. 이름 때문에 개인 비중으로 오해하기 쉬워
// 여기 적어 둔다. 법인팀 요청서에도 같은 이해가 적혀 있었다.
//
// ── 왜 최신 사업보고서 하나만 받나 ────────────────────────
// 분기마다 크게 안 바뀌고, 반기·분기보고서에는 이 표가 없는 경우가 많다.
// 직전 사업연도부터 거슬러 올라가며 나오는 첫 해를 쓴다.
//
// 실행
//   node scripts/theme/collect-minority.mjs --limit 20   시험
//   node scripts/theme/collect-minority.mjs              전체 (이어서)
//   node scripts/theme/collect-minority.mjs --csv        CSV 로 내보내기
import fs from "node:fs";
import path from "node:path";
import { KEY } from "./dart.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "minority.json");
const CSV = "소액주주현황.csv";
const 인자 = (n, 기본) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : 기본; };
const LIMIT = 인자("--limit", Infinity);
const CSV만 = process.argv.includes("--csv");

const 읽기 = (p, 기본) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : 기본);
const out = 읽기(OUT, {});
const corp = 읽기(path.join(DIR, "corp.json"), {});
const 코드 = {};
for (const v of Object.values(corp)) if (v?.code) 코드[v.code] = v.corp;
const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const 종목 = themes.themes.flatMap((t) => t.stocks).filter((s) => 코드[s.code]);

const 쉼 = (ms) => new Promise((r) => setTimeout(r, ms));
async function 받기(url, 남은 = 3) {
  try { return await (await fetch(url)).json(); }
  catch (e) { if (남은 <= 0) throw e; await 쉼(2000); return 받기(url, 남은 - 1); }
}
const 수 = (s) => { const n = Number(String(s ?? "").replace(/[,%\s]/g, "")); return Number.isFinite(n) ? n : null; };

/**
 * 보유비율을 정한다 — 적힌 값을 먼저 믿는다.
 *
 * 처음에는 주식 수로 다시 세는 쪽이 정확할 줄 알았는데 거꾸로였다.
 * 보유주식·총주식 칸이 성치 않은 보고서가 훨씬 많다.
 *
 *   현대리바트  보유 20,535,282 · 총 10,628,716   ← 두 칸이 뒤바뀌었다
 *                 뒤집어 세면 51.76% 로 적힌 값 51.75% 와 맞는다
 *   이엠티      총주식 2,408,397                   ← 자릿수가 하나 빠졌다
 *                 그대로 세면 93.97%, 적힌 값은 9.41%
 *
 * 반대로 적힌 값이 틀린 경우는 드물고, 그때도 티가 난다.
 *   온타이드    적힌 "100%" · 세어 보면 62.77%
 *               주주 수 비율 99.94% 를 주식 비율 칸에 옮겨 적은 것이다
 *
 * 그래서 적힌 값을 쓰되, 딱 100% 인 것만은 세어 본 값으로 갈음한다.
 * 100% 는 사람이 잘못 적을 때 나오는 값이지 실제로 나오기 어려운 값이다.
 */
function 비율(v) {
  if (!v) return null;
  const 적힌 = 수(v.적힌비율);
  const 성한 = (x) => x != null && x > 0 && x <= 100;

  // 두 칸이 뒤바뀐 보고서가 있어 큰 쪽을 분모로 둔다
  const a = v.보유주식, b = v.총주식;
  const 센것 = a != null && b != null && a > 0 && b > 0
    ? +((Math.min(a, b) / Math.max(a, b)) * 100).toFixed(2) : null;

  if (적힌 === 100) return 성한(센것) && 센것 < 99 ? 센것 : 100;
  if (성한(적힌)) return +적힌.toFixed(2);
  return 성한(센것) ? 센것 : null;
}

/** CSV 로 내보내기 — 법인팀이 그대로 쓸 형태 */
function 내보내기() {
  const 줄 = ["종목코드,소액주주비율,주주수,기준연도"];
  const 이름 = new Map(종목.map((s) => [s.code, s.name]));
  const 정렬 = Object.entries(out)
    .filter(([, v]) => 비율(v) != null)
    .sort((a, b) => (이름.get(a[0]) ?? "").localeCompare(이름.get(b[0]) ?? ""));
  for (const [code, v] of 정렬) 줄.push(`${code},${비율(v)},${v.주주수 ?? ""},${v.해 ?? ""}`);
  fs.writeFileSync(CSV, 줄.join("\n") + "\n", "utf8");
  console.log(`→ ${CSV}  ${정렬.length}종목  ${(fs.statSync(CSV).size / 1024).toFixed(0)}KB`);
}

if (CSV만) { 내보내기(); process.exit(0); }

const 올해 = new Date().getUTCFullYear();
let 한것 = 0, 새로 = 0, 없음 = 0;
const 시작 = Date.now();
for (const s of 종목) {
  if (한것 >= LIMIT) break;
  한것++;
  if (out[s.code] !== undefined) continue;
  try {
    // 직전 사업연도부터 거슬러 올라가며 나오는 첫 해를 쓴다
    let 찾음 = null;
    for (const 해 of [올해 - 1, 올해 - 2, 올해 - 3]) {
      await 쉼(45);
      const j = await 받기(
        `https://opendart.fss.or.kr/api/mrhlSttus.json?crtfc_key=${KEY}` +
        `&corp_code=${코드[s.code]}&bsns_year=${해}&reprt_code=11011`);
      if (j.status === "020") { console.log("\n하루 호출 한도를 넘었다. 여기서 멈춘다."); 내보내기(); process.exit(0); }
      const r = (j.list ?? [])[0];
      if (!r) continue;
      // 판정하지 않고 원문 그대로 담는다. 무엇을 믿을지는 내보낼 때 정한다.
      const 담을것 = {
        적힌비율: r.hold_stock_rate ?? null,
        보유주식: 수(r.hold_stock_co),
        총주식: 수(r.stock_tot_co),
        주주수: 수(r.shrholdr_co),
        해,
      };
      if (비율(담을것) != null) { 찾음 = 담을것; break; }
    }
    out[s.code] = 찾음;
    if (!찾음) 없음++;
    새로++;
  } catch { out[s.code] = null; 없음++; }
  if (새로 && 새로 % 100 === 0) {
    fs.writeFileSync(OUT, JSON.stringify(out));
    console.log(`  ${한것}/${Math.min(종목.length, LIMIT)} · 새로 ${새로} · 못 찾음 ${없음} · ${((Date.now()-시작)/1000).toFixed(0)}초`);
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
const 있는것 = Object.values(out).filter((v) => 비율(v) != null);
console.log(`\n종목 ${Object.keys(out).length} · 비율 있는 것 ${있는것.length} · 못 찾음 ${없음}`);
if (있는것.length) {
  const v = 있는것.map(비율).sort((a, b) => a - b);
  console.log(`  비율 분포  가장 낮음 ${v[0]}% · 중앙 ${v[Math.floor(v.length/2)]}% · 가장 높음 ${v[v.length-1]}%`);
}
내보내기();
