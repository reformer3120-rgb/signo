// DART 를 두드리는 공용 부분.
//
// 사업보고서 수집(collect.mjs)과 매출 비중 수집(collect-sales.mjs)이 같이 쓴다.
// 예전에는 collect.mjs 안에만 있었는데, 그것을 가져오면 수집기 본체가 통째로
// 돌아 버린다(진입 가드가 없다). 그래서 따로 뗐다.
import fs from "node:fs";
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
