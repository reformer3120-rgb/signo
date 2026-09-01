// 법인 개발자에게 "고칠 자리만" 보내는 꾸러미.
//
// 전체 꾸러미(pack-stock.mjs)는 처음 옮겨 심을 때 쓴다. 이미 한 번 받아
// 간 뒤라면 65개를 통째로 다시 주는 것이 오히려 일이다 — 무엇이 달라졌는지
// 받는 쪽이 직접 찾아야 하고, 그 사이 그쪽에서 고친 것을 덮어쓸 위험도 있다.
//
// 그래서 셋만 담는다.
//   바뀐자리.diff   무엇이 어떻게 바뀌었나 (먼저 읽는 것)
//   덮어쓸것/       그대로 복사하면 되는 파일들
//   바뀐것.md       왜 그렇게 바꿨나
//
// 기준점은 지난번 꾸러미를 묶을 때의 커밋이다. 새 꾸러미를 보낼 때마다
// BASE 를 그때 커밋으로 바꿔 적는다.
//
// 실행
//   node scripts/pack-stock-delta.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { 전부, 만드는법, 키검사 } from "./pack-list.mjs";

/** 지난 꾸러미를 묶은 시점 (2026-08-31 15:45) */
const BASE = "5e2ebc5";

const OUT = "SIGNO-종목탭-바뀐것.zip";
const TMP = ".cache/pack-delta";

// 무엇을 담을지 손으로 적지 않는다.
//
// 처음에는 바뀐 파일을 여기 적어 두었다. 그러다 개요를 고치고 나니 여섯
// 파일이 목록에서 빠졌는데, 받는 쪽은 그것이 빠진 줄도 모른다. 목록은
// pack-list.mjs 하나뿐이고, 그중 무엇이 바뀌었는지는 git 에게 묻는다.
const 상태 = new Map(
  execSync(`git diff --name-status ${BASE}..HEAD -- src scripts`, { encoding: "utf8" })
    .trim().split(String.fromCharCode(10)).filter(Boolean)
    .map((l) => { const [t, f] = l.split(String.fromCharCode(9)); return [f, t]; }),
);
const 담은것 = 전부.filter((f) => 상태.has(f));
const 새것 = 담은것.filter((f) => 상태.get(f) === "A");
const 고친것 = 담은것.filter((f) => 상태.get(f) === "M");

fs.rmSync(TMP, { recursive: true, force: true });
const 담기 = (from, to) => {
  fs.mkdirSync(path.dirname(path.join(TMP, to)), { recursive: true });
  fs.copyFileSync(from, path.join(TMP, to));
};

let 빠진것 = 0;
for (const f of 담은것) {
  if (!fs.existsSync(f)) { console.log(`  없음 — ${f}`); 빠진것++; continue; }
  담기(f, `덮어쓸것/${f}`);
}

const 줄 = String.fromCharCode(10);

// 바뀐 자리 — 고친 파일만 넣는다.
//
// 새 파일까지 diff 로 주면 "+" 가 붙은 전문이 수백 줄 흐르는데, 그것은
// 읽을 것이 아니라 그냥 넣을 것이다. 덮어쓸것/ 에 원본이 있다.
const diff = 고친것.length
  ? execSync(`git diff ${BASE}..HEAD -- ${고친것.join(" ")}`, {
      encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    })
  : "";
fs.writeFileSync(
  path.join(TMP, "바뀐자리.diff"),
  [
    `# ${BASE}..HEAD — 고친 파일 ${고친것.length}개의 변경분`,
    `# 새 파일 ${새것.length}개는 여기 없다. 덮어쓸것/ 에서 그대로 가져가면 된다.`,
    "",
    diff,
  ].join(줄),
);

fs.writeFileSync(
  path.join(TMP, "먼저읽기.md"),
  [
    "# 고칠 자리만 — 종목탭",
    "",
    "지난 꾸러미(전체 66파일) 이후 바뀐 것만 담았다. 나머지는 그대로다.",
    "",
    "## 읽는 순서",
    "",
    "1. `바뀐것.md` — 무엇을 왜 고쳤나",
    "2. `바뀐자리.diff` — 고친 파일이 어떻게 바뀌었나",
    "3. `덮어쓸것/` — 그대로 복사",
    "",
    `## 새 파일 ${새것.length}개 (그대로 넣으면 된다)`,
    "",
    "```",
    ...새것,
    "```",
    "",
    "`src/data/about.json` 이 개요 문장이다. **이게 없으면 개요가 통째로",
    "안 뜬다.** 1.4MB 이고 서버에서만 읽는다.",
    "",
    `## 고친 파일 ${고친것.length}개 (diff 를 보고 반영)`,
    "",
    "```",
    ...고친것,
    "```",
    "",
    "`scripts/` 는 개요 문장을 분기에 한 번 새로 만들 때만 필요하다.",
    "지금 당장은 `about.json` 만 있으면 된다.",
    "",
    "## 안 건드린 것",
    "",
    "`src/components/StockBrief.tsx` 는 그대로 두었다. 이름이 비슷해",
    "헷갈리는데 그것은 **테마 화면의** 종목 카드이고, 거기서는 시총·매출성장·",
    "이익률·PER 을 그대로 쓴다 — 테마 화면에는 달리 볼 데가 없다.",
    "",
    "## 어디부터",
    "",
    "기업 개요부터. **키가 필요 없어서 오늘 바로 붙는다** — `stock-brief` 가",
    "이제 바깥을 하나도 안 부르고 굳혀 둔 표 둘만 읽는다.",
    "",
  ].join(줄),
);

fs.copyFileSync("docs/종목탭-바뀐것.md", path.join(TMP, "바뀐것.md"));

// 커밋 메시지도 같이 준다 — 왜 그렇게 했는지가 거기 적혀 있다.
fs.writeFileSync(
  path.join(TMP, "커밋기록.txt"),
  execSync(`git log --no-merges --format="%h %ad  %s%n%n%b%n${"-".repeat(60)}" --date=format:"%Y-%m-%d %H:%M" ${BASE}..HEAD -- src scripts`, {
    encoding: "utf8",
  }),
);

키검사(담은것);

fs.rmSync(OUT, { force: true });
execFileSync("powershell", [
  "-NoProfile", "-Command",
  `Compress-Archive -Path (Get-ChildItem -LiteralPath '${path.resolve(TMP)}' | ForEach-Object FullName) -DestinationPath '${path.resolve(OUT)}'`,
], { stdio: "inherit" });

console.log(`\n${OUT}  ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)}MB`);
console.log(`  새 파일 ${새것.length} · 고친 파일 ${고친것.length} · 기준 ${BASE}`);
if (빠진것) console.log(`  못 담은 것 ${빠진것}개 — 위를 볼 것`);
