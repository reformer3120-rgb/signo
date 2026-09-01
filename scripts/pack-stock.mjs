// 법인 개발자에게 보낼 종목탭 꾸러미를 묶는다.
//
// 지난번에는 손으로 골라 담았다. 그러다 개요 카드를 고친 뒤 about.json 을
// 빠뜨릴 뻔했다 — 그것이 없으면 개요가 통째로 안 뜨는데, 받는 쪽에서는
// "우리 쪽 문제인가" 부터 의심하게 된다. 그래서 목록을 코드로 적어 둔다.
//
// 무엇을 담나
//   src-snapshot/   종목탭이 쓰는 파일 전부 (import 를 따라가면 나오는 것)
//   scripts/        분기에 한 번 돌릴 것 (개요 문장 만들기)
//   문서 넷         구현명세 · 합치기명세 · 옮겨심기 · 파일목록
//
// 무엇을 안 담나
//   .env.local · 키 · 토큰. 받는 쪽이 자기 것을 발급한다.
//
// 실행
//   node scripts/pack-stock.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { 화면, 라우트, 만드는법, 키검사 } from "./pack-list.mjs";

const OUT = "SIGNO-종목탭-이식.zip";
const TMP = ".cache/pack";

const SRC = [...화면, ...라우트];
const SCRIPTS = 만드는법;

/** 꾸러미 맨 위에 놓을 문서 — [원본, 담을 이름] */
const DOCS = [
  ["docs/종목화면-구현명세.md", "구현명세.md"],
  ["docs/종목탭-합치기-명세.md", "합치기-명세.md"],
  ["docs/종목탭-이식-README.md", "README.md"],
  ["docs/종목탭-바뀐것.md", "바뀐것.md"],
];

fs.rmSync(TMP, { recursive: true, force: true });
const 담기 = (from, to) => {
  fs.mkdirSync(path.dirname(path.join(TMP, to)), { recursive: true });
  fs.copyFileSync(from, path.join(TMP, to));
};

let 빠진것 = 0;
for (const f of SRC) {
  if (!fs.existsSync(f)) { console.log(`  없음 — ${f}`); 빠진것++; continue; }
  담기(f, `src-snapshot/${f}`);
}
for (const f of SCRIPTS) {
  if (!fs.existsSync(f)) { console.log(`  없음 — ${f}`); 빠진것++; continue; }
  담기(f, `src-snapshot/${f}`);
}
for (const [from, to] of DOCS) {
  if (!fs.existsSync(from)) { console.log(`  없음 — ${from}`); 빠진것++; continue; }
  담기(from, to);
}
// 목록은 갈래로 나눠 적는다 — 받는 쪽이 "이게 다 뭐냐" 부터 묻지 않게.
const 갈래 = [
  ["화면 (StockView 에서 import 를 따라가면 나오는 전부)",
    SRC.filter((f) => f.startsWith("src/") && !f.startsWith("src/app/api/") && f !== "src/app/globals.css")],
  ["API 라우트", SRC.filter((f) => f.startsWith("src/app/api/"))],
  ["그 밖", SRC.filter((f) => f === "src/app/globals.css")],
  ["분기에 한 번 돌릴 것 (개요 문장 만들기)", SCRIPTS],
];
const 줄 = "\n";
fs.writeFileSync(
  path.join(TMP, "파일목록.txt"),
  갈래.map(([이름, 것들]) => `── ${이름}  ${것들.length}개` + 줄 + 것들.join(줄)).join(줄 + 줄) + 줄,
);

// 키가 섞여 들어가지 않았는지 본다. 사람이 고르든 코드가 고르든 마지막에
// 한 번은 확인해야 한다.
키검사([...SRC, ...SCRIPTS]);

fs.rmSync(OUT, { force: true });
// -Path 에 폴더를 주면 폴더째 들어가고, 와일드카드를 주면 압축 루트에 'pack'
// 이 한 겹 남는다. 자식들을 하나씩 넘겨야 우리가 만든 구조 그대로 들어간다.
execFileSync("powershell", [
  "-NoProfile", "-Command",
  `Compress-Archive -Path (Get-ChildItem -LiteralPath '${path.resolve(TMP)}' | ForEach-Object FullName) -DestinationPath '${path.resolve(OUT)}'`,
], { stdio: "inherit" });

const 셋 = SRC.length + SCRIPTS.length;
console.log(`\n${OUT}  ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)}MB`);
console.log(`  소스 ${셋}개 · 문서 ${DOCS.length}개`);
if (빠진것) console.log(`  못 담은 것 ${빠진것}개 — 위를 볼 것`);
