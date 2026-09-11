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
// ── 재무 API 가 안 주는 회사가 있다 ─────────────────────────
// 코넥스·비상장·상장폐지 종목은 fnlttSinglAcnt(All) 이 013(자료 없음)으로만
// 답한다. 부문 매출을 뽑아 놓고도 견줄 잣대가 없어 「사업 구성」 으로 남던
// 61종목이 이 때문이었다. 그런 회사도 사업보고서는 낸다 — 원문의
// 「요약재무정보」 표에서 매출액을 읽는다(--원문). 원문은 이미 받아 둔 것을
// 쓰므로 DART 를 거의 두드리지 않는다.
//
// 실행
//   node scripts/theme/collect-revenue.mjs
//   node scripts/theme/collect-revenue.mjs --빈것   주요계정이 빈 것을 전체 재무제표로
//   node scripts/theme/collect-revenue.mjs --원문   그래도 빈 것을 사업보고서 원문으로
// 결과 → .cache/theme/revenue.json      { code: 매출액(원) | null }
//        .cache/theme/revenue-doc.json  { code: 매출액(원) }  원문에서 읽은 것
import fs from "node:fs";
import path from "node:path";
import { get, KEY, BASE, 공시목록, 원문글 } from "./dart.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "revenue.json");
const OUT원문 = path.join(DIR, "revenue-doc.json");
const CONC = 2;
const PAUSE = 350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 계정 이름 앞머리를 뗀다. 「Ⅰ.매출액」 처럼 번호를 붙이는 회사가 있어
 * 바이오인프라가 매출액 없는 회사로 남았다.
 */
const 벗기기 = (nm) => String(nm ?? "").trim().replace(/^[ⅠⅡⅢⅣⅤIVX\d]{1,4}\s*[.．)]\s*/, "").replace(/\s+/g, "");
const 매출계정 = (nm) => /^(매출액|매출|영업수익|수익\(매출액\)|영업수익\(매출액\)|매출액\(영업수익\))$/.test(벗기기(nm));

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
      const row = (j.list ?? []).find((x) => 매출계정(x.account_nm));
      if (!row) continue;
      const v = Number(String(row.thstrm_amount ?? "").replace(/[,\s]/g, ""));
      if (v > 0) return v;
    }
  }
  return 0; // 매출 계정을 못 찾았다 (0 과 통신 실패를 가른다)
}

/**
 * 주요계정에 매출이 없을 때 — 전체 재무제표에서 찾는다.
 *
 * fnlttSinglAcnt(주요계정)는 회사마다 주는 계정이 다르다. 참좋은여행은
 * 영업이익만 있고 매출액이 아예 없고, 올릭스도 마찬가지였다. 그래서
 * 210종목이 매출액 0 으로 남아 검증을 못 걸었다.
 *
 * fnlttSinglAcntAll(전체 재무제표)에는 있다. 무거운 호출이라 주요계정이
 * 빈손일 때만 쓴다.
 */
async function 매출액_전체(corp) {
  for (const fs_div of ["CFS", "OFS"]) {
    for (const year of ["2025", "2024"]) {
      const r = await get(
        `${BASE}/fnlttSinglAcntAll.json?crtfc_key=${KEY}&corp_code=${corp}` +
          `&bsns_year=${year}&reprt_code=11011&fs_div=${fs_div}`,
      );
      if (!r) return null;
      let j;
      try { j = await r.json(); } catch { return null; }
      if (j.status !== "000") continue;
      const 손익 = (j.list ?? []).filter((x) => /손익|포괄/.test(x.sj_nm ?? ""));
      // 표준계정코드가 있으면 그것이 가장 확실하다
      const 표준 = 손익.find((x) => x.account_id === "ifrs-full_Revenue");
      const 이름 = 손익.find((x) => 매출계정(x.account_nm) || /^매출및지분법손익$/.test(벗기기(x.account_nm)));
      const v = Number(String((표준 ?? 이름)?.thstrm_amount ?? "").replace(/[,\s]/g, ""));
      if (v > 0) return v;
    }
  }
  return 0;
}

// ── 원문의 요약재무정보에서 읽기 ────────────────────────────
const 글 = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const 칸들 = (tr) => [...tr.matchAll(/<T[DH][^>]*>([\s\S]*?)<\/T[DH]>/gi)].map((m) => 글(m[1]));
const 줄들 = (표) => [...표.matchAll(/<TR[^>]*>([\s\S]*?)<\/TR>/gi)].map((m) => 칸들(m[1]));

// 「단위 : 백만원」 처럼 적힌 것만 본다. 그냥 "원" 을 찾으면 주당이익(원) 에
// 걸려 백만원짜리 표를 1원으로 읽는다 — 삼성전자가 3억으로 나왔던 까닭이다.
const 단위값 = (t) => {
  const m = /단\s*위\s*[:：]\s*([^)\]]{0,14})/.exec(t);
  if (!m) return null;
  const u = m[1];
  return /억\s*원/.test(u) ? 1e8 : /백\s*만\s*원/.test(u) ? 1e6 : /천\s*원/.test(u) ? 1e3 : /원/.test(u) ? 1 : null;
};

const 수 = (s) => {
  const t = s.replace(/[,\s]/g, "").replace(/△|▲/, "-").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
};
// 「매출액」 줄 — [매출액], Ⅰ.매출액, ㆍ매출액, 매출액(영업수익) 다 받는다
const 매출줄 = /^[\[\(]?\s*[ⅠⅡ\dIVX]{0,3}\s*[.．]?\s*ㆍ?\s*(매\s*출\s*액|영\s*업\s*수\s*익|매출액\(영업수익\)|영업수익\(매출액\))\s*[\]\)]?$/;

/** 원문에서 그 보고서 기준 매출액(원)을 읽는다. 못 읽으면 null */
// 남의 회사 요약재무정보가 먼저 나온다. 금호타이어는 종속기업 것(6,616억)을,
// 화천기공은 관계기업 에드텍 것(1억)을 회사 매출로 읽었다.
const 남의것 = /종속\s*기업|관계\s*기업|공동\s*기업|피투자|투자\s*기업/;
const 자산줄 = /^[\[\(]?\s*(유동자산|자산총계|자산총액)\s*[\]\)]?$/;

export function 매출액뽑기(xml) {
  const 후보 = [];
  for (const m of xml.matchAll(/요약\s*재무\s*정보/g)) {
    const 앞 = xml.slice(Math.max(0, m.index - 140), m.index + 20);
    if (남의것.test(앞)) continue;
    const 연결 = /연결/.test(앞);
    const 뒤 = xml.slice(m.index, m.index + 80000);
    // 단위만 담은 한 줄짜리 표가 먼저 나온다 — 표를 여럿 훑는다.
    // 단위는 닻 뒤에서만 찾는다. 앞을 보면 딴 표의 「(단위 : 원)」 이 묻어
    // 와서 천원짜리 표를 원으로 읽는다(009770 이 1,486억 → 1억이었다).
    let p = 0, 단위 = null;
    for (let k = 0; k < 6; k++) {
      const t = 뒤.slice(p).search(/<TABLE/i);
      if (t < 0) break;
      const s0 = p + t;
      const e0 = 뒤.slice(s0).search(/<\/TABLE>/i);
      if (e0 < 0) break;
      const 표 = 뒤.slice(s0, s0 + e0);
      const 사이 = 글(뒤.slice(p, s0));
      if (남의것.test(사이)) break;
      p = s0 + e0 + 8;
      const 줄 = 줄들(표);
      // 단위는 표 바깥 글이나 단위만 담은 쪽지표에서만 읽는다. 표 안을 뒤지면
      // 「1주당순이익(단위:원)」 같은 줄에 걸려 천원짜리 표가 원이 된다.
      단위 = 단위 ?? 단위값(사이) ?? (줄.length <= 2 ? 단위값(글(표)) : null);
      // 회사 제 표에는 자산과 매출이 한 표에 같이 있다. 이 조건이 남의 회사
      // 표와 손익 조각 표를 걸러 낸다.
      if (!줄.some((r) => r.length && 자산줄.test(r[0]))) continue;
      for (const r of 줄) {
        if (!r.length || !매출줄.test(r[0])) continue;
        const v = r.slice(1).map(수).find((x) => x !== null && x > 0);
        // 단위를 못 찾은 표는 버린다. 원으로 넘겨짚었더니 천원짜리 표를
        // 1/1000 로 읽었다. 검증에 쓸 값이라 틀린 값이 빈 값보다 해롭다.
        if (v != null && 단위) 후보.push({ v, 단위, 연결 });
      }
      break; // 이 닻에서는 한 표만 본다
    }
  }
  if (!후보.length) return null;
  // 연결과 별도가 다 잡히면 큰 쪽이 연결이다. 지주회사는 별도 매출이 한참
  // 작아서, 「연결」 이라는 낱말로 고르면 자주 틀린다.
  return Math.max(...후보.map((x) => x.v * x.단위));
}

/** 가장 최근 사업보고서 원문에서 그 해 매출액을 읽는다. 못 읽으면 null */
async function 매출액_원문(corp) {
  const 목록 = await 공시목록(corp, { bgn: "20240101", end: "20301231", ty: "A", n: 20 });
  if (!목록?.length) return null;
  const 사업 = [...목록].sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt))
    .find((r) => /사업보고서/.test(r.report_nm));
  // 분기·반기 표는 누적이라 연매출이 아니다. 사업보고서가 없으면 비운다.
  if (!사업) return null;
  const xml = await 원문글(사업.rcept_no);
  return xml ? 매출액뽑기(xml) : null;
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].split("\\").join("/")}`) {
  const corp = JSON.parse(fs.readFileSync(path.join(DIR, "corp.json"), "utf8"));
  // 대상은 테마에 실린 종목 전부다.
  //
  // 예전에는 sales.json(옛 매출 표 파서)에 든 종목만 받았다. 그 파서가 못
  // 읽은 종목은 매출액도 없어서, 지금 쓰는 검증(조각의 합이 매출액과 맞나)을
  // 아예 걸 수 없었다 — 366종목이 「사업 구성」 으로 남은 까닭이다.
  const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
  const 대상 = new Set(themes.themes.flatMap((t) => t.stocks).map((s) => s.code));

  const ents = Object.values(corp).filter((c) => 대상.has(c.code));
  const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  // --빈것 을 주면 0 으로 남은 것만 다시 받는다 (전체 재무제표로)
  // --원문 은 그러고도 0 인 것을 사업보고서 원문에서 읽는다
  const 빈것만 = process.argv.includes("--빈것");
  const 원문만 = process.argv.includes("--원문");
  const 원문값 = fs.existsSync(OUT원문) ? JSON.parse(fs.readFileSync(OUT원문, "utf8")) : {};
  const todo = 원문만
    ? ents.filter((e) => !(done[e.code] > 0) && !(e.code in 원문값))
    : 빈것만
      ? ents.filter((e) => e.code in done && !(done[e.code] > 0))
      : ents.filter((e) => !(e.code in done));
  console.log(`대상 ${ents.length}종목 · 받을 것 ${todo.length}`);

  let ok = 0;
  let 실패연속 = 0;
  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC);
    const 받기 = 원문만 ? 매출액_원문 : 빈것만 ? 매출액_전체 : 매출액;
    const rs = await Promise.all(batch.map((e) => 받기(e.corp).then((v) => [e.code, v]).catch(() => [e.code, null])));
    for (const [code, v] of rs) {
      // 원문 쪽은 못 읽은 것(null)도 남긴다. 안 남기면 다시 돌릴 때마다
      // 같은 원문을 또 뒤진다.
      if (원문만) { 원문값[code] = v ?? 0; if (v) ok++; 실패연속 = 0; continue; }
      if (v === null) { 실패연속++; continue; }
      실패연속 = 0;
      done[code] = v;
      if (v) ok++;
    }
    if (실패연속 >= 12) { console.log("\n연속 실패가 잦다 — 멈춘다. 다시 실행하면 이어서 받는다."); break; }
    if ((i / CONC) % 20 === 0) {
      fs.writeFileSync(원문만 ? OUT원문 : OUT, JSON.stringify(원문만 ? 원문값 : done));
      process.stdout.write(`\r  ${i + batch.length}/${todo.length} · 찾음 ${ok}   `);
    }
    await sleep(PAUSE);
  }
  if (원문만) {
    fs.writeFileSync(OUT원문, JSON.stringify(원문값));
    const 읽은것 = Object.values(원문값).filter((v) => v > 0).length;
    console.log(`\n원문에서 읽은 종목 ${읽은것} / ${Object.keys(원문값).length} → ${OUT원문}`);
  } else {
    fs.writeFileSync(OUT, JSON.stringify(done));
    console.log(`\n매출액을 찾은 종목 ${ok} / ${Object.keys(done).length} → ${OUT}`);
  }
}
