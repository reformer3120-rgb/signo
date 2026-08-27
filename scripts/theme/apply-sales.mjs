// 매출이 작은 곁가지 사업으로 붙은 테마를 뗀다.
//
// ── 왜 ─────────────────────────────────────────────────────
// 규칙은 사업보고서를 통째로 읽으므로, 여러 사업을 하는 회사에서 곁가지가
// 주력보다 높은 점수를 받는 일이 생긴다.
//
//   다산네트웍스  규칙 점수  물류 10점(1등) · 통신장비 3점
//                 실제 매출  네트워크 30.7% · 물류 3.8%
//
// 시장은 이 회사를 통신장비주로 본다. 물류는 사실이지만 정체가 아니다.
//
// ── 어떻게 ─────────────────────────────────────────────────
// 근거가 있을 때만 뗀다. 세 가지가 모두 맞아야 한다.
//
//   1. 그 테마가 매출 표의 어느 부문 이름과 맞아떨어진다
//   2. 그 부문의 매출 비중이 문턱(10%)보다 작다
//   3. 그 테마와 맞는 부문 중 문턱을 넘는 것이 하나도 없다
//
// 셋째 조건이 있어야 안전하다. "자동차 부품" 이 5% 짜리 부문과 30% 짜리 부문에
// 모두 걸리면 그 회사는 진짜 자동차부품사다.
//
// 표를 못 읽은 회사(킵스파마처럼 "제품매출/상품매출" 로만 나눈 곳)는 근거가
// 없으므로 손대지 않는다. 사람이 정한 배정도 건드리지 않는다.
//
// 실행 (apply-manual 뒤, build-data 앞)
//   node scripts/theme/apply-sales.mjs
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "./dict.mjs";
import { wordIn } from "./classify.mjs";

const DIR = ".cache/theme";
const CLS = path.join(DIR, "classified.json");
const SALES = path.join(DIR, "sales.json");

/** 이 아래로 떨어지는 부문은 곁가지로 본다 */
export const 문턱 = 0.10;

if (!fs.existsSync(SALES)) {
  console.error("sales.json 이 없다 — collect-sales.mjs 를 먼저 돌릴 것.");
  process.exit(1);
}
const cls = JSON.parse(fs.readFileSync(CLS, "utf8"));
const sales = JSON.parse(fs.readFileSync(SALES, "utf8"));
const REV = path.join(DIR, "revenue.json");
const rev = fs.existsSync(REV) ? JSON.parse(fs.readFileSync(REV, "utf8")) : {};
if (!Object.keys(rev).length) {
  console.error("revenue.json 이 없다 — collect-revenue.mjs 를 먼저 돌릴 것.");
  console.error("표를 잘못 읽었는지 가릴 잣대가 없으면 멀쩡한 테마가 떨어진다.");
  process.exit(1);
}
const byId = Object.fromEntries(THEMES.map((t) => [t.id, t]));

const 정규 = (s) => s.replace(/이차전지/g, "2차전지").replace(/[ㆍ·]/g, "").replace(/\s+/g, " ").trim();

/** 부문 이름이 이 테마를 가리키나 */
function 맞나(label, t) {
  const d = 정규(label);
  for (const w of [...(t.core ?? []), ...(t.also ?? [])]) if (wordIn(d, w, true)) return true;
  // 테마 이름의 알맹이 낱말이 통째로 들어 있으면 맞다 ("자동차 부품" ← "자동차 부품")
  const parts = t.name.replace(/[()]/g, " ").split(/[·\s]+/).filter((x) => x.length >= 2);
  if (parts.length && parts.every((x) => d.includes(정규(x)))) return true;
  return false;
}

/**
 * 부문 값을 실제 매출로 나눠 비중을 다시 낸다.
 *
 * 표에서 더한 합을 분모로 쓰면 안 된다. 한 보고서에 매출 표가 여럿 있으면
 * 3년치나 소표가 겹쳐 들어가 모든 비중이 눌린다 — 재어 보니 453종목에서
 * 분모가 꼭 3.16배(= 3년) 부풀어 있었다. 그래서 한화솔루션의 큐셀(태양광)이
 * 5.9% 로 읽혀 떨어질 뻔했다.
 *
 * 표에는 "(단위 : 백만원)" 이 적혀 있고 재무제표에는 실제 매출액이 있다.
 * 부문값 × 단위 ÷ 실매출 이 참값이다.
 */
function 비중내기(rec, 실매출) {
  if (!rec?.rows?.length || !rec.단위 || !실매출) return null;
  const rows = rec.rows.map((r) => ({ ...r, 비중: (r.v * rec.단위) / 실매출 }));
  // 한 부문이 매출의 90% 를 넘을 수는 없다. 그런 줄은 부문이 아니라 합계다.
  //
  //   서울반도체    "연결제거 후 순" 100.0% · "연결제거" 92.7%
  //   심텍홀딩스    "사업 제품 등 PCB제조 판매 및 임가공" 203.0%
  //
  // 이런 표에서는 진짜 부문이 자잘하게만 잡혀, 멀쩡한 테마가 곁가지로 몰린다.
  // 서울반도체의 LED 가 1.0% 로 읽혀 떨어질 뻔했다.
  if (rows.some((r) => r.비중 >= 0.9)) return null;

  const 합 = rows.reduce((a, r) => a + r.비중, 0);
  // 합이 조금 넘치는 것은 표가 둘(제품별·지역별)이라 같은 매출이 겹친 것이다.
  // 그때는 비중이 부풀고, 부풀면 덜 떼게 되니 틀리는 방향이 안전하다.
  // 크게 넘치거나 모자라면 표를 잘못 읽은 것이다.
  if (합 < 0.75 || 합 > 1.5) return null;
  return rows;
}

/** 이름 칸에 표 머리글이 새어 든 줄은 값이 어긋나 있다 */
const 머리글샘 = /금액|비율|원가율|수량|단가|구분|매출액/;

let 뗌 = 0;
let 못믿음 = 0;
let 못알아봄 = 0;
const 자취 = [];

// 이 종목에 붙은 테마를 모아 둔다 — 아래에서 "그 회사를 알아봤나" 를 보는 데 쓴다
const 종목테마 = new Map();
for (const [id, list] of Object.entries(cls)) {
  if (!byId[id]) continue;
  for (const s of list) {
    if (!종목테마.has(s.code)) 종목테마.set(s.code, []);
    종목테마.get(s.code).push({ id, manual: !!s.manual });
  }
}

/**
 * 그 회사의 주력을 우리가 알아봤나.
 *
 * 붙어 있는 테마 중 하나라도 큰 부문(25% 이상)과 맞아떨어져야 한다. 그래야
 * "주력은 저것이고 이것은 곁가지" 라고 말할 수 있다.
 *
 * 이 빗장이 없으면 넓은 업종 테마가 억울하게 떨어진다. 명문제약의 매출 표는
 * "순환기·소화기" 같은 약효군으로 나뉘어 있어 "제약" 이라는 말은 자잘한 줄에만
 * 걸린다. 큰 줄도 다 제약인데 우리 낱말이 그것을 못 알아볼 뿐이다.
 *
 *   다산네트웍스  통신장비가 "네트워크" 30.7% 와 맞는다 → 알아봤다 → 물류를 뗀다
 *   명문제약      어느 테마도 큰 부문과 안 맞는다 → 못 알아봤다 → 손대지 않는다
 */
/**
 * 알아보는 쪽은 느슨하게 본다.
 *
 * 뗄지 말지를 가릴 때는 엄격해야 하지만, "이 회사를 알아봤나" 를 볼 때까지
 * 엄격하면 멀쩡한 짝을 놓친다. 부문 이름은 사전 낱말보다 짧게 적히기 때문이다.
 *
 *   부문 "네트워크"  ↔  사전 "네트워크 장비"    같은 것을 가리킨다
 *   부문 "케미칼"    ↔  사전 "석유화학"        이건 아니다 — 글자가 안 겹친다
 *
 * 그래서 사전 낱말이 부문 이름을 품고 있으면 맞는 것으로 본다.
 */
function 알아보기(label, t) {
  if (맞나(label, t)) return true;
  const d = 정규(label);
  if (d.length < 3) return false;
  return [...(t.core ?? []), ...(t.also ?? []), t.name].some((w) => 정규(w).includes(d));
}

function 알아봤나(code, 잰것) {
  for (const { id } of 종목테마.get(code) ?? []) {
    const t = byId[id];
    if (!t) continue;
    const 합 = 잰것.filter((r) => 알아보기(r.label, t)).reduce((a, r) => a + r.비중, 0);
    if (합 >= 0.25) return true;
  }
  return false;
}

for (const [id, list] of Object.entries(cls)) {
  const t = byId[id];
  if (!t) continue;
  cls[id] = list.filter((s) => {
    const rec = sales[s.code];
    if (!rec || s.manual) return true; // 근거 없음 · 사람이 정한 것은 그대로
    const 잰것 = 비중내기(rec, rev[s.code]);
    if (!잰것 || 잰것.some((r) => 머리글샘.test(r.label))) { 못믿음++; return true; }
    if (!알아봤나(s.code, 잰것)) { 못알아봄++; return true; }
    const 맞는것 = 잰것.filter((r) => 맞나(r.label, t));
    if (!맞는것.length) return true; // 어느 부문과도 안 맞으면 판단 근거가 없다
    // 한 사업이 여러 줄로 나뉘어 적히는 일이 흔하다(내수·수출, 제품·용역).
    // 낱낱이 보지 말고 합쳐서 본다.
    const 합 = 맞는것.reduce((a, r) => a + r.비중, 0);
    if (합 >= 문턱) return true;
    자취.push({
      code: s.code,
      name: s.name,
      theme: t.name,
      합: Number((합 * 100).toFixed(1)),
      부문: 맞는것.map((r) => `${r.label} ${(r.비중 * 100).toFixed(1)}%`),
    });
    뗌++;
    return false;
  });
}

fs.writeFileSync(CLS, JSON.stringify(cls, null, 1));
fs.writeFileSync(path.join(DIR, "sales-dropped.json"), JSON.stringify(자취, null, 1));

const 표있는것 = Object.values(sales).filter(Boolean).length;
console.log(`매출 표를 읽은 종목 ${표있는것} / ${Object.keys(sales).length}`);
console.log(`표를 못 믿어 그냥 둔 편입 ${못믿음}건`);
console.log(`주력을 못 알아봐 그냥 둔 편입 ${못알아봄}건`);
console.log(`곁가지로 떼어 낸 편입 ${뗌}건 → .cache/theme/sales-dropped.json`);
for (const d of 자취.slice(0, 8)) {
  console.log(`  ${d.name.padEnd(14)}${d.theme.padEnd(16)}합 ${String(d.합).padStart(4)}%  ${d.부문.join(" · ")}`);
}
