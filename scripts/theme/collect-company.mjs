// 회사 개황 — 설립일과 대표자를 모은다.
//
// 개요 카드에 "언제 세워진 회사인가" 를 넣으려는데, 사업보고서 원문에
// 설립 연도가 적힌 종목은 14% 뿐이었다. DART 에 회사개황 API 가 따로 있고
// 거기에는 전 종목 설립일이 있다.
//
//   company.json  est_dt "20020226" · ceo_nm · induty_code
//
// 종목당 한 번이면 되고 값이 잘 안 바뀐다. 분기에 한 번 돌린다.
//
// 실행
//   node scripts/theme/collect-company.mjs
import fs from "node:fs";
import path from "node:path";
import { KEY } from "./dart.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "company.json");
const 읽기 = (p, 기본) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : 기본);
const out = 읽기(OUT, {});
const corp = 읽기(path.join(DIR, "corp.json"), {});
const 코드 = {};
for (const v of Object.values(corp)) if (v?.code) 코드[v.code] = v.corp;
const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const 종목 = themes.themes.flatMap((t) => t.stocks).filter((s) => 코드[s.code]);

const 쉼 = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * DART 를 쉬지 않고 두드리면 연결이 끊긴다(fetch failed).
 * 처음 돌렸을 때 2,496건 중 1,497건이 그렇게 실패했다.
 * 사이를 조금 두고, 끊기면 쉬었다 다시 건다.
 */
async function 받기(url, 남은시도 = 3) {
  try {
    return await (await fetch(url)).json();
  } catch (e) {
    if (남은시도 <= 0) throw e;
    await 쉼(1500);
    return 받기(url, 남은시도 - 1);
  }
}

let 새로 = 0, 못받음 = 0;
for (const s of 종목) {
  // null 은 지난번에 실패한 것이다 — 다시 받는다.
  if (out[s.code]) continue;
  try {
    await 쉼(40);
    const j = await 받기(
      `https://opendart.fss.or.kr/api/company.json?crtfc_key=${KEY}&corp_code=${코드[s.code]}`);
    if (j.status !== "000") { out[s.code] = null; 못받음++; continue; }
    out[s.code] = {
      // "20020226" → 2002. 월·일까지는 카드에 안 쓴다.
      설립: /^\d{8}$/.test(j.est_dt ?? "") ? Number(j.est_dt.slice(0, 4)) : null,
      대표: j.ceo_nm || null,
      업종코드: j.induty_code || null,
    };
    새로++;
  } catch { out[s.code] = null; 못받음++; }
  if (새로 % 200 === 0 && 새로) {
    fs.writeFileSync(OUT, JSON.stringify(out));
    console.log(`  ${새로} / ${종목.length}`);
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
const 있는것 = Object.values(out).filter((v) => v?.설립);
console.log(`\n종목 ${Object.keys(out).length} · 설립연도 있는 것 ${있는것.length} · 못 받음 ${못받음}`);
const 해 = 있는것.map((v) => v.설립).sort((a, b) => a - b);
console.log(`  가장 오래된 ${해[0]} · 중앙 ${해[Math.floor(해.length / 2)]} · 가장 최근 ${해[해.length - 1]}`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
