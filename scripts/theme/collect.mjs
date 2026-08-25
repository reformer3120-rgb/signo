// DART 사업보고서에서 종목별 "사업의 개요" 를 모은다.
//
// 자체 테마 분류의 재료다. 에프앤가이드의 편입 사유도 결국 이 대목을
// 사람이 줄여 쓴 것이라, 원본에서 직접 가져오면 라이선스가 걸리지 않는다.
// DART 는 공공데이터법이 준칙이라 영리 목적 이용이 열려 있다.
//
// ── 속도에 관하여 ──────────────────────────────────────────
// 처음에 동시 8건으로 돌렸다가 1,000종목쯤에서 IP 가 막혔다 (ECONNRESET).
// 하루 2만 건이라는 한도와 별개로 순간 호출량에 반응한다. 그래서
//   · 동시 2건, 배치마다 쉼
//   · 연결이 끊기면 물러섰다 다시 (지수 백오프)
//   · 연속 실패가 쌓이면 아예 멈춘다 — 막힌 채로 계속 두드리면 더 길어진다
// 3,985종목이 40분 남짓 걸린다. 한 번 받아 두면 1년에 한 번만 갱신하면 된다.
//
// 실행
//   node scripts/theme/collect.mjs           전 종목 (이어받기)
//   node scripts/theme/collect.mjs 300       앞 300종목만
//   node scripts/theme/collect.mjs --wait    막혀 있으면 풀릴 때까지 기다렸다 시작
//   node scripts/theme/collect.mjs --only 069080   한 종목만, 왜 안 되는지 찍어 가며
//
// 결과 → .cache/theme/overview.json
//   { 종목코드: { code, name, report, text } }        받음
//   { 종목코드: { code, name, skip: "사업보고서없음" } } 받을 게 없음 (다시 안 두드림)
//   기록이 아예 없으면 = 아직 못 받음 → 다음 실행에서 다시 시도
import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const KEY = /^DART_API_KEY=(.*)$/m.exec(fs.readFileSync(".env.local", "utf8"))?.[1]?.trim();
if (!KEY) {
  console.error("DART_API_KEY 가 .env.local 에 없다.");
  process.exit(1);
}
const BASE = "https://opendart.fss.or.kr/api";
const OUT_DIR = ".cache/theme";
const OUT = path.join(OUT_DIR, "overview.json");

const args = process.argv.slice(2);
const WAIT = args.includes("--wait");
const ONLY = args[args.indexOf("--only") + 1] && args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const LIMIT = Number(args.find((a) => /^\d+$/.test(a))) || Infinity;
const CONC = 2;
const PAUSE_MS = 400; // 배치 사이 쉼
const MAX_FAIL_STREAK = 12; // 이만큼 연달아 실패하면 막힌 것으로 보고 멈춘다

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 연결이 끊기면 물러섰다 다시. 그래도 안 되면 null */
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.status === 429 || r.status >= 500) throw new Error("HTTP " + r.status);
      return r;
    } catch {
      if (i === tries - 1) return null;
      await sleep(1500 * 2 ** i);
    }
  }
  return null;
}

/** 중앙 디렉터리를 읽어 ZIP 안 파일을 전부 꺼낸다 */
function unzipAll(buf) {
  let eo = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
  }
  if (eo < 0) throw new Error("EOCD 없음");
  const n = buf.readUInt16LE(eo + 10);
  let p = buf.readUInt32LE(eo + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    let data = null;
    try {
      const body = buf.subarray(start, start + csize);
      data = method === 0 ? body : method === 8 ? inflateRawSync(body) : null;
    } catch { /* 깨진 항목은 건너뛴다 */ }
    out.push({ name, data, method });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

async function corpList() {
  const cache = path.join(OUT_DIR, "corp.json");
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  const r = await get(`${BASE}/corpCode.xml?crtfc_key=${KEY}`);
  if (!r) throw new Error("corpCode 를 받지 못했다");
  const files = unzipAll(Buffer.from(await r.arrayBuffer()));
  const xml = files.find((f) => f.name.endsWith(".xml")).data.toString("utf8");
  const out = [];
  for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const g = (t) => new RegExp(`<${t}>(.*?)</${t}>`).exec(m[1])?.[1]?.trim();
    const corp = g("corp_code");
    const stock = g("stock_code");
    const name = g("corp_name");
    if (corp && stock && stock.length === 6) out.push({ corp, code: stock, name });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(out));
  return out;
}

/**
 * 본문을 글자로 푼다.
 *
 * DART 원문은 EUC-KR 인 것도 있고 UTF-8 인 것도 있다. 처음에는 EUC-KR 로 읽고
 * "사업" 이라는 글자가 안 보이면 UTF-8 로 다시 읽었는데, 깨진 글자 속에 우연히
 * "사업" 이 섞이면 그대로 넘어갔다. 웹젠·조광피혁 등 34종목이 이 때문에
 * "개요 없음" 으로 접혔다.
 *
 * 이제 XML 선언을 먼저 보고, 그래도 애매하면 한글이 더 많이 나오는 쪽을 고른다.
 */
function decode(buf) {
  const head = buf.subarray(0, 200).toString("latin1");
  const dec = /encoding\s*=\s*["']?utf-?8/i.test(head)
    ? "utf-8"
    : /encoding\s*=\s*["']?(euc-kr|ks_c_5601)/i.test(head)
      ? "euc-kr"
      : null;
  if (dec) return new TextDecoder(dec).decode(buf);

  // 선언이 없으면 둘 다 읽어 보고 한글이 많은 쪽을 쓴다
  const sample = buf.subarray(0, 60000);
  const hangul = (t) => (t.match(/[가-힣]/g) ?? []).length;
  const e = new TextDecoder("euc-kr").decode(sample);
  const u = sample.toString("utf8");
  return hangul(u) > hangul(e)
    ? buf.toString("utf8")
    : new TextDecoder("euc-kr").decode(buf);
}

/**
 * "사업의 개요" 뒤 ~ "주요 제품" 앞.
 *
 * 목차에도 같은 제목이 있으므로 나오는 자리를 모두 재서 본문이 가장 긴 것을 고른다.
 *
 * 개요를 짧게 쓰는 회사가 있다. 웹젠은 167자다 —
 * "당사는 지배회사로서 게임 개발 및 서비스업, 지적재산권의 라이선스를 주요
 * 사업으로 영위하고 있으며…". 문턱을 200자로 뒀더니 이런 회사 서른 곳이
 * 통째로 빠졌다. 짧아도 무엇 하는 회사인지는 충분히 알 수 있다.
 *
 * 그래도 너무 짧으면 판정할 게 없으므로, 개요가 얇을 때는 바로 다음 절
 * ("주요 제품 및 서비스")까지 이어 붙여 본다.
 */
const MIN_OVERVIEW = 80;

function overview(plain) {
  let best = "";
  const re = /사업의\s*개요/g;
  let m;
  while ((m = re.exec(plain))) {
    const from = m.index + m[0].length;
    const tail = plain.slice(from, from + 12000);
    const stop = /(?:2\s*\.?\s*주요\s*제품|주요\s*제품\s*및\s*서비스)/.exec(tail);
    let seg = (stop ? tail.slice(0, stop.index) : tail).trim();

    // 개요가 얇으면 다음 절까지 이어 붙인다 (제품 목록에 업종이 드러난다)
    if (stop && seg.length < 400) {
      const more = /(?:3\s*\.?\s*원재료|원재료\s*및\s*생산설비|4\s*\.?\s*매출)/.exec(tail);
      seg = tail.slice(0, more ? more.index : Math.min(tail.length, stop.index + 1500)).trim();
    }
    if (seg.length > best.length) best = seg;
  }
  return best.length > MIN_OVERVIEW ? best.slice(0, 6000) : null;
}


/** 본문 하나를 받아 개요를 뽑는다. 파일이 없으면 "없음", 통신 실패면 null */
async function docOf(rcept) {
  const dr = await get(`${BASE}/document.xml?crtfc_key=${KEY}&rcept_no=${rcept}`);
  if (!dr) return null;
  const buf = Buffer.from(await dr.arrayBuffer());

  // ZIP 이 아니면 오류 XML 이다. 그 중 014 는 "그 접수번호에 본문 파일이 없다" 는
  // 뜻이라 다시 불러도 소용없다 — [첨부정정] 보고서에서 자주 나온다.
  // 통신 실패와 구분하지 않으면 연속 실패로 세어져 수집이 통째로 멈춘다.
  if (buf.length < 200 || buf.readUInt32LE(0) !== 0x04034b50) {
    const t = buf.toString("utf8");
    if (/<status>014<\/status>/.test(t)) return "없음";
    return null;
  }
  let files;
  try { files = unzipAll(buf); } catch { return null; }
  const main = files.filter((f) => f.data).sort((a, b) => b.data.length - a.data.length)[0];
  if (!main) return "없음";
  const plain = decode(main.data).replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
  return overview(plain) ?? "없음";
}

/** 성공 → 기록 / 받을 게 없음 → skip / 통신 실패 → null (기록하지 않는다) */
async function fetchOne({ corp, code, name }) {
  const lr = await get(
    `${BASE}/list.json?crtfc_key=${KEY}&corp_code=${corp}&bgn_de=20240101&pblntf_ty=A&page_count=30`,
  );
  if (!lr) return null;
  let j;
  try { j = await lr.json(); } catch { return null; }
  if (j.status === "013") return { code, name, skip: "공시없음" };
  if (j.status !== "000") return null; // 020 한도초과 등 — 다시 시도해야 한다

  // 사업보고서 후보를 최근 순으로 모은다. 가장 최근 것이 [첨부정정] 이라 본문이
  // 없을 수 있으므로, 될 때까지 아래로 내려간다. 서연이화·제주항공 등 55종목이
  // 이 때문에 빠져 있었다.
  const cands = (j.list ?? []).filter((x) => /사업보고서/.test(x.report_nm));
  if (!cands.length) return { code, name, skip: "사업보고서없음" };

  for (const rep of cands.slice(0, 4)) {
    const r = await docOf(rep.rcept_no);
    if (r === null) return null;      // 통신 실패 — 다음 실행에서 다시
    if (r !== "없음") return { code, name, report: rep.report_nm, text: r };
  }
  return { code, name, skip: "개요항목없음" };
}

/** 막혀 있는지 확인. 필요하면 풀릴 때까지 기다린다 */
async function waitUntilOpen() {
  for (let i = 0; i < 60; i++) {
    const r = await get(`${BASE}/list.json?crtfc_key=${KEY}&corp_code=00126380&bgn_de=20240101&pblntf_ty=A&page_count=1`, 1);
    if (r) {
      const j = await r.json().catch(() => null);
      if (j?.status === "000") return true;
      console.log(`  아직 — status ${j?.status ?? "?"}`);
    } else {
      console.log("  아직 — 연결 거부");
    }
    if (!WAIT) return false;
    await sleep(60_000);
  }
  return false;
}

// ── 실행 ──────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });
let have = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

// 앞선 실행에서 통신 실패를 "없음" 으로 잘못 기록한 것들을 되살린다.
// text 도 skip 도 없는 항목이 그것이다.
const revived = Object.keys(have).filter((k) => !have[k].text && !have[k].skip);
if (revived.length) {
  for (const k of revived) delete have[k];
  fs.writeFileSync(OUT, JSON.stringify(have));
  console.log(`잘못 기록된 실패 ${revived.length}건을 지웠다 — 다시 받는다.`);
}

console.log("DART 상태 확인…");
if (!(await waitUntilOpen())) {
  console.error("DART 가 응답하지 않는다. 잠시 뒤 다시 실행하거나 --wait 로 돌릴 것.");
  process.exit(2);
}
console.log("  열려 있다.");

const all = await corpList();

// 상장 종목 목록이 있으면 그것만 받는다.
//
// DART 대응표에는 상장폐지된 회사가 남아 있다 (하이트맥주·웅진에너지 등
// 3,985건 중 1,200여 개). 그것까지 두드리면 시간도 한도도 낭비고, 무엇보다
// 남은 건수가 실제보다 훨씬 많아 보여 어디까지 왔는지 알기 어렵다.
const listedPath = path.join(OUT_DIR, "listed.json");
let onlyListed = null;
if (fs.existsSync(listedPath)) {
  onlyListed = new Set(
    JSON.parse(fs.readFileSync(listedPath, "utf8")).map((s) => s.code),
  );
}
const pool = onlyListed ? all.filter((c) => onlyListed.has(c.code)) : all;
if (onlyListed) console.log(`상장 종목만 받는다 — 대응표 ${all.length} 중 ${pool.length}`);
const todo = ONLY
  ? pool.filter((c) => c.code === ONLY)
  : pool.filter((c) => !have[c.code]).slice(0, LIMIT);

// 한 종목만 볼 때는 어디서 걸리는지 찍는다
if (ONLY) {
  const c = todo[0];
  if (!c) { console.log(`${ONLY} — 상장 목록에 없다`); process.exit(0); }
  const lr = await get(
    `${BASE}/list.json?crtfc_key=${KEY}&corp_code=${c.corp}&bgn_de=20240101&pblntf_ty=A&page_count=30`,
  );
  const j = await lr.json();
  const cands = (j.list ?? []).filter((x) => /사업보고서/.test(x.report_nm));
  console.log(`${c.name} (${c.code}) — 사업보고서 후보 ${cands.length}건`);
  for (const rep of cands.slice(0, 4)) {
    const dr = await get(`${BASE}/document.xml?crtfc_key=${KEY}&rcept_no=${rep.rcept_no}`);
    const buf = Buffer.from(await dr.arrayBuffer());
    const isZip = buf.length >= 200 && buf.readUInt32LE(0) === 0x04034b50;
    let note = `ZIP 아님 (${buf.subarray(0, 120).toString("utf8").replace(/\s+/g, " ")})`;
    if (isZip) {
      let files = [];
      try { files = unzipAll(buf); } catch (e) { note = "ZIP 해제 실패: " + e.message; }
      const live = files.filter((f) => f.data);
      if (live.length) {
        const main = live.sort((a, b) => b.data.length - a.data.length)[0];
        const txt = decode(main.data);
        const plain = txt.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
        const o = overview(plain);
        note =
          `본문 ${Math.round(main.data.length / 1024)}KB · 한글 ${(txt.match(/[가-힣]/g) ?? []).length}자` +
          ` · "사업의 개요" ${plain.includes("사업의 개요") ? "있음" : "없음"}` +
          ` · 뽑힘 ${o ? o.length + "자" : "실패"}`;
        if (!o) {
          const re2 = /사업의\s*개요/g;
          let mm;
          let k = 0;
          while ((mm = re2.exec(plain)) && k < 4) {
            k++;
            const from = mm.index + mm[0].length;
            const tail = plain.slice(from, from + 12000);
            const stop = /(?:2\s*\.?\s*주요\s*제품|주요\s*제품\s*및\s*서비스)/.exec(tail);
            const seg = (stop ? tail.slice(0, stop.index) : tail).trim();
            note += `
       #${k} 끊긴자리 ${stop ? stop.index : "없음"} · 길이 ${seg.length} · ${seg.slice(0, 70)}`;
          }
        }
      } else if (files.length) {
        note = `ZIP 안 ${files.length}개 중 풀린 것 0 — 압축 방식 ${files.map((f) => f.method ?? "?").join(",")}`;
      }
    }
    console.log(`  ${rep.rcept_dt} ${rep.report_nm}
     ${note}`);
  }
  process.exit(0);
}
console.log(`이미 처리 ${Object.keys(have).length} · 받을 것 ${todo.length}`);

let done = 0, ok = 0, skip = 0, fail = 0, streak = 0;
const t0 = Date.now();
for (let i = 0; i < todo.length; i += CONC) {
  const batch = todo.slice(i, i + CONC);
  const res = await Promise.all(batch.map((c) => fetchOne(c).catch(() => null)));
  for (let k = 0; k < batch.length; k++) {
    const r = res[k];
    if (!r) { fail++; streak++; continue; } // 기록하지 않는다 → 다음 실행에서 재시도
    streak = 0;
    have[r.code] = r;
    if (r.text) ok++; else skip++;
  }
  done += batch.length;

  if (streak >= MAX_FAIL_STREAK) {
    fs.writeFileSync(OUT, JSON.stringify(have));
    console.log(`\n연속 ${streak}건 실패 — 막힌 것으로 보고 멈춘다. 지금까지 받은 것은 저장했다.`);
    console.log("잠시 뒤 같은 명령으로 다시 실행하면 남은 것부터 이어받는다.");
    process.exit(3);
  }

  if (done % 50 === 0 || done === todo.length) {
    fs.writeFileSync(OUT, JSON.stringify(have));
    const sec = (Date.now() - t0) / 1000;
    const eta = ((todo.length - done) * (sec / done)) / 60;
    process.stdout.write(
      `\r  ${done}/${todo.length} · 개요 ${ok} · 해당없음 ${skip} · 실패 ${fail} · 남은 ${eta.toFixed(0)}분   `,
    );
  }
  await sleep(PAUSE_MS);
}
fs.writeFileSync(OUT, JSON.stringify(have));
const filled = Object.values(have).filter((v) => v.text).length;
console.log(`\n완료 — 개요 확보 ${filled}종목`);
