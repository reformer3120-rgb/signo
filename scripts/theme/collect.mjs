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
    out.push({ name, data });
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
 * "사업의 개요" 뒤 ~ "주요 제품" 앞.
 * 목차에도 같은 제목이 있으므로 나오는 자리를 모두 재서 본문이 가장 긴 것을 고른다.
 */
function overview(plain) {
  let best = "";
  const re = /사업의\s*개요/g;
  let m;
  while ((m = re.exec(plain))) {
    const from = m.index + m[0].length;
    const tail = plain.slice(from, from + 12000);
    const stop = /(?:2\s*\.?\s*주요\s*제품|주요\s*제품\s*및\s*서비스)/.exec(tail);
    const seg = (stop ? tail.slice(0, stop.index) : tail).trim();
    if (seg.length > best.length) best = seg;
  }
  return best.length > 200 ? best.slice(0, 6000) : null;
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
  const rep = (j.list ?? []).find((x) => /사업보고서/.test(x.report_nm));
  if (!rep) return { code, name, skip: "사업보고서없음" };

  const dr = await get(`${BASE}/document.xml?crtfc_key=${KEY}&rcept_no=${rep.rcept_no}`);
  if (!dr) return null;
  const buf = Buffer.from(await dr.arrayBuffer());
  // 오류일 때는 XML 로 온다 (ZIP 이 아니다)
  if (buf.length < 200 || buf.readUInt32LE(0) !== 0x04034b50) return null;
  let files;
  try { files = unzipAll(buf); } catch { return null; }
  const main = files.filter((f) => f.data).sort((a, b) => b.data.length - a.data.length)[0];
  if (!main) return { code, name, skip: "본문없음" };
  let text = new TextDecoder("euc-kr").decode(main.data);
  if (!/사업/.test(text.slice(0, 20000))) text = main.data.toString("utf8");
  const plain = text.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
  const t = overview(plain);
  return t
    ? { code, name, report: rep.report_nm, text: t }
    : { code, name, skip: "개요항목없음" };
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
const todo = all.filter((c) => !have[c.code]).slice(0, LIMIT);
console.log(`상장사 ${all.length} · 이미 처리 ${Object.keys(have).length} · 받을 것 ${todo.length}`);

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
