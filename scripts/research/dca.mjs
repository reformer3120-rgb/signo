// 매일 일정금액 롱 — 분할매수(DCA)의 승산.
//
// 물음
//   매일 같은 금액씩 사 모으면 얼마 뒤에 이익일 확률이 얼마인가.
//
// 재는 방법
//   시작일을 하루씩 옮겨 가며 전부 돌린다. "2020년에 시작했으면" 같은
//   한 번의 운이 아니라, 가능한 모든 시작일의 분포를 본다. 어느 날
//   시작해도 되는 전략인지가 진짜 물음이기 때문이다.
//
//   수익률은 '넣은 돈 대비'로 잰다. 매일 넣으므로 마지막에 넣은 돈은
//   하루밖에 안 굴렀다. 단순히 첫날~마지막날 주가 상승률로 재면 틀린다.
//
// 무기한선물이면 펀딩비가 붙는다. 롱은 매일 낸다. 쌓인 물량 전체에
// 붙으므로 뒤로 갈수록 커진다 — 그것까지 날짜별로 반영한다.
//
// 실행
//   EDGAR_UA="이름 메일주소" node scripts/research/dca.mjs
import { loadStocks, binanceEquityPerps, loadFunding, pad, padL, pc, mean } from "./engine.mjs";

const YEARS = 10;
const BOT_DATA = process.env.BOT_DATA ?? "C:/binance-bot/data";
const HORIZONS = [
  [126, "6개월"],
  [252, "1년"],
  [504, "2년"],
  [756, "3년"],
];

const BOT10 = ["TSLA", "AAPL", "GOOGL", "NVDA", "SNDK", "MSTR", "COIN", "AMZN", "META", "MSFT"];

const quantile = (sorted, q) => {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/**
 * 모든 시작일에 대해 분할매수 결과를 낸다.
 *
 * 시작일마다 처음부터 세면 O(날짜×기간) 이라 느리다. 누적합을 미리 만들어
 * 시작일당 상수 시간에 끝낸다.
 *   보유수량 = Σ(1/가격)  → 누적합 하나로 구간합
 *   펀딩     = Σ(그날 평가액 × 요율), 평가액 = 그때까지 수량 × 그날 가격
 *
 * @param prices 일별 종가
 * @param H      적립 기간(거래일)
 * @param fundingDaily 일 펀딩 요율 (0 이면 주식)
 */
function dcaAll(prices, H, fundingDaily = 0) {
  const n = prices.length;
  if (n < H + 2) return [];
  // 누적합
  const cInv = new Float64Array(n + 1); // Σ 1/p
  const cP = new Float64Array(n + 1); // Σ p
  const cIP = new Float64Array(n + 1); // Σ (누적 1/p) × p
  for (let i = 0; i < n; i++) {
    cInv[i + 1] = cInv[i] + 1 / prices[i];
    cP[i + 1] = cP[i] + prices[i];
    cIP[i + 1] = cIP[i] + cInv[i + 1] * prices[i];
  }
  const out = [];
  for (let s = 0; s + H <= n; s++) {
    const e = s + H; // [s, e) 동안 매일 1원씩
    const shares = cInv[e] - cInv[s];
    const invested = H;
    const value = shares * prices[e - 1];
    // 펀딩 — 날마다 (그때까지 쌓인 수량 × 그날 가격) 에 붙는다
    let fund = 0;
    if (fundingDaily) {
      const sumIP = cIP[e] - cIP[s];
      const sumP = cP[e] - cP[s];
      fund = fundingDaily * (sumIP - cInv[s] * sumP);
    }
    out.push((value - fund) / invested - 1);
  }
  return out;
}

/** 일시불 — 첫날 전액. 비교용 */
function lumpAll(prices, H) {
  const out = [];
  for (let s = 0; s + H <= prices.length; s++) out.push(prices[s + H - 1] / prices[s] - 1);
  return out;
}

function summarize(rets) {
  if (rets.length < 30) return null;
  const s = [...rets].sort((a, b) => a - b);
  return {
    n: rets.length,
    win: rets.filter((x) => x > 0).length / rets.length,
    med: quantile(s, 0.5),
    p10: quantile(s, 0.1),
    p90: quantile(s, 0.9),
    worst: s[0],
    best: s[s.length - 1],
    avg: mean(rets),
  };
}

const HEAD =
  "  " + pad("기간", 8) + padL("승산", 8) + padL("중앙값", 10) + padL("평균", 10) +
  padL("하위10%", 10) + padL("상위10%", 10) + padL("최악", 10) + padL("표본", 7);

function row(label, s) {
  if (!s) { console.log("  " + pad(label, 8) + "표본 부족"); return; }
  console.log(
    "  " + pad(label, 8) + padL((s.win * 100).toFixed(1) + "%", 8) + padL(pc(s.med), 10) +
      padL(pc(s.avg), 10) + padL(pc(s.p10), 10) + padL(pc(s.p90), 10) +
      padL(pc(s.worst), 10) + padL(s.n, 7),
  );
}

/** 종목들을 매일 균등비중으로 묶은 지수 */
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

// ── 자료 ─────────────────────────────────────────────────────

console.log("자료 준비 중… (캐시가 있으면 빠르다)");
const sp500 = await fetch(
  "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
)
  .then((r) => r.text())
  .then((t) => t.trim().split("\n").slice(1).map((l) => l.split(",")[0].trim().replace(/\./g, "-")))
  .then((a) => a.filter((t) => /^[A-Z-]{1,6}$/.test(t)));

const perps = (await binanceEquityPerps()).map((p) => p.ticker);

const { stock: spStock } = await loadStocks(sp500, YEARS, (n, t) => {
  if (n % 100 === 0) process.stdout.write(`  S&P ${n}/${t}\r`);
});
const { stock: pxStock } = await loadStocks(perps, YEARS, (n, t) => {
  if (n % 40 === 0) process.stdout.write(`  선물대상 ${n}/${t}\r`);
});
const botStock = Object.fromEntries(Object.entries(pxStock).filter(([k]) => BOT10.includes(k)));

console.log(`  S&P500 ${Object.keys(spStock).length}종목 · 주식선물 대상 ${Object.keys(pxStock).length}종목 · 봇 ${Object.keys(botStock).length}종목`);

const fund = loadFunding(Object.keys(pxStock), BOT_DATA);
const avgDaily = fund.avg / 365;
console.log(`  펀딩 평균 연 ${pc(fund.avg)} (${fund.measured}종목 실측) → 일 ${(avgDaily * 100).toFixed(4)}%`);

// ── 1) 주식 계좌에서 (펀딩 없음) ────────────────────────────

console.log("\n\n■ 실제 주식 · 매일 일정금액 롱 — 어느 날 시작하든");
console.log("  대상: S&P500 490종목 균등 (지수 하나 사는 것과 같다)");
console.log(HEAD);
const spIdx = equalWeightIndex(spStock);
for (const [H, label] of HORIZONS) row(label, summarize(dcaAll(spIdx, H)));

console.log("\n  같은 기간을 첫날 전액(일시불)으로 넣었다면");
console.log(HEAD);
for (const [H, label] of HORIZONS) row(label, summarize(lumpAll(spIdx, H)));

// ── 2) 무기한선물이면 (펀딩 반영) ───────────────────────────

console.log("\n\n■ 바이낸스 주식 무기한선물 · 매일 일정금액 롱");
console.log(`  대상: 상장된 주식선물 ${Object.keys(pxStock).length}종목 균등 · 펀딩 연 ${pc(fund.avg)} 반영`);
console.log(HEAD);
const pxIdx = equalWeightIndex(pxStock);
for (const [H, label] of HORIZONS) row(label, summarize(dcaAll(pxIdx, H, avgDaily)));

console.log("\n  펀딩이 없었다면 (얼마나 갉아먹는지 보려고)");
console.log(HEAD);
for (const [H, label] of HORIZONS) row(label, summarize(dcaAll(pxIdx, H, 0)));

console.log(`\n  봇이 굴리는 10종목 균등 · 펀딩 반영`);
console.log(HEAD);
const botIdx = equalWeightIndex(botStock);
for (const [H, label] of HORIZONS) row(label, summarize(dcaAll(botIdx, H, avgDaily)));

// ── 3) 한 종목에만 몰면 ─────────────────────────────────────

console.log("\n\n■ 한 종목에만 매일 사면 (1년 적립, 펀딩 반영)");
console.log("  " + pad("종목", 8) + padL("승산", 8) + padL("중앙값", 10) + padL("하위10%", 10) + padL("최악", 10));
const oneYear = [];
for (const t of BOT10) {
  const s = pxStock[t];
  if (!s) continue;
  const r = summarize(dcaAll(s.px.map((p) => p.c), 252, (fund.rate[t] ?? fund.avg) / 365));
  if (!r) continue;
  oneYear.push([t, r]);
}
oneYear.sort((a, b) => b[1].win - a[1].win);
for (const [t, r] of oneYear) {
  console.log(
    "  " + pad(t, 8) + padL((r.win * 100).toFixed(1) + "%", 8) + padL(pc(r.med), 10) +
      padL(pc(r.p10), 10) + padL(pc(r.worst), 10),
  );
}
console.log(`  분산(10종목 균등) 대비 — 한 종목은 최악이 훨씬 깊다. 종목을 나누는 값이 여기 있다.`);

// ── 4) 레버리지 ─────────────────────────────────────────────

// ── 레버리지 — 경로를 따라가며 ─────────────────────────────
//
// 끝값에 배수만 곱하면 안 된다. 적립 도중 바닥에서 이미 청산되기 때문이다.
// 하루씩 따라가며 증거금이 0 이하로 내려가는 순간을 잡는다.
//
// 모형 — 매일 증거금 1을 넣고 그 돈으로 명목 L 만큼 산다.
//   자본_j = 자본_{j-1} + 1(새 증거금) + 보유수량×(가격변화) − 펀딩
//   자본이 0 이하가 되면 청산. 그 시점까지 넣은 돈을 전부 잃는다.
function dcaLeveraged(prices, H, L, fundingDaily) {
  const n = prices.length;
  const out = [];
  for (let s = 0; s + H <= n; s++) {
    let equity = 0;
    let units = 0;
    let invested = 0;
    let dead = false;
    for (let j = s; j < s + H; j++) {
      if (j > s) equity += units * (prices[j] - prices[j - 1]); // 어제 보유분의 평가손익
      equity -= units * prices[j] * fundingDaily; // 펀딩은 보유 명목에 붙는다
      equity += 1; // 오늘 증거금 납입
      invested += 1;
      if (equity <= 0) { dead = true; break; } // 청산
      units += L / prices[j]; // 오늘 매수 (명목 L)
    }
    out.push(dead ? { ret: -1, dead: true } : { ret: equity / invested - 1, dead: false });
  }
  return out;
}

console.log("\n\n■ 레버리지를 걸면 (주식선물 균등, 1년 적립) — 경로를 따라가며");
console.log("  매일 증거금 1을 넣고 명목 L 만큼 산다. 증거금이 바닥나면 청산이다.");
console.log("  " + pad("배수", 8) + padL("청산비율", 10) + padL("승산", 8) + padL("중앙값", 10) + padL("하위10%", 10) + padL("최악", 10));
{
  for (const L of [1, 1.5, 2, 3]) {
    const r = dcaLeveraged(pxIdx, 252, L, avgDaily);
    const dead = r.filter((x) => x.dead).length / r.length;
    const rets = r.map((x) => x.ret);
    const s = summarize(rets);
    console.log(
      "  " + pad(`${L}배`, 8) + padL((dead * 100).toFixed(1) + "%", 10) +
        padL((s.win * 100).toFixed(1) + "%", 8) + padL(pc(s.med), 10) +
        padL(pc(s.p10), 10) + padL(pc(s.worst), 10) +
        (dead > 0.05 ? "  ★ 위험" : ""),
    );
  }
  console.log("  ※ 유지증거금(보통 명목의 0.5~5%)을 감안하면 실제 청산은 이보다 이르다.");
}

console.log("\n■ 같은 계산을 봇 10종목으로 (더 몰려 있으니 더 위험하다)");
console.log("  " + pad("배수", 8) + padL("청산비율", 10) + padL("승산", 8) + padL("중앙값", 10) + padL("최악", 10));
for (const L of [1, 2, 3]) {
  const r = dcaLeveraged(botIdx, 252, L, avgDaily);
  const dead = r.filter((x) => x.dead).length / r.length;
  const s = summarize(r.map((x) => x.ret));
  console.log(
    "  " + pad(`${L}배`, 8) + padL((dead * 100).toFixed(1) + "%", 10) +
      padL((s.win * 100).toFixed(1) + "%", 8) + padL(pc(s.med), 10) + padL(pc(s.worst), 10) +
      (dead > 0.05 ? "  ★ 위험" : ""),
  );
}

// ── 나쁜 10년도 넣어 보기 ───────────────────────────────────
//
// 위 숫자는 전부 2016~2026 구간이다. 미국 주식이 크게 오른 시기라
// 승산이 부풀려져 있을 수밖에 없다. 2008년 금융위기가 들어가도록
// 20년으로 늘려 다시 잰다. 이게 진짜 시험이다.
console.log("\n\n■ 2008년이 들어가는 20년으로 다시 (S&P500 균등, 주식 계좌)");
{
  const { stock: long20 } = await loadStocks(sp500, 20, (n, t) => {
    if (n % 100 === 0) process.stdout.write(`  20년치 ${n}/${t}\r`);
  });
  const idx20 = equalWeightIndex(long20);
  console.log(`  ${Object.keys(long20).length}종목 · 일봉 ${idx20.length}개          `);
  console.log(HEAD);
  for (const [H, label] of HORIZONS) row(label, summarize(dcaAll(idx20, H)));

  console.log("\n  같은 20년, 일시불이었다면");
  console.log(HEAD);
  for (const [H, label] of HORIZONS) row(label, summarize(lumpAll(idx20, H)));

  // 최악의 구간이 언제였는지
  const r3 = dcaAll(idx20, 756);
  const worstAt = r3.indexOf(Math.min(...r3));
  console.log(`\n  3년 적립 최악 ${pc(Math.min(...r3))} — 전체 ${r3.length}개 시작일 중 ${worstAt}번째`);
  const lossPct = (x) => ((1 - x) * 100).toFixed(1) + "%";
  console.log(`  손실로 끝난 시작일 비율: 6개월 ${lossPct(summarize(dcaAll(idx20, 126)).win)} · 3년 ${lossPct(summarize(r3).win)}`);
}

console.log("\n■ 읽을 때");
console.log("  · '승산' 은 가능한 모든 시작일 중 이익으로 끝난 비율이다. 시작일 운을 뺀 값이다.");
console.log("  · 수익률은 넣은 돈 대비다. 마지막에 넣은 돈은 하루밖에 안 굴렀다.");
console.log("  · 최근 10년은 미국 주식이 크게 오른 구간이다. 다른 10년이면 숫자가 달라진다.");
console.log("  · 표본의 시작일들이 서로 겹쳐 있어 '표본 수' 만큼 독립적이지 않다.");
