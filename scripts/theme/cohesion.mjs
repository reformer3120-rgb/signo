// 테마 분류의 품질을 정답표 없이 재는 도구.
//
// 왜 필요한가 — 자체 테마 분류를 만들면 "잘 만들었는지" 를 잴 방법이 없다.
// 에프앤가이드 분류와 겹치는 비율로 재는 것은 안 된다. 그 자체가 남의
// 분류를 참조해 쓰는 것이라, 라이선스를 피하려고 만든 물건을 검증하는 데
// 라이선스 대상을 쓰는 꼴이 된다.
//
// 대신 성질로 잰다. 진짜 테마라면 구성종목이 같이 움직인다. 그래서
// 테마 안 종목쌍의 일간 수익률 상관을 재고, 시장에서 아무렇게나 뽑은
// 묶음과 견준다.
//
// 대조군을 테마 종목 안에서 뽑으면 안 된다. 그것들은 이미 서로 겹치므로
// 기준선이 부풀어 테마 효과가 사라져 보인다 (처음에 이렇게 재서 차이가
// 0.071 로 나왔다. 시장에서 뽑으니 0.194 였다).
//
// 실행 — 개발 서버가 떠 있어야 한다
//   node scripts/theme/cohesion.mjs
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" };

const BARS = 60;
const PER_THEME = 12;
const THEMES = ["64", "579", "350", "474", "227", "331", "16", "202"];

async function daily(code) {
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${BARS}&requestType=0`;
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  const xml = await r.text();
  const out = [];
  for (const m of xml.matchAll(/<item data="([^"]+)"/g)) {
    const p = m[1].split("|");
    const c = Number(p[4]);
    if (Number.isFinite(c) && c > 0) out.push(c);
  }
  return out;
}

function rets(cs) {
  const out = [];
  for (let i = 1; i < cs.length; i++) out.push(Math.log(cs[i] / cs[i - 1]));
  return out;
}

function corr(a, b) {
  if (!a || !b) return null;
  const n = Math.min(a.length, b.length);
  if (n < 20) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const den = Math.sqrt(sxx * syy);
  return den ? sxy / den : null;
}

function cohesion(codes, R) {
  const v = [];
  for (let i = 0; i < codes.length; i++)
    for (let j = i + 1; j < codes.length; j++) {
      const c = corr(R[codes[i]], R[codes[j]]);
      if (c !== null) v.push(c);
    }
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

async function j(url) {
  return (await (await fetch(url)).json()).data;
}

// ── 테마 구성종목
const themes = [];
for (const no of THEMES) {
  try {
    const d = await j(`http://localhost:3000/api/themes/${no}`);
    if (!d?.stocks?.length) continue;
    themes.push({
      label: d.name,
      codes: [...d.stocks].sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0)).slice(0, PER_THEME).map((s) => s.code),
    });
  } catch { /* 건너뛴다 */ }
}

// ── 대조군: 시장 전체 (시총 상위에서 고루)
const themeSet = new Set(themes.flatMap((t) => t.codes));
const market = [];
for (const m of ["KOSPI", "KOSDAQ"]) {
  const rows = await j(`http://localhost:3000/api/marketcap?market=${m}&limit=100`);
  for (const r of rows ?? []) if (!themeSet.has(r.code)) market.push(r.code);
}
console.log(`테마 ${themes.length}개 · 테마종목 ${themeSet.size} · 대조군 풀 ${market.length}`);

const all = [...themeSet, ...market];
process.stdout.write(`일봉 ${all.length}종목 수집…`);
const R = {};
for (let i = 0; i < all.length; i += 12) {
  await Promise.all(all.slice(i, i + 12).map(async (c) => {
    try { R[c] = rets(await daily(c)); } catch { R[c] = []; }
  }));
}
console.log(" 완료");

console.log(`\n■ 테마 안 종목쌍 평균 상관 (최근 ${BARS}거래일)`);
const inside = [];
for (const t of themes) {
  const v = cohesion(t.codes, R);
  if (v === null) continue;
  inside.push(v);
  console.log("  " + t.label.padEnd(24) + v.toFixed(3) + "  (" + t.codes.length + "종목)");
}
const avgIn = inside.reduce((s, v) => s + v, 0) / inside.length;

// 대조군 — 시장에서 아무렇게나 12개
let seed = 987654321;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const randVals = [];
for (let k = 0; k < 200; k++) {
  const s = [...market].sort(() => rnd() - 0.5).slice(0, PER_THEME);
  const v = cohesion(s, R);
  if (v !== null) randVals.push(v);
}
randVals.sort((a, b) => a - b);
const avgRand = randVals.reduce((s, v) => s + v, 0) / randVals.length;
const p95 = randVals[Math.floor(randVals.length * 0.95)];

console.log("\n■ 견줌");
console.log("  테마 묶음 평균          " + avgIn.toFixed(3));
console.log("  무작위 묶음 평균        " + avgRand.toFixed(3) + `  (${randVals.length}회)`);
console.log("  무작위 상위 5% 경계     " + p95.toFixed(3));
console.log("  차이                    +" + (avgIn - avgRand).toFixed(3));
const beat = inside.filter((v) => v > p95).length;
console.log(`  무작위 상위 5% 를 넘은 테마  ${beat}/${inside.length}`);

console.log("\n  자체 분류를 만들면 이 " + avgIn.toFixed(3) + " 에 얼마나 다가가는지로 품질을 말한다.");
console.log("  에프앤가이드 분류와 겹치는 비율로 재면 그 자체가 참조 사용이라 쓸 수 없다.");
