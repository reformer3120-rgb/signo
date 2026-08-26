// 분류 결과를 앱이 쓰는 데이터 파일로 굳힌다.
//
// 편입 사유는 지어내지 않는다. 분류의 근거가 된 문장을 사업보고서에서
// 그대로 가져온다. 어떤 낱말 때문에 붙었는지도 함께 남겨서, 화면에서
// "왜 이 테마인가" 를 근거와 함께 보여줄 수 있게 한다.
//
// 실행
//   node scripts/theme/build-data.mjs
// 결과 → src/data/themes.json  (분기에 한 번 갱신하면 된다)
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "./dict.mjs";
import { ourSentences, SELF } from "./classify.mjs";
import { 사업항목 } from "./biz.mjs";

const DIR = ".cache/theme";
const OUT = "src/data/themes.json";
const MAX_WHY = 220; // 화면에서 두 줄쯤

const ov = JSON.parse(fs.readFileSync(path.join(DIR, "overview.json"), "utf8"));
const cls = JSON.parse(fs.readFileSync(path.join(DIR, "classified.json"), "utf8"));

// 재무는 분기에 한 번 바뀐다. 요청 때마다 DART 를 부를 이유가 없어 여기서 싣는다
// (scripts/theme/collect-fin.mjs 가 모아 둔다).
const finPath = path.join(DIR, "fin.json");
const FIN = fs.existsSync(finPath) ? JSON.parse(fs.readFileSync(finPath, "utf8")) : {};

/**
 * 근거 낱말이 든 문장 가운데 가장 잘 읽히는 것을 고른다.
 *
 * 그냥 낱말 수와 길이로만 고르면 표를 덤프한 줄이 뽑힌다. 사업보고서에는
 * "구분 분류 주요 품목 기능 동력발생장치 엔진본체, 연료분사장치, …" 같은
 * 표가 문장인 척 섞여 있다. 그래서
 *   · 분류할 때와 같은 문장 거르기를 먼저 통과시키고 (시황·전방산업 등 제외)
 *   · 자기 회사를 말하는 문장(당사·연결회사)을 우선하고
 *   · 문장답게 끝나는 것(…습니다/합니다/영위)을 우선하고
 *   · 쉼표가 지나치게 많은 줄(표)은 깎는다.
 */
const ENDS = /(습니다|합니다|입니다|하였습니다|있습니다|영위|생산|판매|개발)[.]?$/;

function pickWhy(text, keywords) {
  const all = ourSentences(text).filter((s) => SELF.test(s));
  // 문장답게 끝나는 것만 먼저 본다. 사업보고서에는 표를 한 줄로 풀어놓은 것이
  // 많은데("사업부문 주요제품 주요 계열회사 디스플레이 복합시트 …"), 그것들은
  // 마침 표현이 없다. 그런 줄만 남으면 어쩔 수 없이 쓴다.
  const proper = all.filter((s) => ENDS.test(s.trim()));
  const sents = proper.length ? proper : all;
  let best = null;
  let bestScore = -1;
  for (const s of sents) {
    const hit = keywords.filter((k) => s.includes(k)).length;
    if (!hit) continue;
    const commas = (s.match(/[,·]/g) ?? []).length;
    const len = s.length;
    let score = hit * 2;
    if (/당사|자사|연결회사|당사의/.test(s)) score += 3;
    if (/(습니다|합니다|입니다|영위|있음)\.?$/.test(s)) score += 2;
    if (commas > 6) score -= 4; // 표를 덤프한 줄
    if (commas > 12) score -= 4;
    score += len < 40 ? -2 : len <= 260 ? 1 : 260 / len;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (!best) return null;
  let out = best.replace(/^[(（]?\d+[)）]?\s*/, "").replace(/^[가-힣][.)]\s*/, "").trim();
  if (거른다(out)) return null;
  out = 평서문(out);
  if (out.length > MAX_WHY) out = out.slice(0, MAX_WHY).replace(/\s+\S*$/, "") + "…";
  return out;
}

/**
 * 점수만으로 고르면 마땅한 문장이 없는 종목에서 찌꺼기가 뽑힌다.
 * 그럴 때는 억지로 채우지 말고 비워 두는 편이 낫다 — 표를 풀어 놓은 줄이나
 * 업계 전망을 편입 사유라고 내보내면 읽는 사람을 속이는 것이다.
 */
function 거른다(s) {
  if (s.length < 25) return true;
  // 앞이 잘렸거나 앞 문장에 매달린 것 — 그것만 떼어 놓으면 뜻이 서지 않는다
  if (/^(또한|더불어|이에|그리고|한편|이러한|이와|아울러|반면|다만|따라서|특히)/.test(s)) return true;
  if (/^[를을은는이가와과의도]\s/.test(s) || /^[를을]/.test(s)) return true;
  // 하려는 일이지 하고 있는 일이 아니다
  if (/할 예정|추진 중|계획(이다|입니다|하고)|목표로 하|검토 중/.test(s)) return true;
  // 표를 한 줄로 풀어 놓은 것
  if ((s.match(/[,·]/g) ?? []).length > 6) return true;
  if ((s.match(/\//g) ?? []).length >= 3) return true;
  if (/대분류\s*중분류|사업부문\s*주요|구분\s*(품목|내용|주요)/.test(s)) return true;
  // 업계 전망 · 시장 규모 — 회사가 무엇을 하는지가 아니다
  if (/전망(하|이며|되며|입니다)|달할 것|성장할 것|파급효과|시장규모(는|가)|연평균 성장률/.test(s)) return true;
  // 업종 일반론 (자기 회사 얘기가 아니다)
  if (/^(지주회사|리츠|이 산업|해당 산업|본 산업)(는|은|이란)/.test(s)) return true;
  return false;
}

/**
 * 사람이 적어 준 문장은 "…생산한다" 인데 원문 발췌는 "…생산합니다" 다.
 * 한 화면에 섞이면 눈에 걸리므로 어미만 맞춘다. 뜻은 건드리지 않는다.
 */
const 어미 = [
  [/하였습니다\.?$/, "했다."], [/되었습니다\.?$/, "됐다."],
  [/있습니다\.?$/, "있다."], [/없습니다\.?$/, "없다."],
  [/습니다\.?$/, "다."],
  [/합니다\.?$/, "한다."], [/됩니다\.?$/, "된다."],
];
function 평서문(s) {
  // "…영위하고 있습니다.3) 건설업" — 다음 절 머리가 붙어 온 것을 떼어 낸다
  let t = s.trim().replace(/([다요])\.\s*\d+[).]?\s*\S*$/, "$1.").trim();
  // "…입니다" 는 받침을 봐야 한다. 기업입니다→기업이다 · 회사입니다→회사다
  const m = t.match(/^(.*?)입니다\.?$/);
  if (m) {
    const h = m[1].trim();
    const c = h.charCodeAt(h.length - 1) - 0xac00;
    const 받침 = c >= 0 && c < 11172 && c % 28 !== 0;
    return h + (받침 ? "이다." : "다.");
  }
  for (const [re, to] of 어미) if (re.test(t)) return t.replace(re, to);
  return /[.!?…]$/.test(t) ? t : t + ".";
}

/**
 * 대분류. id 앞머리로 갈리므로 테마마다 따로 적지 않는다.
 * 화면에서 60개를 한 판에 늘어놓으면 훑을 수가 없어 이 단위로 접는다.
 */
const GROUPS = [
  ["batt", "2차전지"],
  ["semi", "반도체"],
  ["disp", "디스플레이"],
  ["elec", "전자부품"],
  ["bio", "제약·바이오"],
  ["med", "제약·바이오"],
  ["ind", "산업재"],
  ["eng", "에너지·전력"],
  ["mat", "소재"],
  ["car", "자동차"],
  ["it", "IT·플랫폼"],
  ["csm", "소비재"],
  ["fin", "금융"],
];
const groupOf = (id) => GROUPS.find(([p]) => id.startsWith(p + "-"))?.[1] ?? "기타";

const byId = Object.fromEntries(THEMES.map((t) => [t.id, t]));
const themes = [];
let withWhy = 0;
let total = 0;

for (const [id, list] of Object.entries(cls)) {
  const t = byId[id];
  if (!t || !list.length) continue;
  const stocks = [];
  for (const s of list) {
    const row = Object.values(ov).find((x) => x.code === s.code);
    const why = row?.text ? pickWhy(row.text, s.why) : null;
    total++;
    if (why) withWhy++;
    const f = FIN[s.code] ?? null;
    stocks.push({
      code: s.code,
      name: s.name,
      // 사람이 확인해 적어 준 문장이 있으면 그것을 쓴다. 원문에서 뽑은 발췌보다
      // 짧고 읽기 쉽다 — "무엇을 만들어 어디에 파는가" 한 문장이다.
      why: s.manualWhy ?? why,
      // 목록에서는 문장을 읽지 않는다. "무엇을 파는가" 만 낱말로 따로 싣는다.
      biz: 사업항목(s.manualWhy ?? why, s.why, s.name),
      tags: s.why,
      growth: f?.growth ?? null,
      opm: f?.opm ?? null,
      finYear: f?.year ?? null,
    });
  }
  themes.push({ id, name: t.name, group: groupOf(id), hint: t.hint, stocks });
}

themes.sort((a, b) => b.stocks.length - a.stocks.length);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      // 화면 하단 출처 표기에 쓴다
      출처: "테마 분류·편입 사유는 SIGNO 가 DART 사업보고서(공공데이터)를 바탕으로 직접 만든 것이다.",
      기준: "최근 사업보고서 '사업의 내용 — 사업의 개요'",
      만든날: new Date().toISOString().slice(0, 10),
      themes,
    },
    null,
    0,
  ),
);

const kb = Math.round(fs.statSync(OUT).size / 1024);
const 전부 = themes.flatMap((t) => t.stocks);
const withFin = 전부.filter((s) => s.growth !== null || s.opm !== null).length;
const withBiz = 전부.filter((s) => s.biz.length).length;
console.log(`테마 ${themes.length}개 · 종목 ${total} · 편입 사유 ${withWhy} (${((withWhy / total) * 100).toFixed(0)}%) · 재무 ${withFin} (${((withFin / total) * 100).toFixed(0)}%) · 주요사업 ${withBiz} (${((withBiz / total) * 100).toFixed(0)}%)`);
console.log(`→ ${OUT}  ${kb}KB`);
console.log("\n예시");
for (const t of themes.slice(0, 3)) {
  const s = t.stocks[0];
  console.log(`  [${t.name}] ${s.name}`);
  console.log(`    ${s.why ? s.why.slice(0, 120) + "…" : "(근거 문장 없음)"}`);
}
