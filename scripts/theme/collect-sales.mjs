// 사업보고서에서 부문별 매출 비중을 걷어 온다.
//
// ── 왜 ─────────────────────────────────────────────────────
// 규칙은 사업보고서를 통째로 읽어 "이 회사가 무엇을 하는가" 를 본다. 그런데
// 여러 사업을 하는 회사에서는 곁가지가 주력보다 큰 점수를 받는다.
//
//   다산네트웍스  규칙 점수  물류 10점(1등) · 통신장비 3점
//                 실제 매출  네트워크 30.7% · 물류 3.8%
//
// 보고서 본문만 봐서는 무엇이 주력인지 알 수 없다. 매출 표에는 적혀 있다.
//
// ── 표가 어떻게 생겼나 ─────────────────────────────────────
//   사업부문 구분 제34기 제33기 제32기 비고
//   네트워크  내수 115,428 93,545 25,036 -
//             수출  50,858 70,495     34 -
//   물류      내수  20,809 18,988 16,438 -
//   …
//   총계      내수 327,124 …
//   합계     541,778 …
//
// 칸이 띄어쓰기로만 갈라져 있어 정규식 하나로는 이름과 "내수" 를 못 가른다.
// 그래서 토큰을 하나씩 보며 상태를 들고 간다(부문비중 참고).
//
// 모든 회사에서 되는 것은 아니다. 킵스파마처럼 "제품매출 / 상품매출 / 기타매출"
// 로만 나눈 표는 사업 이름이 없어 쓸 수 없다. 그런 회사는 비워 둔다 — 이 값을
// 쓰는 쪽은 근거가 있을 때만 손대므로 비어 있으면 아무 일도 일어나지 않는다.
//
// 실행
//   node scripts/theme/collect-sales.mjs            테마 3개 이상인 종목만
//   node scripts/theme/collect-sales.mjs --all      편입된 종목 전부
//   node scripts/theme/collect-sales.mjs --only 039560
// 결과 → .cache/theme/sales.json  { code: [{label, v, 비중}] | null }
import fs from "node:fs";
import path from "node:path";
import { get, unzipAll, decode, KEY, BASE } from "./dart.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "sales.json");
const CONC = 2; // DART 는 조이면 IP 를 막는다. 예전에 8로 올렸다가 끊겼다.
const PAUSE = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 표 읽기 ────────────────────────────────────────────────

/** 매출실적 표 대목을 잘라 낸다 — "(단위 : …)" 뒤부터가 진짜 표다 */
export function 매출대목(plain) {
  let best = null;
  const re = /매출\s*실적/g;
  let m;
  while ((m = re.exec(plain))) {
    const near = plain.slice(m.index, m.index + 260);
    const u = near.search(/\(\s*단위/);
    if (u >= 0 && (!best || u < best.u)) best = { i: m.index + u, u };
  }
  if (!best) return null;
  let seg = plain.slice(best.i, best.i + 2600);
  const end = seg.slice(40).search(/(판매경로|수주\s*상황|파생상품|주요\s*계약|시장위험|판매\s*조직)/);
  if (end > 0) seg = seg.slice(0, end + 40);
  return seg;
}

/** 표 머리글과 괄호를 지운다 — 그 안의 숫자가 부문 값으로 잘못 읽힌다 */
const 다듬기 = (s) =>
  s
    // 표 낱말이 칸 안에서 띄어 적히는 일이 아주 흔하다 — "내 수", "수 출".
    // 이것을 못 알아보면 앞 부문 이름에 붙어 "…디텍터 수 출" 같은 이름이 생기고,
    // 그 줄의 매출이 엉뚱한 곳으로 간다. 2,212 줄이 이 꼴이었다.
    .replace(/내\s+수/g, "내수").replace(/수\s+출/g, "수출")
    .replace(/소\s+계/g, "소계").replace(/합\s+계/g, "합계").replace(/총\s+계/g, "총계")
    .replace(/구\s+분/g, "구분").replace(/금\s+액/g, "금액").replace(/비\s+율/g, "비율")
    .replace(/품\s+목/g, "품목").replace(/매\s+출/g, "매출")
    .replace(/\([^)]{0,40}\)/g, " ")
    .replace(/제\s*\d+\s*기/g, " ")
    .replace(/\d{4}\s*년/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const 숫자꼴 = /^(?:△|▲|-)?\d[\d,]*(?:\.\d+)?%?$/;
const 딸림 = /^(내수|수출|소계|소|계|국내|해외|합계|합|총계|총)$/;
const 총계말 = /^(합\s*계|총\s*계|계|총|합)$/;
const 버림 =
  /^(구분|품목|품|목|사업부문|사업부|부문|부|매출유형|유형|비고|단위|백만원|천원|억원|원|매출액|비율|비중|주요제품|제품|주)$/;

/** 쌓인 이름에서 꼬리에 붙은 표 낱말을 떼어 낸다 — "네트워크 내수" → "네트워크" */
function 이름다듬기(말) {
  const w = [...말];
  while (w.length && (딸림.test(w.at(-1)) || 버림.test(w.at(-1)))) w.pop();
  while (w.length && 버림.test(w[0])) w.shift();
  return w.join(" ").trim();
}

/**
 * 부문별 매출 비중.
 *
 *   … 네트워크 내수 115,428 93,545 25,036 - 수출 50,858 …
 *     └이름┘ └딸림┘ └올해┘ └지난해 └전전해  └딸림┘ └올해┘
 *
 * 한 줄의 첫 숫자만 센다(올해분). 뒤이어 오는 숫자는 지난해·전전해라 버린다.
 * "내수·수출·소계" 는 제 이름이 아니라 앞 부문에 딸린 줄이므로 앞 이름에 더한다.
 */
/**
 * 표 머리의 "(단위 : 백만원)" 을 읽는다.
 *
 * 이것이 있어야 부문 값을 실제 매출과 견줄 수 있다. 표에서 더한 합을 분모로
 * 쓰면 소표가 여럿일 때 3년치가 겹쳐 들어가 모든 비중이 눌린다 — 재어 보니
 * 453종목에서 분모가 꼭 3.16배 부풀어 있었다.
 */
export function 단위읽기(seg) {
  const m = seg.match(/단위\s*[:：]?\s*([가-힣]*원)/);
  if (!m) return null;
  const u = m[1];
  if (u.includes("억")) return 1e8;
  if (u.includes("백만")) return 1e6;
  if (u.includes("천")) return 1e3;
  if (u === "원") return 1;
  return null;
}

export function 부문비중(seg) {
  const 토큰 = 다듬기(seg).split(" ");
  const rows = [];
  let 말 = [];
  let 앞 = null;
  let 숫자중 = false;
  let 합계 = 0;

  for (const t of 토큰) {
    if (숫자꼴.test(t) || t === "-") {
      if (!숫자중) {
        숫자중 = true;
        const n = Number(t.replace(/[,%△▲]/g, ""));
        const 끝말 = 말.at(-1) ?? "";
        // 합계 여부는 다듬기 전에 본다. 이름다듬기는 "총계" 도 꼬리말로 보고
        // 떼어 내는데, 그러면 "총계 내수 327,124" 가 바로 앞 부문에 붙어
        // 비중이 통째로 뒤집힌다 (의류가 7.4% 에서 53% 가 됐다).
        const 합계행 = 말.some((w) => 총계말.test(w));
        const 이름 = 이름다듬기(말);
        말 = [];
        if (!n) continue;
        if (합계행) { 합계 = Math.max(합계, n); 앞 = null; continue; }
        const 대상 = 이름 || (딸림.test(끝말) ? 앞 : null);
        if (대상 && 대상.length >= 2 && 대상.length <= 24) {
          rows.push({ label: 대상, v: n });
          앞 = 대상;
        }
      }
      continue;
    }
    숫자중 = false;
    말.push(t);
    if (말.length > 7) 말.shift();
  }

  if (rows.length < 2) return null;
  const merged = {};
  for (const r of rows) merged[r.label] = (merged[r.label] ?? 0) + r.v;
  const 합 = Object.values(merged).reduce((a, b) => a + b, 0);
  // 표에 적힌 합계가 부문 합과 크게 다르지 않으면 그것을 분모로 쓴다
  const tot = 합계 && 합계 >= 합 * 0.8 && 합계 <= 합 * 1.6 ? 합계 : 합;
  if (!tot) return null;
  return Object.entries(merged)
    .map(([label, v]) => ({ label, v, 비중: Number((v / tot).toFixed(4)) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 12);
}

// ── 걷어 오기 ──────────────────────────────────────────────

async function 한종목({ corp, code, name }) {
  const lr = await get(
    `${BASE}/list.json?crtfc_key=${KEY}&corp_code=${corp}&bgn_de=20240101&pblntf_ty=A&page_count=30`,
  );
  if (!lr) return null;
  let j;
  try { j = await lr.json(); } catch { return null; }
  if (j.status === "013") return { code, name, skip: "공시없음" };
  if (j.status !== "000") return null;

  const cands = (j.list ?? []).filter((x) => /사업보고서/.test(x.report_nm));
  if (!cands.length) return { code, name, skip: "사업보고서없음" };

  for (const rep of cands.slice(0, 4)) {
    const dr = await get(`${BASE}/document.xml?crtfc_key=${KEY}&rcept_no=${rep.rcept_no}`);
    if (!dr) return null;
    const buf = Buffer.from(await dr.arrayBuffer());
    if (buf.length < 200 || buf.readUInt32LE(0) !== 0x04034b50) {
      // 014 는 "그 접수번호에 본문이 없다" — [첨부정정] 에서 흔하다. 다음 후보로.
      if (/<status>014<\/status>/.test(buf.toString("utf8"))) continue;
      return null;
    }
    let files;
    try { files = unzipAll(buf); } catch { return null; }
    const main = files.filter((f) => f.data).sort((a, b) => b.data.length - a.data.length)[0];
    if (!main) continue;
    const plain = decode(main.data)
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ");
    const seg = 매출대목(plain);
    if (!seg) return { code, name, skip: "매출표없음" };
    const rows = 부문비중(seg);
    if (!rows) return { code, name, skip: "표를못읽음" };
    return { code, name, rows, 단위: 단위읽기(seg) };
  }
  return { code, name, skip: "본문없음" };
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].split("\\").join("/")}`) {
  const corp = JSON.parse(fs.readFileSync(path.join(DIR, "corp.json"), "utf8"));
  const cls = JSON.parse(fs.readFileSync(path.join(DIR, "classified.json"), "utf8"));
  const 테마수 = new Map();
  for (const l of Object.values(cls)) for (const s of l) 테마수.set(s.code, (테마수.get(s.code) ?? 0) + 1);

  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : null;
  const all = process.argv.includes("--all");
  const 대상 = new Set(
    only ? [only] : [...테마수.entries()].filter(([, n]) => all || n >= 3).map(([c]) => c),
  );

  const ents = Object.values(corp).filter((c) => 대상.has(c.code));
  const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = ents.filter((e) => only || !(e.code in done));
  console.log(`대상 ${ents.length}종목 · 이미 있는 것 ${ents.length - todo.length} · 받을 것 ${todo.length}`);

  let ok = 0;
  let 빈것 = 0;
  let 실패연속 = 0;
  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC);
    const rs = await Promise.all(batch.map((e) => 한종목(e).catch(() => null)));
    for (const r of rs) {
      if (!r) { 실패연속++; continue; }
      실패연속 = 0;
      if (r.rows) { done[r.code] = { 단위: r.단위, rows: r.rows }; ok++; } else { done[r.code] = null; 빈것++; }
    }
    if (실패연속 >= 12) {
      console.log("\n연속 실패가 잦다 — 여기서 멈춘다. 다시 실행하면 이어서 받는다.");
      break;
    }
    if ((i / CONC) % 20 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(done));
      process.stdout.write(`\r  ${i + batch.length}/${todo.length} · 읽음 ${ok} · 못 읽음 ${빈것}   `);
    }
    await sleep(PAUSE);
  }
  fs.writeFileSync(OUT, JSON.stringify(done));
  console.log(`\n표를 읽은 종목 ${ok} · 못 읽은 종목 ${빈것} → ${OUT}`);
}
