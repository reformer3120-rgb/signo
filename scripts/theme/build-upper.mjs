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
// ── 판에서 빠져도 명단은 남긴다 ────────────────────────────
// 테마는 죽었다 살아난다. 지역화폐가 이번 달 뜨고 두 달 쉬었다가 또 뜬다.
// 판에서 빠질 때 구성종목까지 버리면, 돌아왔을 때 처음부터 다시 찾아야 하고
// 그 사이 "이 종목이 지역화폐였다" 는 사실을 화면 어디에서도 못 본다.
//
// 그래서 둘을 가른다.
//   판(active)   지금 돈이 들어온 것만. 회전한다.
//   사전         한 번이라도 판에 올랐던 것 전부. 쌓기만 한다.
//
// 쉬는 테마의 명단은 마지막으로 판에 있던 날의 것이다. 시간이 지나면 낡는다.
// 그래서 반년 넘게 안 올라온 것은 걷어낸다 — 상장폐지가 아닌 한 테마는 돌고
// 도는데, 반년을 못 도는 것은 명단이 낡았다고 보는 편이 맞다.
//
// 상장폐지된 종목을 명단에서 빼는 필터는 넣지 않았다. 쓸 만한 목록이 없다 —
// .cache/theme/listed.json 은 2,758건인데 리츠 일부가 빠져 있어, 그것으로
// 거르면 오늘도 거래되는 종목이 지워진다(204210 은 971원에 65만주가 거래되는데
// 그 목록에 없다). 반년 규칙이 그 일을 대신한다. 종목이 없어진 테마는 애초에
// 판으로 돌아오지 못하므로 반년 뒤 사라진다.
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

// 지난번 결과 — 판에서 빠진 것을 여기서 건져 낸다
const 이전 = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { themes: [] };
const 이전맵 = new Map((이전.themes ?? []).map((t) => [t.name, t]));

let 이름없음 = 0;
const themes = b.board.map((r, i) => {
  const codes = (r.codes ?? r.top.map((x) => x.code)).filter((c) => /^\d{6}$/.test(c));
  for (const c of codes) if (!이름.has(c)) 이름없음++;
  const 옛것 = 이전맵.get(r.name);
  return {
    // 화면 주소에 쓸 id — 이름은 한글이라 그대로 못 쓴다.
    // 한 번 준 id 는 그대로 둔다. 순위가 바뀔 때마다 id 가 달라지면
    // 열어 둔 화면이 엉뚱한 테마를 가리킨다.
    id: 옛것?.id ?? `u${String(i + 1).padStart(2, "0")}`,
    name: r.name,
    /** 지금 판에 올라 있나 */
    active: true,
    /** 마지막으로 판에 오른 날 */
    lastSeen: b.asOf,
    /** 판에 오른 횟수 — 자주 도는 테마인지 본다 */
    seen: (옛것?.seen ?? 0) + 1,
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

// 이번에 빠진 것 — 명단과 마지막 날짜를 그대로 들고 쉰다.
// 반년 넘게 안 올라온 것은 여기서 걷어낸다.
const 반년 = 180 * 24 * 3600 * 1000;
const 오늘 = new Date(b.asOf).getTime();
const 이번이름 = new Set(themes.map((t) => t.name));
let 새id = themes.length;
const 지난것 = (이전.themes ?? []).filter((t) => !이번이름.has(t.name));
const 쉬는것 = 지난것
  .filter((t) => {
    const 마지막 = new Date(t.lastSeen ?? b.asOf).getTime();
    return !Number.isFinite(마지막) || 오늘 - 마지막 <= 반년;
  })
  .map((t) => ({ ...t, id: t.id ?? `u${String(++새id).padStart(2, "0")}`, active: false }));
const 걷어낸것 = 지난것.length - 쉬는것.length;

const 모두 = [...themes, ...쉬는것];

fs.writeFileSync(
  OUT,
  JSON.stringify({
    출처: "시세로 판정한다 — 잔차 상관과 상대 거래대금. 사업보고서를 보지 않는다.",
    기준: `잔차 > 무작위 상위 5%(${b.p95.toFixed(3)}) · 상대 거래대금 > ×1.00 · 종목 5~40`,
    만든날: b.asOf,
    시장거래대금배수: b.mktSurge,
    themes: 모두,
  }),
);

const 종목 = new Set(모두.flatMap((t) => t.codes));
console.log(`윗층 판 ${themes.length}개 · 쉬는 것 ${쉬는것.length}개 · 고유 종목 ${종목.size} · ${b.asOf} 기준`);
if (걷어낸것) console.log(`  반년 넘게 안 올라와 걷어낸 것 ${걷어낸것}개`);
console.log(`  아래층에 이름이 없는 종목 ${이름없음}건 (네이버 표기를 그대로 쓴다)`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
for (const t of themes.slice(0, 5)) {
  console.log(`  ${t.name.padEnd(18)}${String(t.codes.length).padStart(3)}종목  잔차 ${t.w}  거래 ×${t.su}`);
}
