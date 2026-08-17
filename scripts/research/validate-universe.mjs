// 생존 편향을 걷어낸 검증 — 바이낸스가 상장한 주식 무기한선물 전체.
//
// 앞선 검증(validate-basket.mjs)은 봇 설정에 적힌 10종목만 봤다. 그런데
// 그 10개는 TSLA·NVDA·MSTR 처럼 지난 10년 최대 승자들이다. 결과를 알고
// 고른 목록으로 전략을 재면 무엇을 해도 좋아 보인다.
//
// 바이낸스는 실제로 주식 무기한선물 130여 개를 상장해 두었다. INTC·PYPL·
// ZM·RIVN·GME 처럼 크게 잃은 종목도 들어 있다. 그 전체로 다시 잰다.
//
// 남는 편향 — 계약이 전부 2026년에 상장됐다. 바이낸스가 무엇을 상장할지
// 고를 때 이미 유명해진 종목을 골랐을 것이다. 그 부분은 걷어낼 방법이 없다.
// 다만 10개보다는 훨씬 낫다.
//
// 실행
//   EDGAR_UA="이름 메일주소" node scripts/research/validate-universe.mjs
import {
  binanceEquityPerps, loadFunding, loadStocks, rebalanceDates, makeSignal,
  runStrategy, stats, show, HEADER, pad, padL, pc, mean, sd,
} from "./engine.mjs";

const BOT_DATA = process.env.BOT_DATA ?? "C:/binance-bot/data";
const YEARS = 10;
const COST_PER_SIDE = 0.0004 + 0.0002; // 봇 설정: taker + 슬리피지
const MIN_NAMES = 20; // 횡단면이 이보다 얇으면 순위가 의미 없다
const FRAC = 0.2; // 상·하위 20%

/** 봇이 지금 실제로 굴리는 10종목 — 견주기 위해 */
const BOT10 = ["TSLA", "AAPL", "GOOGL", "NVDA", "SNDK", "MSTR", "COIN", "AMZN", "META", "MSFT"];

console.log("바이낸스 주식 무기한선물 목록 조회…");
const perps = await binanceEquityPerps();
console.log(`  EQUITY 무기한 ${perps.length}개`);
console.log(`  상장 시기: ${perps.map((p) => p.onboard).filter(Boolean).sort()[0]} ~ ${perps.map((p) => p.onboard).filter(Boolean).sort().pop()}`);

const tickers = perps.map((p) => p.ticker);
console.log("\n자료 수집 중… (첫 실행은 SEC 공시를 받느라 몇 분 걸린다)");
const { stock, skipped } = await loadStocks(tickers, YEARS, (n, total, ok) => {
  if (n % 20 === 0) process.stdout.write(`  ${n}/${total} 확인, ${ok}종목 확보\r`);
});
const syms = Object.keys(stock);
console.log(`  검증 가능 ${syms.length}종목 (제외 ${skipped.length}개)`);
{
  const why = {};
  for (const [, r] of skipped) why[r] = (why[r] || 0) + 1;
  console.log("  제외 사유: " + Object.entries(why).map(([k, v]) => `${k} ${v}`).join(" · "));
}
const missing = BOT10.filter((t) => !stock[t]);
if (missing.length) console.log(`  ※ 봇 10종목 중 빠진 것: ${missing.join(", ")}`);

const fund = loadFunding(syms, BOT_DATA);
console.log(`  펀딩비: ${fund.measured}종목 실측 · 나머지는 평균 ${pc(fund.avg)} 적용`);

const rebal = rebalanceDates(stock, YEARS);
const signalAt = makeSignal(stock, MIN_NAMES);

// 실제로 몇 종목이 순위에 들어가는지
{
  const counts = rebal.map((d) => signalAt(d)?.length ?? 0).filter((x) => x > 0);
  console.log(`  리밸런스 ${counts.length}회 · 회당 평균 ${Math.round(mean(counts))}종목 (최소 ${Math.min(...counts)} 최대 ${Math.max(...counts)})`);
}

const run = (mode, costs) =>
  runStrategy({ stock, rebal, signalAt, fund, mode, frac: FRAC, costs, costPerSide: COST_PER_SIDE, minNames: MIN_NAMES });

console.log(`\n■ 전체 ${syms.length}종목 · 상·하위 ${FRAC * 100}% · 비용 반영 (수수료+슬리피지+펀딩)`);
console.log(HEADER);
const R = {};
for (const [m, t] of [["ew", "균등보유 (기준선)"], ["long", `상위 ${FRAC * 100}% 롱`], ["ls", `상위롱 / 하위숏`]]) {
  R[m] = run(m, true);
  show(t, stats(R[m]));
}

console.log("\n■ 기준선(균등보유) 대비 초과수익 — 신호의 값어치");
for (const [m, t] of [["long", `상위 ${FRAC * 100}% 롱`], ["ls", "상위롱 / 하위숏"]]) {
  const n = Math.min(R[m].length, R.ew.length);
  const ex = Array.from({ length: n }, (_, i) => R[m][i] - R.ew[i]);
  const t2 = mean(ex) / (sd(ex) / Math.sqrt(n));
  console.log(
    "  " + pad(t, 24) + padL(pc(mean(ex) * 12), 12) + `  (월평균 ${pc(mean(ex))}, t=${t2.toFixed(2)})  ` +
      (Math.abs(t2) >= 2 ? (t2 > 0 ? "★ 의미 있음" : "★ 오히려 손해") : "우연과 구분 안 됨"),
  );
}

// ── 초과수익인가, 그냥 위험을 더 진 것인가 ─────────────────
//
// 연수익이 기준선보다 높아도 변동성이 그만큼 크면 실력이 아니다.
// 기준선을 그 배수만큼 레버리지로 사도 같은 결과가 나오기 때문이다.
// 기준선에 회귀해 베타(위험 배수)와 알파(베타로 설명되지 않는 몫)를 가른다.
console.log("\n■ 실력인가 위험인가 — 기준선에 회귀 (베타·알파)");
console.log("  " + pad("전략", 24) + padL("베타", 8) + padL("연 알파", 11) + padL("t", 8) + padL("샤프", 8) + "  판정");
{
  const ewR = R.ew;
  const mEw = mean(ewR);
  const varEw = mean(ewR.map((x) => (x - mEw) ** 2));
  for (const [m, t] of [["long", `상위 ${FRAC * 100}% 롱`], ["ls", "상위롱 / 하위숏"]]) {
    const a = R[m];
    const n = Math.min(a.length, ewR.length);
    const mA = mean(a.slice(0, n));
    const cov = mean(Array.from({ length: n }, (_, i) => (a[i] - mA) * (ewR[i] - mEw)));
    const beta = cov / varEw;
    const alpha = mA - beta * mEw;
    // 잔차로 알파의 t 값
    const resid = Array.from({ length: n }, (_, i) => a[i] - beta * ewR[i] - alpha);
    const tA = alpha / (sd(resid) / Math.sqrt(n));
    const s = stats(a);
    console.log(
      "  " + pad(t, 24) + padL(beta.toFixed(2), 8) + padL(pc(alpha * 12), 11) +
        padL(tA.toFixed(2), 8) + padL(s.sharpe.toFixed(2), 8) + "  " +
        (Math.abs(tA) >= 2 ? (tA > 0 ? "★ 알파 있음" : "★ 알파 마이너스") : "알파는 우연과 구분 안 됨"),
    );
  }
  const sEw = stats(ewR);
  console.log(`  ${pad("균등보유 (기준선)", 24)}${padL("1.00", 8)}${padL("—", 11)}${padL("—", 8)}${padL(sEw.sharpe.toFixed(2), 8)}`);
  console.log("\n  베타가 2 인데 알파가 0 이면, 기준선을 2배로 산 것과 같다.");
  console.log("  그건 신호의 값어치가 아니라 그냥 위험을 두 배로 진 것이다.");
}

// 위험을 맞춰서 견주기 — 기준선을 같은 변동성까지 레버리지로 올렸을 때
console.log("\n■ 변동성을 맞춰 견주기 (기준선을 같은 변동성까지 레버리지)");
console.log("  " + pad("전략", 24) + padL("연수익", 12) + padL("변동성", 11) + "   같은 변동성의 기준선");
{
  const sEw = stats(R.ew);
  for (const [m, t] of [["long", `상위 ${FRAC * 100}% 롱`], ["ls", "상위롱 / 하위숏"]]) {
    const s = stats(R[m]);
    const L = s.vol / sEw.vol; // 기준선을 이만큼 레버리지하면 같은 변동성
    const lev = stats(R.ew.map((x) => x * L));
    console.log(
      "  " + pad(t, 24) + padL(pc(s.cagr), 12) + padL(pc(s.vol), 11) +
        `   ${pc(lev.cagr)} (${L.toFixed(2)}배)  ` +
        (s.cagr > lev.cagr ? `★ ${pc(s.cagr - lev.cagr)} 더 벌었다` : `기준선 레버리지가 낫다`),
    );
  }
}

console.log("\n■ 기간을 반으로 갈라서 (기준선 대비 초과)");
{
  const half = Math.floor(R.ew.length / 2);
  for (const [m, t] of [["long", `상위 ${FRAC * 100}% 롱`], ["ls", "상위롱 / 하위숏"]]) {
    const parts = [["앞쪽", 0, half], ["뒤쪽", half, R.ew.length]].map(([lab, a, b]) => {
      const ex = R[m].slice(a, b).map((v, i) => v - R.ew[a + i]);
      return `${lab} ${pc(mean(ex) * 12)}`;
    });
    console.log("  " + pad(t, 24) + parts.join("   "));
  }
}

console.log("\n■ 초과수익이 몇 달에 몰려 있지는 않은가 (상위 롱)");
{
  const n = Math.min(R.long.length, R.ew.length);
  const ex = Array.from({ length: n }, (_, i) => R.long[i] - R.ew[i]).sort((a, b) => b - a);
  for (const k of [0, 1, 3, 6]) {
    console.log(`  ${pad(k === 0 ? "그대로" : `best ${k}개월 제외`, 20)}${padL(pc(mean(ex.slice(k)) * 12), 10)}`);
  }
}

console.log("\n■ 담는 비율을 바꿔 보면");
console.log("  " + pad("상·하위 비율", 16) + padL("연수익", 12) + padL("초과", 11) + padL("t", 8) + padL("최대낙폭", 12));
for (const f of [0.1, 0.2, 0.3, 0.5]) {
  const a = runStrategy({ stock, rebal, signalAt, fund, mode: "long", frac: f, costs: true, costPerSide: COST_PER_SIDE, minNames: MIN_NAMES });
  const s = stats(a);
  const n = Math.min(a.length, R.ew.length);
  const ex = Array.from({ length: n }, (_, i) => a[i] - R.ew[i]);
  const t = mean(ex) / (sd(ex) / Math.sqrt(n));
  console.log("  " + pad(`${f * 100}%`, 16) + padL(pc(s?.cagr), 12) + padL(pc(mean(ex) * 12), 11) + padL(t.toFixed(2), 8) + padL(pc(s?.mdd), 12));
}

console.log("\n■ 레버리지 — 낙폭이 -100% 에 닿으면 청산이다");
console.log("  " + pad("배수", 10) + padL("연수익", 12) + padL("최대낙폭", 12) + padL("최악의 달", 12) + "  판정");
for (const L of [1, 1.5, 2, 3]) {
  const s = stats(R.long.map((x) => x * L));
  const dead = s.mdd <= -0.99 || s.worst <= -0.99;
  console.log(
    "  " + pad(`${L}배`, 10) + padL(dead ? "청산" : pc(s.cagr), 12) + padL(pc(s.mdd), 12) +
      padL(pc(s.worst), 12) + "  " + (dead ? "★ 계좌 소멸" : s.mdd < -0.7 ? "견디기 어렵다" : "생존"),
  );
}

// ── 봇 10종목과 견주기 ──────────────────────────────────────
console.log("\n■ 봇이 굴리는 10종목만 골라 같은 계산으로");
{
  const sub = Object.fromEntries(Object.entries(stock).filter(([k]) => BOT10.includes(k)));
  const sig10 = makeSignal(sub, 6);
  const reb10 = rebalanceDates(sub, YEARS);
  const f10 = loadFunding(Object.keys(sub), BOT_DATA);
  const r10 = {};
  console.log(HEADER);
  for (const [m, t] of [["ew", "10종목 균등보유"], ["long", "10종목 상위 30% 롱"]]) {
    r10[m] = runStrategy({ stock: sub, rebal: reb10, signalAt: sig10, fund: f10, mode: m, frac: 0.3, costs: true, costPerSide: COST_PER_SIDE, minNames: 6 });
    show(t, stats(r10[m]));
  }
  const a = stats(R.ew), b = stats(r10.ew);
  if (a && b) {
    console.log(`\n  균등보유 비교 — 전체 ${syms.length}종목 ${pc(a.cagr)} vs 봇 10종목 ${pc(b.cagr)}`);
    console.log(`  차이 ${pc(b.cagr - a.cagr)} 가 종목을 결과 보고 고른 값이다 (생존 편향의 크기).`);
  }
}

console.log("\n■ 읽을 때");
console.log("  · 계약이 전부 2026년 상장이라, 바이낸스가 무엇을 상장할지 고를 때 이미");
console.log("    유명해진 종목을 골랐을 여지는 남는다. 다만 10개짜리보다는 훨씬 낫다.");
console.log("  · 기초자산(주식) 수익으로 계산했다. 무기한선물은 여기서 펀딩만큼 갈린다.");
console.log("  · 펀딩 실측은 2026년치뿐이다. 과거 구간에 적용한 것은 가정이다.");
