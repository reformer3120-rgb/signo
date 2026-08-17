// 실제 주식으로 다시 — S&P 500 표본 · 알파/베타 · 변동성 타게팅.
//
// 앞선 검증(validate-universe.mjs)은 바이낸스가 상장한 79종목으로 쟀다.
// 그 목록은 전부 2026년에 상장된 계약이라 '이미 뜬 종목'만 모여 있었고,
// 결국 초과수익이 전부 베타로 드러났다.
//
// 여기서는 무기한선물이라는 틀을 벗고 실제 주식으로 본다.
//   표본  S&P 500 (503종목) — INTC·WBA·PARA 처럼 오래 부진한 종목도 들어 있다
//   비용  왕복 0.1% (수수료+슬리피지) · 숏은 대차료 연 1% 추가
//         무기한선물이 아니므로 펀딩비는 없다
//
// 두 가지를 본다
//   1) 요인이 실제 주식 표본에서도 베타로 사라지는가, 알파가 남는가
//   2) 알파가 없더라도 변동성 타게팅으로 샤프를 올릴 수 있는가
//      — 이건 예측이 아니라 위험 조절이라 알파와 무관하게 통한다
//
// 남는 한계 — 현재 편입 종목 명단이라 그동안 상장폐지·피인수된 회사가 빠져
// 있다. 다만 우리가 보는 값은 '같은 표본의 균등보유 대비 알파'라서 그
// 편향이 분자·분모에 함께 들어가 상당 부분 상쇄된다.
//
// 실행
//   EDGAR_UA="이름 메일주소" node scripts/research/validate-stocks.mjs
import {
  loadStocks, rebalanceDates, makeSignal, runStrategy, stats, show, HEADER,
  volTarget, alphaBeta, pad, padL, pc, mean, sd,
} from "./engine.mjs";

const YEARS = 10;
const COST_PER_SIDE = 0.0005; // 왕복 0.1%
const SHORT_BORROW = 0.01; // 대차료 연 1%
const MIN_NAMES = 50;
const FRAC = 0.2;

console.log("S&P 500 명단 조회…");
const csv = await fetch(
  "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
).then((r) => r.text());
const rowsCsv = csv.trim().split("\n").slice(1);
const tickers = rowsCsv
  .map((l) => l.split(",")[0].trim().replace(/\./g, "-")) // BRK.B → BRK-B (야후 표기)
  .filter((t) => /^[A-Z-]{1,6}$/.test(t));
console.log(`  ${tickers.length}종목`);

console.log("\n자료 수집 중… (첫 실행은 SEC 공시를 받느라 10분쯤 걸린다)");
const { stock, skipped } = await loadStocks(tickers, YEARS, (n, total, ok) => {
  if (n % 25 === 0) process.stdout.write(`  ${n}/${total} 확인, ${ok}종목 확보\r`);
});
const syms = Object.keys(stock);
console.log(`  검증 가능 ${syms.length}종목 (제외 ${skipped.length}개)          `);
{
  const why = {};
  for (const [, r] of skipped) why[r] = (why[r] || 0) + 1;
  console.log("  제외 사유: " + Object.entries(why).map(([k, v]) => `${k} ${v}`).join(" · "));
}

// 주식이라 펀딩은 없다. 숏에만 대차료를 물린다.
const fund = { rate: Object.fromEntries(syms.map((s) => [s, 0])), avg: 0 };
const fundShort = { rate: Object.fromEntries(syms.map((s) => [s, -SHORT_BORROW])), avg: -SHORT_BORROW };

const rebal = rebalanceDates(stock, YEARS);
const signalAt = makeSignal(stock, MIN_NAMES);
{
  const c = rebal.map((d) => signalAt(d)?.length ?? 0).filter((x) => x > 0);
  console.log(`  리밸런스 ${c.length}회 · 회당 평균 ${Math.round(mean(c))}종목`);
}

const run = (mode, frac = FRAC) =>
  runStrategy({
    stock, rebal, signalAt,
    // 롱숏일 때만 숏 다리에 대차료가 붙는다 (runStrategy 는 음수 비중에 rate 를 곱한다)
    fund: mode === "ls" ? fundShort : fund,
    mode, frac, costs: true, costPerSide: COST_PER_SIDE, minNames: MIN_NAMES,
  });

const R = {};
console.log(`\n■ S&P 500 ${syms.length}종목 · 상·하위 ${FRAC * 100}% · 비용 반영`);
console.log(HEADER);
for (const [m, t] of [["ew", "균등보유 (기준선)"], ["long", `상위 ${FRAC * 100}% 롱`], ["ls", "상위롱 / 하위숏"]]) {
  R[m] = run(m);
  show(t, stats(R[m]));
}

// ── 1) 알파가 남는가 ────────────────────────────────────────
console.log("\n■ 실력인가 위험인가 — 기준선에 회귀");
console.log("  " + pad("전략", 24) + padL("베타", 8) + padL("연 알파", 11) + padL("t", 8) + padL("샤프", 8) + "  판정");
for (const [m, t] of [["long", `상위 ${FRAC * 100}% 롱`], ["ls", "상위롱 / 하위숏"]]) {
  const ab = alphaBeta(R[m], R.ew);
  const s = stats(R[m]);
  console.log(
    "  " + pad(t, 24) + padL(ab.beta.toFixed(2), 8) + padL(pc(ab.alpha * 12), 11) +
      padL(ab.t.toFixed(2), 8) + padL(s.sharpe.toFixed(2), 8) + "  " +
      (Math.abs(ab.t) >= 2 ? (ab.t > 0 ? "★ 알파 있음" : "★ 알파 마이너스") : "우연과 구분 안 됨"),
  );
}
console.log("  " + pad("균등보유 (기준선)", 24) + padL("1.00", 8) + padL("—", 11) + padL("—", 8) + padL(stats(R.ew).sharpe.toFixed(2), 8));

console.log("\n■ 변동성을 맞춰 견주기");
{
  const sEw = stats(R.ew);
  for (const [m, t] of [["long", `상위 ${FRAC * 100}% 롱`], ["ls", "상위롱 / 하위숏"]]) {
    const s = stats(R[m]);
    const L = s.vol / sEw.vol;
    const lev = stats(R.ew.map((x) => x * L));
    console.log(
      "  " + pad(t, 24) + padL(pc(s.cagr), 12) + `   같은 변동성 기준선 ${pc(lev.cagr)} (${L.toFixed(2)}배)  ` +
        (s.cagr > lev.cagr ? `★ ${pc(s.cagr - lev.cagr)} 우위` : "기준선 레버리지가 낫다"),
    );
  }
}

// ── 2) 변동성 타게팅 ────────────────────────────────────────
//
// 여기가 핵심이다. 알파가 없어도 이건 통할 수 있다. 예측이 아니라
// '요동칠 때 작게 든다'는 위험 조절이기 때문이다.
console.log("\n■ 변동성 타게팅 — 예측이 아니라 위험 조절");
console.log(`  최근 6개월 변동성으로 다음 달 비중을 정한다 (목표 연 20%, 상한 2배, 미래 안 씀)`);
console.log("  " + pad("전략", 26) + padL("연수익", 11) + padL("변동성", 10) + padL("샤프", 8) + padL("최대낙폭", 11) + padL("최악의 달", 11));
const VT = { target: 0.2, lookback: 6, maxLev: 2 };
for (const [m, t] of [["ew", "균등보유"], ["long", `상위 ${FRAC * 100}% 롱`]]) {
  const raw = stats(R[m]);
  const vt = volTarget(R[m], VT);
  const s2 = stats(vt.rets);
  console.log(
    "  " + pad(t + " (그대로)", 26) + padL(pc(raw.cagr), 11) + padL(pc(raw.vol), 10) +
      padL(raw.sharpe.toFixed(2), 8) + padL(pc(raw.mdd), 11) + padL(pc(raw.worst), 11),
  );
  console.log(
    "  " + pad(t + " (변동성 타게팅)", 26) + padL(pc(s2.cagr), 11) + padL(pc(s2.vol), 10) +
      padL(s2.sharpe.toFixed(2), 8) + padL(pc(s2.mdd), 11) + padL(pc(s2.worst), 11) +
      `   샤프 ${(s2.sharpe - raw.sharpe >= 0 ? "+" : "") + (s2.sharpe - raw.sharpe).toFixed(2)}`,
  );
}

console.log("\n■ 목표 변동성을 바꿔 보면 (균등보유 기준)");
console.log("  " + pad("목표 연변동성", 16) + padL("연수익", 11) + padL("변동성", 10) + padL("샤프", 8) + padL("최대낙폭", 11) + padL("평균 비중", 11));
for (const target of [0.12, 0.15, 0.2, 0.25, 0.3]) {
  const vt = volTarget(R.ew, { ...VT, target });
  const s = stats(vt.rets);
  console.log(
    "  " + pad(`${(target * 100).toFixed(0)}%`, 16) + padL(pc(s.cagr), 11) + padL(pc(s.vol), 10) +
      padL(s.sharpe.toFixed(2), 8) + padL(pc(s.mdd), 11) + padL(vt.avgScale.toFixed(2) + "배", 11),
  );
}

console.log("\n■ 변동성 측정 기간을 바꿔 보면 (균등보유, 목표 20%)");
console.log("  " + pad("최근 N개월", 16) + padL("샤프", 8) + padL("최대낙폭", 11));
for (const lookback of [3, 6, 9, 12]) {
  const s = stats(volTarget(R.ew, { ...VT, lookback }).rets);
  console.log("  " + pad(`${lookback}개월`, 16) + padL(s.sharpe.toFixed(2), 8) + padL(pc(s.mdd), 11));
}

// 위에서 목표 20% 는 실제 변동성(15.7%)보다 높다. 그래서 '줄이는' 게 아니라
// '키우는' 장치가 돼 버렸다(평균 비중 1.44배). 위험 관리라면 키우지 말고
// 줄이기만 해야 한다 — 상한을 1배로 묶는다.
console.log("\n■ 줄이기만 하는 변동성 타게팅 (상한 1배 — 절대 레버리지 안 함)");
console.log("  " + pad("대상 / 목표", 28) + padL("연수익", 11) + padL("변동성", 10) + padL("샤프", 8) + padL("최대낙폭", 11) + padL("평균 비중", 11));
for (const [m, label] of [["ew", "균등보유"], ["long", `상위 ${FRAC * 100}% 롱`]]) {
  const raw = stats(R[m]);
  console.log(
    "  " + pad(`${label} (그대로)`, 28) + padL(pc(raw.cagr), 11) + padL(pc(raw.vol), 10) +
      padL(raw.sharpe.toFixed(2), 8) + padL(pc(raw.mdd), 11) + padL("1.00배", 11),
  );
  for (const target of [0.1, 0.12, 0.15]) {
    for (const lookback of [3, 6]) {
      const vt = volTarget(R[m], { target, lookback, maxLev: 1 });
      const s = stats(vt.rets);
      console.log(
        "  " + pad(`  목표 ${(target * 100).toFixed(0)}% · 최근 ${lookback}개월`, 28) +
          padL(pc(s.cagr), 11) + padL(pc(s.vol), 10) + padL(s.sharpe.toFixed(2), 8) +
          padL(pc(s.mdd), 11) + padL(vt.avgScale.toFixed(2) + "배", 11) +
          (s.sharpe > raw.sharpe ? "  ★ 샤프 개선" : ""),
      );
    }
  }
}

// 낙폭 기반 — 손실이 깊어지면 줄인다
console.log("\n■ 낙폭 기반 축소 — 고점 대비 N% 빠지면 비중을 절반으로");
console.log("  " + pad("대상 / 기준", 28) + padL("연수익", 11) + padL("샤프", 8) + padL("최대낙폭", 11));
for (const [m, label] of [["ew", "균등보유"], ["long", `상위 ${FRAC * 100}% 롱`]]) {
  const raw = stats(R[m]);
  console.log("  " + pad(`${label} (그대로)`, 28) + padL(pc(raw.cagr), 11) + padL(raw.sharpe.toFixed(2), 8) + padL(pc(raw.mdd), 11));
  for (const trigger of [0.1, 0.15, 0.2]) {
    // 지난달까지의 누적으로 낙폭을 판단한다 — 이번 달 수익은 아직 모른다
    let eq = 1;
    let peak = 1;
    const out = [];
    for (const r of R[m]) {
      const dd = eq / peak - 1;
      const k = dd <= -trigger ? 0.5 : 1;
      out.push(r * k);
      eq *= 1 + r;
      peak = Math.max(peak, eq);
    }
    const s = stats(out);
    console.log(
      "  " + pad(`  고점 대비 -${(trigger * 100).toFixed(0)}%`, 28) + padL(pc(s.cagr), 11) +
        padL(s.sharpe.toFixed(2), 8) + padL(pc(s.mdd), 11) + (s.sharpe > raw.sharpe ? "  ★ 샤프 개선" : ""),
    );
  }
}

console.log("\n■ 기간을 반으로 갈라서 (변동성 타게팅이 앞뒤 모두 통하는가)");
{
  const half = Math.floor(R.ew.length / 2);
  for (const [lab, a, b] of [["앞쪽", 0, half], ["뒤쪽", half, R.ew.length]]) {
    const raw = stats(R.ew.slice(a, b));
    // 타게팅은 전체 구간으로 계산한 뒤 잘라야 한다 — 구간마다 새로 시작하면
    // 앞의 6개월이 매번 버려져 비교가 어긋난다
    const vt = stats(volTarget(R.ew, VT).rets.slice(a, b));
    console.log(`  ${pad(lab, 8)}샤프 ${raw.sharpe.toFixed(2)} → ${vt.sharpe.toFixed(2)}   최대낙폭 ${pc(raw.mdd)} → ${pc(vt.mdd)}`);
  }
}

console.log("\n■ 읽을 때");
console.log("  · 현재 편입 명단이라 그동안 상폐·피인수된 회사가 빠져 있다. 다만 우리가 보는 값은");
console.log("    '같은 표본의 균등보유 대비' 라 그 편향이 분자·분모에 함께 들어가 상당 부분 상쇄된다.");
console.log("  · 변동성 타게팅은 t 시점 비중을 t 이전 수익률로만 정한다. 미래를 쓰지 않는다.");
console.log("  · 비용은 왕복 0.1%, 숏 대차료 연 1% 로 잡았다. 실제 체결은 이보다 나쁠 수 있다.");
