// 편입 종목의 매출액증가율·영업이익률을 DART 에서 모은다.
//
// ── 왜 미리 모으나 ────────────────────────────────────────
// 처음에는 화면이 요청받을 때마다 DART 를 불렀다. 그런데 재배포로 캐시가 비면
// 한 요청이 시세 2,700건에 재무 17종목(종목당 5회 호출)을 다 해야 해서 60초를
// 넘겼다. 재무제표는 분기에 한 번 바뀌는 값이다 — 요청 때 부를 이유가 없다.
//
// 미리 모아 데이터 파일에 넣으면 운영에서는 DART 를 아예 안 부른다.
// Vercel 에 DART_API_KEY 를 둘 필요도 없다.
//
// ── 호출 수 ───────────────────────────────────────────────
// fnlttSinglAcnt 는 한 번에 당기·전기·전전기를 다 준다. 그래서 종목당 1회면
// 증가율까지 나온다. 2,600종목이면 2,600회 — 하루 한도 2만의 13% 다.
//
// 앞서 동시 8건으로 두드리다 IP 가 막힌 적이 있다. 동시 3건에 쉼을 둔다.
//
// 실행
//   node scripts/theme/collect-fin.mjs
// 결과 → .cache/theme/fin.json  { 종목코드: { growth, opm, year } }
import fs from "node:fs";
import path from "node:path";

const KEY = /^DART_API_KEY=(.*)$/m.exec(fs.readFileSync(".env.local", "utf8"))?.[1]?.trim();
if (!KEY) {
  console.error("DART_API_KEY 가 .env.local 에 없다.");
  process.exit(1);
}
const DIR = ".cache/theme";
const OUT = path.join(DIR, "fin.json");
const CONC = 3;
const PAUSE = 250;
const MAX_FAIL_STREAK = 15;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.status >= 500 || r.status === 429) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch {
      if (i === tries - 1) return null;
      await sleep(1500 * 2 ** i);
    }
  }
  return null;
}

const won = (v) => {
  const x = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(x) ? x : NaN;
};

/** 연결(CFS) 우선, 없으면 별도(OFS) */
function pick(list, name) {
  const pref = list.some((r) => r.fs_div === "CFS") ? "CFS" : "OFS";
  return list.find((r) => r.fs_div === pref && r.account_nm.replace(/\s/g, "") === name);
}

/** 사업보고서 한 건에서 매출액증가율과 영업이익률을 뽑는다 */
async function finOf(corp, year) {
  const j = await get(
    `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${KEY}` +
      `&corp_code=${corp}&bsns_year=${year}&reprt_code=11011`,
  );
  if (!j) return undefined; // 통신 실패 — 기록하지 않는다
  if (j.status === "013") return null; // 자료 없음
  if (j.status !== "000") return undefined;

  const list = j.list ?? [];
  const sales = pick(list, "매출액") ?? pick(list, "수익(매출액)");
  const op = pick(list, "영업이익") ?? pick(list, "영업이익(손실)");
  if (!sales) return null;

  const cur = won(sales.thstrm_amount);
  const prev = won(sales.frmtrm_amount);
  const opCur = op ? won(op.thstrm_amount) : NaN;

  return {
    growth:
      Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0
        ? +(((cur - prev) / Math.abs(prev)) * 100).toFixed(2)
        : null,
    opm:
      Number.isFinite(opCur) && Number.isFinite(cur) && cur !== 0
        ? +((opCur / cur) * 100).toFixed(2)
        : null,
    year,
  };
}

const corpList = JSON.parse(fs.readFileSync(path.join(DIR, "corp.json"), "utf8"));
const corpOf = Object.fromEntries(corpList.map((c) => [c.code, c.corp]));

const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8")).themes;
const codes = [...new Set(themes.flatMap((t) => t.stocks.map((s) => s.code)))];

fs.mkdirSync(DIR, { recursive: true });
const have = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = codes.filter((c) => have[c] === undefined && corpOf[c]);
console.log(`편입 종목 ${codes.length} · 이미 받음 ${Object.keys(have).length} · 받을 것 ${todo.length}`);

// 사업보고서는 3월쯤 나온다. 올해 것이 아직 없으면 작년 것으로 물러선다.
const THIS = new Date().getUTCFullYear();
let done = 0, ok = 0, none = 0, fail = 0, streak = 0;
const t0 = Date.now();

for (let i = 0; i < todo.length; i += CONC) {
  const batch = todo.slice(i, i + CONC);
  const res = await Promise.all(
    batch.map(async (code) => {
      for (const y of [THIS - 1, THIS - 2]) {
        const r = await finOf(corpOf[code], y);
        if (r === undefined) return undefined; // 통신 실패
        if (r) return r;
      }
      return null; // 두 해 다 자료 없음
    }),
  );
  for (let k = 0; k < batch.length; k++) {
    const r = res[k];
    if (r === undefined) { fail++; streak++; continue; }
    streak = 0;
    have[batch[k]] = r;
    if (r) ok++; else none++;
  }
  done += batch.length;

  if (streak >= MAX_FAIL_STREAK) {
    fs.writeFileSync(OUT, JSON.stringify(have));
    console.log(`\n연속 ${streak}건 실패 — 막힌 것으로 보고 멈춘다. 받은 것은 저장했다.`);
    console.log("잠시 뒤 같은 명령으로 다시 실행하면 남은 것부터 이어받는다.");
    process.exit(3);
  }
  if (done % 60 === 0 || done === todo.length) {
    fs.writeFileSync(OUT, JSON.stringify(have));
    const sec = (Date.now() - t0) / 1000;
    process.stdout.write(
      `\r  ${done}/${todo.length} · 확보 ${ok} · 자료없음 ${none} · 실패 ${fail}` +
        ` · 남은 ${(((todo.length - done) * (sec / done)) / 60).toFixed(0)}분   `,
    );
  }
  await sleep(PAUSE);
}
fs.writeFileSync(OUT, JSON.stringify(have));
const filled = Object.values(have).filter((v) => v).length;
console.log(`\n완료 — 재무 확보 ${filled} / ${Object.keys(have).length}`);
