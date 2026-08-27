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
 * 이 종목의 표를 믿어도 되나.
 *
 * 파서가 늘 깨끗하게 읽지는 못한다. 표 머리글이 이름 칸으로 새어 들거나
 * ("금액 금액 금액 제품 분리막 내 수"), 한 사업이 여러 소표로 쪼개져
 * 저마다 몇 %씩만 잡히기도 한다. 그런 값으로 테마를 떼면 멀쩡한 것이 날아간다.
 *
 *   더블유씨피  분리막 전문사인데 4.9% 로 읽혀 2차전지 부재료가 떨어졌다
 *   오르비텍    원자력이 실제 46% 인데 6.8% + 2.2% 로 쪼개져 떨어졌다
 *
 * 그래서 다음 중 하나라도 걸리면 그 종목은 손대지 않는다.
 */
const 머리글샘 = /금액|비율|원가율|수량|단가|구\s*분|매출액|내\s*수|수\s*출/;

/**
 * 표에서 더한 합이 재무제표의 매출액과 맞나.
 *
 * 이것이 가장 확실한 잣대다. 표를 잘못 읽으면 엉뚱한 줄이 분모에 섞여 합이
 * 실제 매출과 크게 어긋난다. 눈으로만 고르던 앞의 잣대들은 절반쯤 놓쳤다.
 *
 * 표는 백만원·천원·억원 중 하나로 적히고 재무제표는 원 단위다. 어느 쪽인지는
 * 굳이 읽지 않는다 — 실매출 ÷ 표합 이 그 셋 중 하나에 가까우면 맞는 것이다.
 */
const 단위후보 = [1, 1e3, 1e6, 1e8];
function 단위맞나(표합, 실매출) {
  if (!표합 || !실매출) return false;
  const 배 = 실매출 / 표합;
  return 단위후보.some((u) => 배 >= u * 0.75 && 배 <= u * 1.25);
}

function 믿을만한가(rows, 실매출) {
  if (rows.length > 10) return false;                    // 지나치게 쪼개졌다
  if (rows.some((r) => 머리글샘.test(r.label))) return false; // 머리글이 샜다
  if (rows[0].비중 < 0.2) return false;                   // 으뜸 부문이 없다
  // 표의 분모를 되살린다. 비중 = v / 분모 이므로 분모 = v / 비중.
  const 분모 = rows[0].비중 ? rows[0].v / rows[0].비중 : 0;
  return 단위맞나(분모, 실매출);
}

let 뗌 = 0;
let 못믿음 = 0;
let 살핀종목 = 0;
const 자취 = [];
const 이름 = {};
for (const [id, list] of Object.entries(cls)) {
  const t = byId[id];
  if (!t) continue;
  for (const s of list) 이름[s.code] = s.name;
}

for (const [id, list] of Object.entries(cls)) {
  const t = byId[id];
  if (!t) continue;
  cls[id] = list.filter((s) => {
    const rows = sales[s.code];
    if (!rows || s.manual) return true; // 근거 없음 · 사람이 정한 것은 그대로
    if (!믿을만한가(rows, rev[s.code])) { 못믿음++; return true; }
    const 맞는것 = rows.filter((r) => 맞나(r.label, t));
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
for (const code of new Set(Object.values(cls).flatMap((l) => l.map((s) => s.code)))) 살핀종목++;

fs.writeFileSync(CLS, JSON.stringify(cls, null, 1));
fs.writeFileSync(path.join(DIR, "sales-dropped.json"), JSON.stringify(자취, null, 1));

const 표있는것 = Object.values(sales).filter(Boolean).length;
console.log(`매출 표를 읽은 종목 ${표있는것} / ${Object.keys(sales).length}`);
console.log(`표를 못 믿어 그냥 둔 편입 ${못믿음}건`);
console.log(`곁가지로 떼어 낸 편입 ${뗌}건 → .cache/theme/sales-dropped.json`);
for (const d of 자취.slice(0, 8)) {
  console.log(`  ${d.name.padEnd(14)}${d.theme.padEnd(16)}합 ${String(d.합).padStart(4)}%  ${d.부문.join(" · ")}`);
}
