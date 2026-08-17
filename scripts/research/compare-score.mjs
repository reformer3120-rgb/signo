// 종합평가 점수를 매매 기준으로 쓸 수 있는가 — 원본 가중치 vs 재배합, 나란히.
//
// "종합평가 점수가 있는데 그건 기준이 될 수 없나" 에 답하려면, 같은 표본에서
// 같은 방식으로 나란히 재야 한다. 다른 표본·다른 방법으로 잰 숫자를 견주면
// 무엇 때문에 차이가 났는지 알 수 없다.
//
// 항목은 넷 다 같다 — 재무건전성 · 밸류 · 성장 · 시가총액 · 모멘텀.
// 가중치만 다르다. 그래서 차이가 나면 그건 순전히 '배합' 탓이다.
//
// 실행
//   EDGAR_UA="이름 메일주소" node scripts/research/compare-score.mjs
import {
  loadStocks, rebalanceDates, makeWeightedSignal, runStrategy, stats,
  alphaBeta, sp500, pad, padL, pc,
} from "./engine.mjs";

const YEARS = 10;
const COST_PER_SIDE = 0.0005;
const MIN_NAMES = 50;
const FRAC = 0.2;

/**
 * 재 볼 배합들.
 * 종합평가 원본은 기관 12 · 배당 3 을 빼고 남은 85 를 100 으로 다시 나눈 것이다
 * (둘 다 과거 시계열이 없어 검증에 넣을 수 없다).
 */
const MIXES = {
  "종합평가 원본 배합": { 재무: 0.28, 밸류: 0.22, 성장: 0.15, 시총: 0.1, 모멘텀: 0.1 },
  "재무만": { 재무: 1 },
  "밸류만": { 밸류: 1 },
  "성장만": { 성장: 1 },
  "시가총액만": { 시총: 1 },
  "모멘텀만": { 모멘텀: 1 },
  "재배합 (모멘텀+성장+밸류)": { 밸류: 1, 성장: 1, 모멘텀: 1 },
  "재배합 + 재무 소폭": { 밸류: 1, 성장: 1, 모멘텀: 1, 재무: 0.3 },
  "종합평가에서 재무·시총만 뺌": { 밸류: 0.22, 성장: 0.15, 모멘텀: 0.1 },
};

console.log("S&P 500 명단 조회…");
const tickers = Object.keys(await sp500());

console.log("자료 수집 중…");
const { stock } = await loadStocks(tickers, YEARS, (n, t) => {
  if (n % 100 === 0) process.stdout.write(`  ${n}/${t}\r`);
});
const syms = Object.keys(stock);
console.log(`  ${syms.length}종목 확보          `);
if (syms.length < 100) {
  console.log("  종목이 너무 적다. 야후 응답이 비었을 수 있으니 잠시 뒤 다시 실행할 것.");
  process.exit(1);
}

const rebal = rebalanceDates(stock, YEARS);
const noFund = { rate: Object.fromEntries(syms.map((s) => [s, 0])), avg: 0 };

// 기준선 — 같은 표본 균등보유
const ewSignal = makeWeightedSignal(stock, MIN_NAMES, { 모멘텀: 1 });
const ew = runStrategy({
  stock, rebal, signalAt: ewSignal, fund: noFund, mode: "ew",
  frac: FRAC, costs: true, costPerSide: COST_PER_SIDE, minNames: MIN_NAMES,
});
const sEw = stats(ew);
console.log(`\n기준선 (${syms.length}종목 균등보유) — 연 ${pc(sEw.cagr)} · 변동성 ${pc(sEw.vol)} · 샤프 ${sEw.sharpe.toFixed(2)}`);
console.log(`리밸런스 ${ew.length}회 · 상위 ${FRAC * 100}% 롱 · 비용 왕복 0.1%\n`);

console.log("■ 배합별 — 상위 20% 롱 (같은 표본·같은 방법)");
console.log(
  "  " + pad("배합", 28) + padL("연수익", 10) + padL("샤프", 7) + padL("베타", 7) +
    padL("연 알파", 10) + padL("t", 7) + "  판정",
);

const results = [];
for (const [name, weights] of Object.entries(MIXES)) {
  const signalAt = makeWeightedSignal(stock, MIN_NAMES, weights);
  const r = runStrategy({
    stock, rebal, signalAt, fund: noFund, mode: "long",
    frac: FRAC, costs: true, costPerSide: COST_PER_SIDE, minNames: MIN_NAMES,
  });
  const s = stats(r);
  if (!s) { console.log("  " + pad(name, 28) + "표본 부족"); continue; }
  const ab = alphaBeta(r, ew);
  results.push({ name, s, ab });
  console.log(
    "  " + pad(name, 28) + padL(pc(s.cagr), 10) + padL(s.sharpe.toFixed(2), 7) +
      padL(ab.beta.toFixed(2), 7) + padL(pc(ab.alpha * 12), 10) + padL(ab.t.toFixed(2), 7) +
      "  " + (Math.abs(ab.t) >= 2 ? (ab.t > 0 ? "★ 알파 있음" : "★ 알파 마이너스") : "우연과 구분 안 됨"),
  );
}
console.log("  " + pad("기준선 (균등보유)", 28) + padL(pc(sEw.cagr), 10) + padL(sEw.sharpe.toFixed(2), 7) + padL("1.00", 7));

// 하위 20% 도 본다 — 점수가 낮은 쪽이 정말 나쁜가
// 점수가 낮은 쪽도 봐야 한다.
// 상위에 알파가 있어도 하위에도 알파가 있으면, 그건 '순위' 가 통한 게 아니라
// 양 끝이 다 좋았다는 뜻이다 (앞서 종합평가에서 봤던 U자 모양).
// 쓸 만한 점수라면 상위 알파는 양수, 하위 알파는 음수여야 한다.
console.log("\n■ 점수가 낮은 쪽은 정말 나쁜가 (하위 20% 롱)");
console.log("  상위에만 알파가 있어야 '순위' 가 통하는 것이다. 양쪽 다 있으면 순위와 무관하다.");
console.log(
  "  " + pad("배합", 28) + padL("상위 수익", 11) + padL("하위 수익", 11) +
    padL("상위 알파", 11) + padL("하위 알파", 11) + "  판정",
);
for (const [name, weights] of Object.entries(MIXES)) {
  const opts = { stock, rebal, fund: noFund, frac: FRAC, costs: true, costPerSide: COST_PER_SIDE, minNames: MIN_NAMES };
  const hiR = runStrategy({ ...opts, signalAt: makeWeightedSignal(stock, MIN_NAMES, weights), mode: "long" });
  // 점수 부호를 뒤집으면 하위 20% 가 상위가 된다
  const flip = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, -v]));
  const loR = runStrategy({ ...opts, signalAt: makeWeightedSignal(stock, MIN_NAMES, flip), mode: "long" });
  const hi = stats(hiR);
  const lo = stats(loR);
  if (!hi || !lo) continue;
  const hiA = alphaBeta(hiR, ew);
  const loA = alphaBeta(loR, ew);
  const works = hiA.t >= 2 && loA.alpha < hiA.alpha;
  console.log(
    "  " + pad(name, 28) + padL(pc(hi.cagr), 11) + padL(pc(lo.cagr), 11) +
      padL(pc(hiA.alpha * 12), 11) + padL(pc(loA.alpha * 12), 11) +
      "  " + (works ? "★ 순위가 통한다" : hiA.t >= 2 ? "상위만 좋다 (양 끝 다 좋음)" : "—"),
  );
}

console.log("\n■ 정리");
const best = results.filter((r) => r.ab.t >= 2).sort((a, b) => b.ab.alpha - a.ab.alpha);
const orig = results.find((r) => r.name === "종합평가 원본 배합");
if (orig) {
  console.log(`  종합평가 원본 배합 — 연 알파 ${pc(orig.ab.alpha * 12)} (t=${orig.ab.t.toFixed(2)})`);
  console.log(`    ${Math.abs(orig.ab.t) >= 2 ? "매매 기준으로 쓸 근거가 있다." : "기준으로 쓸 근거가 없다. 우연과 구분되지 않는다."}`);
}
if (best.length) {
  console.log(`  알파가 확인된 배합 ${best.length}개 — 가장 높은 것: ${best[0].name} ${pc(best[0].ab.alpha * 12)} (t=${best[0].ab.t.toFixed(2)})`);
}
console.log("\n  항목은 넷 다 같고 가중치만 다르다. 차이가 났다면 그건 재료가 아니라 배합 탓이다.");
console.log("  기관 보유비중 12점과 배당 3점은 과거 시계열이 없어 이번 비교에서 빠졌다.");
