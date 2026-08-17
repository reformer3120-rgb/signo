// 배율을 얼마까지 감당할 수 있나 — 분할매수 기준.
//
// 2~5배를 쓰고 싶다는 요구에 대해, 실제로 어떤 일이 벌어지는지 잰다.
// 끝값에 배수를 곱하면 안 된다. 적립 도중 바닥에서 이미 청산되기 때문이다.
// 하루씩 따라가며 증거금이 바닥나는 순간을 잡는다.
//
// 실행
//   EDGAR_UA="이름 메일주소" node scripts/research/leverage.mjs
import { loadStocks, binanceEquityPerps, loadFunding, pad, padL, pc, mean } from "./engine.mjs";

const BOT_DATA = process.env.BOT_DATA ?? "C:/binance-bot/data";
const BOT10 = ["TSLA", "AAPL", "GOOGL", "NVDA", "SNDK", "MSTR", "COIN", "AMZN", "META", "MSFT"];
/** 유지증거금 — 바이낸스는 명목의 0.5~5%. 넉넉잡아 1% 로 본다 */
const MAINT = 0.01;

/**
 * 매일 증거금 1을 넣고 명목 L 만큼 사는 분할매수.
 * 자본이 유지증거금 아래로 내려가면 청산 — 그때까지 넣은 돈을 다 잃는다.
 */
function sim(prices, H, L, fundingDaily) {
  const out = [];
  for (let s = 0; s + H <= prices.length; s++) {
    let equity = 0;
    let units = 0;
    let invested = 0;
    let worstRatio = 1;
    let dead = false;
    for (let j = s; j < s + H; j++) {
      if (j > s) equity += units * (prices[j] - prices[j - 1]);
      equity -= units * prices[j] * fundingDaily;
      equity += 1;
      invested += 1;
      const notional = units * prices[j];
      if (equity <= notional * MAINT) { dead = true; break; } // 유지증거금 미달 → 청산
      worstRatio = Math.min(worstRatio, equity / invested);
      units += L / prices[j];
    }
    out.push({ ret: dead ? -1 : equity / invested - 1, dead, worst: dead ? -1 : worstRatio - 1 });
  }
  return out;
}

function equalWeightIndex(stocks) {
  const seen = new Set();
  for (const s of Object.values(stocks)) for (const p of s.px) seen.add(p.d);
  const dates = [...seen].sort();
  const level = [];
  let lv = 100;
  for (let i = 1; i < dates.length; i++) {
    const rs = [];
    for (const s of Object.values(stocks)) {
      const a = s.idx[dates[i - 1]];
      const b = s.idx[dates[i]];
      if (a != null && b != null) rs.push(s.px[b].c / s.px[a].c - 1);
    }
    if (rs.length < 5) continue;
    lv *= 1 + mean(rs);
    level.push(lv);
  }
  return level;
}

console.log("자료 준비…");
const sp500 = await fetch(
  "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
)
  .then((r) => r.text())
  .then((t) => t.trim().split("\n").slice(1).map((l) => l.split(",")[0].trim().replace(/\./g, "-")))
  .then((a) => a.filter((t) => /^[A-Z-]{1,6}$/.test(t)));
const perps = (await binanceEquityPerps()).map((p) => p.ticker);

const { stock: sp } = await loadStocks(sp500, 20, (n, t) => { if (n % 150 === 0) process.stdout.write(`  S&P ${n}/${t}\r`); });
const { stock: px } = await loadStocks(perps, 20, (n, t) => { if (n % 50 === 0) process.stdout.write(`  선물 ${n}/${t}\r`); });
const bot = Object.fromEntries(Object.entries(px).filter(([k]) => BOT10.includes(k)));
const fund = loadFunding(Object.keys(px), BOT_DATA);
const fd = fund.avg / 365;
console.log(`  S&P ${Object.keys(sp).length} · 선물대상 ${Object.keys(px).length} · 봇 ${Object.keys(bot).length}종목 · 펀딩 연 ${pc(fund.avg)}          `);

const IDX = {
  "S&P500 490종목": { px: equalWeightIndex(sp), f: 0 },
  "주식선물 대상 전체": { px: equalWeightIndex(px), f: fd },
  "봇 10종목": { px: equalWeightIndex(bot), f: fd },
  "NVDA 한 종목": { px: px.NVDA?.px.map((p) => p.c) ?? [], f: (fund.rate.NVDA ?? fund.avg) / 365 },
};

const HEAD = "  " + pad("배율", 8) + padL("청산비율", 10) + padL("승산", 8) + padL("중앙값", 10) + padL("하위10%", 10) + padL("최악", 10);

for (const [H, label] of [[252, "1년 적립"], [504, "2년 적립"]]) {
  console.log(`\n\n■ ${label} · 유지증거금 명목의 ${(MAINT * 100).toFixed(0)}% 가정`);
  for (const [name, { px: p, f }] of Object.entries(IDX)) {
    if (p.length < H + 50) { console.log(`\n  ${name} — 자료 부족`); continue; }
    console.log(`\n  ${name}`);
    console.log(HEAD);
    for (const L of [1, 2, 3, 5]) {
      const r = sim(p, H, L, f);
      const dead = r.filter((x) => x.dead).length / r.length;
      const rets = [...r.map((x) => x.ret)].sort((a, b) => a - b);
      const q = (t) => rets[Math.floor((rets.length - 1) * t)];
      console.log(
        "  " + pad(`${L}배`, 8) + padL((dead * 100).toFixed(1) + "%", 10) +
          padL((r.filter((x) => x.ret > 0).length / r.length * 100).toFixed(1) + "%", 8) +
          padL(pc(q(0.5)), 10) + padL(pc(q(0.1)), 10) + padL(pc(rets[0]), 10) +
          (dead > 0.01 ? "  ★" : ""),
      );
    }
  }
}

// 5배가 견디려면 얼마나 안 빠져야 하나
console.log("\n\n■ 배율별로 '얼마나 빠지면 청산인가'");
console.log("  분할매수는 매일 증거금이 들어와 단순 계산보다 잘 버틴다. 그래도 한계는 있다.");
console.log("  " + pad("배율", 8) + padL("이론상 한계", 14) + "  실제 의미");
for (const L of [2, 3, 5]) {
  const limit = (1 - MAINT * L) / L;
  console.log(
    "  " + pad(`${L}배`, 8) + padL(`-${(limit * 100).toFixed(0)}%`, 14) +
      `  보유분이 ${(limit * 100).toFixed(0)}% 빠지면 그 시점 증거금이 사라진다`,
  );
}
console.log("\n  참고 — 실제로 있었던 낙폭");
console.log("    2020년 3월  S&P500 균등 약 -35% (한 달)");
console.log("    2022년      약 -25% (연중)");
console.log("    2008~2009   약 -55%");
console.log("  5배는 -18% 에서 위험해진다. 위 셋 모두 그 선을 넘었다.");
