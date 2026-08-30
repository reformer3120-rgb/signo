// 윗층 테마판을 화면용 데이터로 굳힌다.
//
// ── 두 층이 무엇이 다른가 ──────────────────────────────────
//   아래층  무엇으로 버는가   사업보고서 · 분기 갱신 · 한 종목 한 칸
//   윗층    왜 같이 움직이나  시세 · 주 1회 갱신 · 중복 허용
//
// 층을 가르는 것은 겹침 허용 여부가 아니라 출처와 갱신 주기다. 자율주행처럼
// 여러 업종에 걸친 것은 아래층 배타 분류에 자리가 없다 — 현대모비스는
// 자동차부품, 텔레칩스는 팹리스에 이미 들어가 있기 때문이다. 윗층은 그 종목들을
// 다시 모을 수 있다.
//
// ── 왜 별도 파일로 굳히나 ──────────────────────────────────
// 판을 만드는 데 네이버 테마 목록과 일봉 10MB 가 필요한데, 그것을 배포에
// 실을 수는 없다. themes.json 과 같은 방식으로, 만든 결과만 작은 파일로
// 굳혀 커밋한다.
//
// 실행 (theme-upper-board.mjs 뒤)
//   node scripts/research/theme-upper-board.mjs   판 만들기 (주 1회)
//   node scripts/theme/build-upper.mjs            → src/data/upper.json
import fs from "node:fs";
import path from "node:path";

const IN = ".cache/theme/upper/board.json";
const OUT = "src/data/upper.json";

if (!fs.existsSync(IN)) {
  console.error(`${IN} 이 없다 — scripts/research/theme-upper-board.mjs 를 먼저 돌릴 것.`);
  process.exit(1);
}
const b = JSON.parse(fs.readFileSync(IN, "utf8"));

// 아래층에서 종목 이름을 가져온다. 윗층 후보에는 네이버에서 온 것이 섞여
// 있어 이름 표기가 다를 수 있다 — 우리 이름으로 맞춘다.
const 아래층 = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const 이름 = new Map();
for (const t of 아래층.themes) for (const s of t.stocks) 이름.set(s.code, s.name);

let 이름없음 = 0;
const themes = b.board.map((r, i) => {
  const codes = (r.codes ?? r.top.map((x) => x.code)).filter((c) => /^\d{6}$/.test(c));
  for (const c of codes) if (!이름.has(c)) 이름없음++;
  return {
    // 화면 주소에 쓸 id — 이름은 한글이라 그대로 못 쓴다
    id: `u${String(i + 1).padStart(2, "0")}`,
    name: r.name,
    /** 어디서 온 후보인가 — SIGNO(아래층) · 네이버 */
    src: r.src,
    /** 잔차 상관 — 시장 공통분을 걷어낸 뒤에도 저희끼리 같이 움직이는가 */
    w: r.w,
    /** 상대 거래대금 배수 — 최근 10일 / 직전 50일 ÷ 시장 배수 */
    su: r.su,
    /** 순위를 매기는 값 (w × su) */
    score: r.score,
    codes,
    /** 재는 데 쓴 시총 상위 종목 — 대표종목으로 보여준다 */
    top: r.top.map((x) => ({ code: x.code, name: 이름.get(x.code) ?? x.name })),
  };
});

fs.writeFileSync(
  OUT,
  JSON.stringify({
    출처: "시세로 판정한다 — 잔차 상관과 상대 거래대금. 사업보고서를 보지 않는다.",
    기준: `잔차 > 무작위 상위 5%(${b.p95.toFixed(3)}) · 상대 거래대금 > ×1.00 · 종목 5~40`,
    만든날: b.asOf,
    시장거래대금배수: b.mktSurge,
    themes,
  }),
);

const 종목 = new Set(themes.flatMap((t) => t.codes));
console.log(`윗층 ${themes.length}개 · 고유 종목 ${종목.size} · ${b.asOf} 기준`);
console.log(`  아래층에 이름이 없는 종목 ${이름없음}건 (네이버 표기를 그대로 쓴다)`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
for (const t of themes.slice(0, 5)) {
  console.log(`  ${t.name.padEnd(18)}${String(t.codes.length).padStart(3)}종목  잔차 ${t.w}  거래 ×${t.su}`);
}
