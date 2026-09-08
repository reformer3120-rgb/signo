// ECOS 인증키가 제대로 되는지 본다.
//
// 키를 .env.local 의 ECOS_API_KEY= 뒤에 붙여 넣고 이것을 돌리면 된다.
// 키 값은 화면에 찍지 않는다.
//
//   node scripts/check-ecos.mjs
import fs from "node:fs";

const 키 = (fs.readFileSync(".env.local", "utf8").match(/^ECOS_API_KEY=(.*)$/m) ?? [])[1]?.trim();
if (!키) {
  console.log("ECOS_API_KEY 가 비어 있다.");
  console.log("  .env.local 을 열어 ECOS_API_KEY= 뒤에 인증키를 붙여 넣을 것.");
  process.exit(1);
}
console.log(`키를 찾았다 (길이 ${키.length}자).`);

// 분기 명목 GDP — 버핏지수의 분모
const url =
  `https://ecos.bok.or.kr/api/StatisticSearch/${키}/json/kr/1/8` +
  `/200Y105/Q/2024Q3/2026Q4/1400/`;

const r = await fetch(url);
const j = await r.json();

if (j.RESULT) {
  console.log(`\n거절당했다 — ${j.RESULT.CODE}`);
  console.log(`  ${j.RESULT.MESSAGE}`);
  console.log("\n흔한 원인");
  console.log("  ERROR-100  인증키가 없거나 틀렸다");
  console.log("  ERROR-200  인증키가 아직 승인 전이다");
  console.log("  ERROR-300  하루 호출 한도를 넘었다");
  process.exit(1);
}

const rows = (j.StatisticSearch?.row ?? []).filter((x) => /Q\d$/.test(x.TIME));
if (!rows.length) {
  console.log("\n응답은 왔는데 자료가 비었다:", JSON.stringify(j).slice(0, 200));
  process.exit(1);
}

console.log("\n분기 명목 GDP (십억원 → 조원)");
for (const x of rows) console.log(`   ${x.TIME}  ${(Number(x.DATA_VALUE) / 1000).toFixed(1)}조`);

const 최근4 = rows.slice(-4);
const TTM = 최근4.reduce((a, x) => a + Number(x.DATA_VALUE), 0) / 1000;
console.log(`\n최근 4분기 합  ${TTM.toFixed(0)}조  (${최근4[0].TIME}~${최근4[최근4.length - 1].TIME})`);
console.log("\n잘 된다. 이제 화면에 버핏지수가 뜬다.");
