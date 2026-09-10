// DART 를 두드리는 공용 부분.
//
// 사업보고서 수집(collect.mjs)과 매출 비중 수집(collect-sales.mjs)이 같이 쓴다.
// 예전에는 collect.mjs 안에만 있었는데, 그것을 가져오면 수집기 본체가 통째로
// 돌아 버린다(진입 가드가 없다). 그래서 따로 뗐다.
import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

export const KEY = /^DART_API_KEY=(.*)$/m.exec(fs.readFileSync(".env.local", "utf8"))?.[1]?.trim();
export const BASE = "https://opendart.fss.or.kr/api";

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

export { get, unzipAll, decode };

// ── 받은 것을 남겨 둔다 ───────────────────────────────────
//
// 접수번호가 곧 그 보고서의 판이다. 한 번 받은 원문은 두 번 다시 바뀌지
// 않는다. 그런데 수집기 넷(개요·매출·주주·부문)이 같은 보고서를 저마다
// 받았고, 뽑는 잣대를 고쳐 다시 돌릴 때도 처음부터 다시 받았다.
//
// 부문 매출을 판 1 에서 판 2 로 갈아 끼우다 하루 한도(2만 건)에 걸려
// 707종목을 남긴 까닭이 이것이다. 받은 원문을 그대로 두면 다음 판갈이는
// 호출이 한 건도 들지 않는다.
//
// zip 을 그대로 둔다. 풀어서 gzip 해도 크기가 같고(762KB → 8.7MB → 777KB),
// 어느 수집기는 zip 안 파일을 통째로 잇고 어느 수집기는 가장 큰 것만 쓰므로
// 원본이 아니면 둘 다를 못 준다.
const 캐시터 = process.env.DART_CACHE ?? ".cache/dart";

/** 한도(020)에 걸렸는가 — 걸리면 그 자리에서 멈추고 다음에 이어받는다 */
let 한도 = false;
export const 한도넘었나 = () => 한도;

/** 몇 번을 두드렸고 몇 번을 남겨 둔 것으로 때웠는가 */
const 셈판 = { 부름: 0, 캐시: 0 };
export const 셈 = () => ({ ...셈판 });

/** 접수번호는 날짜로 시작한다(20260323000123). 달마다 갈라 담는다. */
const 원문자리 = (rcept) => path.join(캐시터, "doc", String(rcept).slice(0, 6));

function 적기(p, 내용) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 내용);
}

/**
 * 보고서 원문(zip 바이트).
 *
 *   Buffer  받았다 — 캐시에 있으면 호출 없이 그대로
 *   "없음"  그 접수번호에 본문 파일이 없다(status 014). [첨부정정] 에서 흔하고
 *           다시 불러도 소용없어 이것도 남긴다.
 *   null    통신 실패이거나 한도를 넘었다 — 남기지 않는다. 다음에 다시 받는다.
 */
export async function 원문(rcept) {
  const 자리 = 원문자리(rcept);
  const 파일 = path.join(자리, `${rcept}.zip`);
  const 빈것 = path.join(자리, `${rcept}.없음`);
  try { if (fs.existsSync(파일)) { 셈판.캐시++; return fs.readFileSync(파일); } } catch { /* 깨졌으면 다시 받는다 */ }
  if (fs.existsSync(빈것)) { 셈판.캐시++; return "없음"; }
  if (한도) return null;

  셈판.부름++;
  const r = await get(`${BASE}/document.xml?crtfc_key=${KEY}&rcept_no=${rcept}`);
  if (!r) return null;
  const buf = Buffer.from(await r.arrayBuffer());

  // ZIP 이 아니면 오류 XML 이다. 한도 초과도 여기로 온다 — 정상 응답이라
  // 통신 실패와 증상이 다르다.
  if (buf.length < 200 || buf.readUInt32LE(0) !== 0x04034b50) {
    const t = buf.toString("utf8");
    if (/<status>020<\/status>/.test(t)) { 한도 = true; return null; }
    if (/<status>014<\/status>/.test(t)) { 적기(빈것, ""); return "없음"; }
    return null;
  }
  적기(파일, buf);
  return buf;
}

/** 원문 안 파일을 모두 이어 붙인 글 — 부문·주주 수집기가 이렇게 읽는다 */
export async function 원문글(rcept) {
  const buf = await 원문(rcept);
  if (!Buffer.isBuffer(buf)) return buf === "없음" ? "" : null;
  let xml = "";
  try { for (const f of unzipAll(buf)) if (f.data) xml += decode(f.data); } catch { return null; }
  return xml;
}

/** 원문 안에서 가장 큰 파일 하나 — 개요·매출 수집기가 보는 본문이다 */
export async function 원문본문(rcept) {
  const buf = await 원문(rcept);
  if (!Buffer.isBuffer(buf)) return buf === "없음" ? "없음" : null;
  let files;
  try { files = unzipAll(buf); } catch { return null; }
  const main = files.filter((f) => f.data).sort((a, b) => b.data.length - a.data.length)[0];
  return main ? decode(main.data) : "없음";
}

/**
 * 공시 목록. 사업·분기·반기보고서는 석 달에 한 번 나오므로 며칠 묵어도 된다.
 * 기본 사흘, `묵힘` 으로 바꾼다(0 이면 늘 새로 받는다).
 */
export async function 공시목록(corpCode, { bgn = "20240101", end = "", ty = "A", n = 30, 묵힘 = 3 } = {}) {
  const 파일 = path.join(캐시터, "list", `${corpCode}-${bgn}-${end}-${ty}-${n}.json`);
  if (묵힘 > 0 && fs.existsSync(파일)) {
    try {
      const c = JSON.parse(fs.readFileSync(파일, "utf8"));
      if (Date.now() - c.받은때 < 묵힘 * 864e5) { 셈판.캐시++; return c.list; }
    } catch { /* 깨졌으면 다시 받는다 */ }
  }
  if (한도) return null;

  셈판.부름++;
  const url = `${BASE}/list.json?crtfc_key=${KEY}&corp_code=${corpCode}` +
    `&bgn_de=${bgn}${end ? `&end_de=${end}` : ""}&pblntf_ty=${ty}&page_count=${n}`;
  const r = await get(url);
  if (!r) return null;
  let j;
  try { j = await r.json(); } catch { return null; }
  if (j.status === "020") { 한도 = true; return null; }
  // 013 은 "공시가 없다" — 빈 목록으로 남긴다. 다시 물어도 답이 같다.
  if (j.status !== "000" && j.status !== "013") return null;
  const list = j.list ?? [];
  적기(파일, JSON.stringify({ 받은때: Date.now(), list }));
  return list;
}
