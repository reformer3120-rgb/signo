// 회사별 총매출액을 DART 재무제표에서 걷어 온다.
//
// ── 왜 ─────────────────────────────────────────────────────
// 매출 표 파서(collect-sales.mjs)가 늘 깨끗하게 읽지는 못한다. 소표가 여럿이면
// 엉뚱한 줄까지 분모에 들어가 모든 부문의 비중이 눌린다.
//
//   한화솔루션  큐셀(태양광)이 5.9% 로 읽혔다 — 실제로는 훨씬 크다
//   큐엠씨      본업인 디스플레이 장비가 4.9% 로 읽혔다
//
// 이런 값으로 테마를 떼면 멀쩡한 것이 날아간다. 처음 25건을 눈으로 보니
// 절반쯤이 이런 잘못이었다.
//
// 표가 제대로 읽혔는지는 밖에서 대 볼 잣대가 있어야 안다. 재무제표의 매출액이
// 그것이다. 표에서 더한 합이 실제 매출과 비슷하면 그 표는 믿을 수 있다.
//
// 실행
//   node scripts/theme/collect-revenue.mjs
// 결과 → .cache/theme/revenue.json  { code: 매출액(원) | null }
import fs from "node:fs";
import path from "node:path";
import { get, KEY, BASE } from "./dart.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "revenue.json");
const CONC = 2;
const PAUSE = 350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 연결 우선, 없으면 별도. 매출액 계정을 찾아 당기 값을 돌려준다 */
async function 매출액(corp) {
  for (const fs_div of ["CFS", "OFS"]) {
    for (const year of ["2025", "2024"]) {
      const r = await get(
        `${BASE}/fnlttSinglAcnt.json?crtfc_key=${KEY}&corp_code=${corp}` +
          `&bsns_year=${year}&reprt_code=11011&fs_div=${fs_div}`,
      );
      if (!r) return null;
      let j;
      try { j = await r.json(); } catch { return null; }
      if (j.status !== "000") continue;
      const row = (j.list ?? []).find((x) => /^매출액$|^수익\(매출액\)$|^영업수익$/.test((x.account_nm ?? "").trim()));
      if (!row) continue;
      const v = Number(String(row.thstrm_amount ?? "").replace(/[,\s]/g, ""));
      if (v > 0) return v;
    }
  }
  return 0; // 매출 계정을 못 찾았다 (0 과 통신 실패를 가른다)
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].split("\\").join("/")}`) {
  const corp = JSON.parse(fs.readFileSync(path.join(DIR, "corp.json"), "utf8"));
  const sales = JSON.parse(fs.readFileSync(path.join(DIR, "sales.json"), "utf8"));
  const 대상 = new Set(Object.keys(sales).filter((c) => sales[c]));

  const ents = Object.values(corp).filter((c) => 대상.has(c.code));
  const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = ents.filter((e) => !(e.code in done));
  console.log(`대상 ${ents.length}종목 · 받을 것 ${todo.length}`);

  let ok = 0;
  let 실패연속 = 0;
  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC);
    const rs = await Promise.all(batch.map((e) => 매출액(e.corp).then((v) => [e.code, v]).catch(() => [e.code, null])));
    for (const [code, v] of rs) {
      if (v === null) { 실패연속++; continue; }
      실패연속 = 0;
      done[code] = v;
      if (v) ok++;
    }
    if (실패연속 >= 12) { console.log("\n연속 실패가 잦다 — 멈춘다. 다시 실행하면 이어서 받는다."); break; }
    if ((i / CONC) % 20 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(done));
      process.stdout.write(`\r  ${i + batch.length}/${todo.length} · 찾음 ${ok}   `);
    }
    await sleep(PAUSE);
  }
  fs.writeFileSync(OUT, JSON.stringify(done));
  console.log(`\n매출액을 찾은 종목 ${ok} / ${Object.keys(done).length} → ${OUT}`);
}
