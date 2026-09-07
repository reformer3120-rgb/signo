// 시장 PER·PBR 을 만들 재료 — 종목별 순이익·자본총계와 시장 구분.
//
// ── 왜 직접 만드나 ────────────────────────────────────────
// 코스피·코스닥 지수 PER/PBR 을 그냥 주는 무료 출처가 없다.
//   네이버 지수 API   전일·시가·52주만. PER/PBR 없음
//   네이버 지수 웹    없음
//   KRX 정보데이터    공식 수치가 있지만 로그인이 필요하다 (LOGOUT 응답)
// 시가총액은 이미 갖고 있으니 순이익과 자본총계만 모으면 우리가 셀 수 있다.
//
// ── 한 번의 호출로 둘 다 나온다 ────────────────────────────
// fnlttSinglAcnt(주요계정)가 재무상태표와 손익계산서를 같이 준다.
//   자본총계          436,320,337,000,000
//   당기순이익(손실)    45,206,805,000,000
//
// 시장 구분(코스피/코스닥)만 없어서 company.json 을 한 번 더 부른다.
//   corp_cls  Y=유가(코스피) · K=코스닥 · N=코넥스 · E=기타
//
// ── DART 를 아껴 쓸 것 ────────────────────────────────────
// 어제 하루 한도 20,000건을 넘겨(약 34,700건) 차단당했다. 규칙을 고칠 때는
// --limit 으로 열몇 종목만 보고, 확신이 선 뒤에 전체를 한 번 돌린다.
// 쉼과 재시도를 넣었고, 받은 것은 건너뛴다.
//
// 실행
//   node scripts/theme/collect-valuation.mjs --limit 20   시험
//   node scripts/theme/collect-valuation.mjs              전체 (이어서)
import fs from "node:fs";
import path from "node:path";
import { KEY } from "./dart.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "valuation.json");
const 인자 = (n, 기본) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : 기본; };
const LIMIT = 인자("--limit", Infinity);
const 해 = 인자("--year", new Date().getUTCFullYear() - 1);

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
const 돈 = (s) => { const n = Number(String(s ?? "").replace(/[,\s]/g, "")); return Number.isFinite(n) ? n : NaN; };

/** 연결(CFS) 우선, 없으면 별도(OFS). 종목마다 어느 쪽을 냈는지 다르다. */
function 골라내기(list) {
  const pref = list.some((r) => r.fs_div === "CFS") ? "CFS" : "OFS";
  const 값 = {};
  for (const r of list) {
    if (r.fs_div !== pref) continue;
    const nm = (r.account_nm ?? "").replace(/\s/g, "");
    const v = 돈(r.thstrm_amount);
    if (!Number.isFinite(v)) continue;
    // 같은 이름이 두 번 오는 일이 있다(당기순이익(손실)). 먼저 것을 쓴다.
    if (!(nm in 값)) 값[nm] = v;
  }
  return {
    순이익: 값["당기순이익(손실)"] ?? 값["당기순이익"] ?? null,
    자본: 값["자본총계"] ?? null,
    fs: pref,
  };
}

let 한것 = 0, 새로 = 0, 못받음 = 0;
const 시작 = Date.now();
for (const s of 종목) {
  if (한것 >= LIMIT) break;
  한것++;
  if (out[s.code]) continue;
  try {
    await 쉼(45);
    const fin = await 받기(
      `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${KEY}` +
      `&corp_code=${코드[s.code]}&bsns_year=${해}&reprt_code=11011`);
    // 020 = 하루 한도 초과. 여기서 멈춰야 남은 것을 다음에 이어서 받는다.
    if (fin.status === "020") { console.log("\n하루 호출 한도를 넘었다. 여기서 멈춘다."); break; }
    if (fin.status !== "000") { out[s.code] = null; 못받음++; continue; }

    await 쉼(45);
    const co = await 받기(`https://opendart.fss.or.kr/api/company.json?crtfc_key=${KEY}&corp_code=${코드[s.code]}`);
    if (co.status === "020") { console.log("\n하루 호출 한도를 넘었다. 여기서 멈춘다."); break; }

    const v = 골라내기(fin.list ?? []);
    out[s.code] = { ...v, 시장: co.corp_cls ?? null, 해 };
    새로++;
  } catch { out[s.code] = null; 못받음++; }
  if (새로 && 새로 % 100 === 0) {
    fs.writeFileSync(OUT, JSON.stringify(out));
    console.log(`  ${한것}/${Math.min(종목.length, LIMIT)} · 새로 ${새로} · 못 받음 ${못받음} · ${((Date.now()-시작)/1000).toFixed(0)}초`);
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
const 쓸것 = Object.values(out).filter((v) => v?.순이익 != null && v?.자본 != null);
const 시장별 = {};
for (const v of Object.values(out)) if (v?.시장) 시장별[v.시장] = (시장별[v.시장] ?? 0) + 1;
console.log(`\n종목 ${Object.keys(out).length} · 순이익·자본 다 있는 것 ${쓸것.length} · 못 받음 ${못받음}`);
console.log(`  시장 구분: ${Object.entries(시장별).map(([k, n]) => `${k}=${n}`).join(" · ")}  (Y 코스피 · K 코스닥)`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
