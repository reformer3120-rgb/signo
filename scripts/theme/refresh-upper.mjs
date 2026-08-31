// 윗층 테마판을 주 1회 새로 만든다 — 받기 · 굳히기 · 올리기를 한 번에.
//
// ── 왜 자동으로 돌려야 하나 ────────────────────────────────
// 윗층은 회전 목록이다. 주 단위로 상위 20 중 넷쯤이 바뀌고, 한 달이면 절반이
// 뒤집힌다. 갱신이 멈추면 "지금 움직이는 테마" 라는 이름이 그대로 거짓말이 된다.
// 아래층(사업 분류)은 분기에 한 번이라 늦어도 되지만 이쪽은 아니다.
//
// ── 왜 로컬에서 도나 ──────────────────────────────────────
// 네이버 테마 목록과 일봉 10MB 를 받아야 해서 Vercel 크론(60초)에 안 들어간다.
// 그래서 이 PC 의 작업 스케줄러가 주 1회 부른다. 등록은
// scripts/theme/register-upper-task.ps1 참고.
//
// ── 무엇을 커밋하나 ───────────────────────────────────────
// src/data/upper.json 하나뿐이다. 다른 파일이 섞여 있어도 건드리지 않는다 —
// 사람이 작업하던 것을 무인 스크립트가 함께 올려 버리면 안 된다.
//
// 실행
//   node scripts/theme/refresh-upper.mjs           받기 → 굳히기 → 커밋 → 올리기
//   node scripts/theme/refresh-upper.mjs --dry     올리지 않는다 (시험용)
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const ROOT = process.cwd();
const LOG = path.join(ROOT, ".cache", "refresh-upper.log");
const OUT = "src/data/upper.json";

const 이제 = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const 줄 = [];
function 적기(s) {
  const t = `${이제()}  ${s}`;
  console.log(t);
  줄.push(t);
}
function 남기기() {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  // 지난 기록을 지우지 않는다 — 몇 주째 실패하고 있는지 봐야 한다
  fs.appendFileSync(LOG, 줄.join("\n") + "\n");
}

function 돌리기(설명, cmd, args) {
  적기(`${설명} …`);
  try {
    const out = execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const 끝줄 = out.trim().split("\n").filter(Boolean).slice(-2);
    for (const l of 끝줄) 적기(`  ${l.trim()}`);
    return true;
  } catch (e) {
    적기(`  실패 — ${String(e.message ?? e).split("\n")[0]}`);
    return false;
  }
}

const git = (args) => execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" }).trim();

적기("── 윗층 갱신 시작 ──");

// 1. 판 만들기 — 네이버 후보 + 일봉을 받아 잰다
if (!돌리기("판 만들기", "node", ["scripts/research/theme-upper-board.mjs"])) {
  적기("판을 못 만들었다. 데이터를 건드리지 않고 멈춘다.");
  남기기();
  process.exit(1);
}

// 2. 화면용으로 굳히기 — 쉬는 테마 누적과 반년 규칙이 여기서 돈다
if (!돌리기("화면용 데이터 굳히기", "node", ["scripts/theme/build-upper.mjs"])) {
  적기("굳히기에 실패했다. 커밋하지 않는다.");
  남기기();
  process.exit(1);
}

// 3. 바뀐 것이 있나
const 변경 = git(`status --porcelain -- ${OUT}`);
if (!변경) {
  적기("판이 지난주와 같다. 커밋할 것이 없다.");
  남기기();
  process.exit(0);
}

// 4. 무엇이 바뀌었는지 한 줄로
let 요약 = "";
try {
  const d = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const 판 = d.themes.filter((t) => t.active);
  const 쉬는것 = d.themes.filter((t) => !t.active);
  요약 = `판 ${판.length}개 · 쉬는 것 ${쉬는것.length}개 · ${d.만든날} 기준`;
  적기(요약);
  적기(`  ${판.slice(0, 5).map((t) => `${t.name} ×${t.su}`).join(" · ")}`);
} catch { /* 요약은 못 만들어도 커밋은 한다 */ }

if (DRY) {
  적기("--dry 라 여기서 멈춘다. 커밋·올리기는 하지 않았다.");
  남기기();
  process.exit(0);
}

// 5. 커밋 — upper.json 하나만. 사람이 작업하던 다른 파일은 건드리지 않는다.
try {
  git(`add ${OUT}`);
  const msg = `윗층 테마판 주간 갱신 — ${요약 || 이제().slice(0, 10)}\n\n자동 갱신(scripts/theme/refresh-upper.mjs).`;
  execSync(`git commit -q -F -`, { cwd: ROOT, input: msg, encoding: "utf8" });
  적기(`커밋 ${git("log --oneline -1")}`);
} catch (e) {
  적기(`커밋 실패 — ${String(e.message ?? e).split("\n")[0]}`);
  남기기();
  process.exit(1);
}

// 6. 올리기 — 여기까지 가야 화면에 반영된다
try {
  git("push -q origin main");
  적기("올리기 완료. 배포가 끝나면 화면에 반영된다.");
} catch (e) {
  적기(`올리기 실패 — ${String(e.message ?? e).split("\n")[0]}`);
  적기("커밋은 남아 있다. 다음 실행이나 손으로 push 하면 된다.");
  남기기();
  process.exit(1);
}

남기기();
