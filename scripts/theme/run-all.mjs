// 수집 → 분류 → 평가를 끝까지 돌린다.
//
// DART 가 막혀 있으면 풀릴 때까지 기다린다. 사람이 지켜보지 않아도
// 되도록 진행 상황을 파일에 그때그때 적는다 (파이프로 물리면 stdout 이
// 버퍼에 갇혀 아무것도 안 보이기 때문이다 — 앞서 그래서 상태를 몰랐다).
//
// 실행
//   node scripts/theme/run-all.mjs
// 진행 → .cache/theme/progress.log
// 결과 → .cache/theme/report.txt
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DIR = ".cache/theme";
const LOG = path.join(DIR, "progress.log");
const REPORT = path.join(DIR, "report.txt");

fs.mkdirSync(DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
  process.stdout.write(line);
}

const KEY = /^DART_API_KEY=(.*)$/m.exec(fs.readFileSync(".env.local", "utf8"))?.[1]?.trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dartOpen() {
  try {
    const r = await fetch(
      `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}&corp_code=00126380&bgn_de=20240101&pblntf_ty=A&page_count=1`,
      { cache: "no-store" },
    );
    const j = await r.json();
    return j.status === "000";
  } catch {
    return false;
  }
}

/** 자식 프로세스를 돌리고 끝날 때까지 기다린다 */
function run(script, args = []) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const grab = (b) => {
      tail = (tail + b.toString()).slice(-4000);
    };
    p.stdout.on("data", grab);
    p.stderr.on("data", grab);
    p.on("close", (code) => resolve({ code, tail }));
  });
}

// ── 1. DART 가 열릴 때까지 ─────────────────────────────────
log("시작 — DART 상태 확인");
let waited = 0;
while (!(await dartOpen())) {
  if (waited === 0) log("DART 가 막혀 있다. 3분마다 다시 본다.");
  await sleep(180_000);
  waited += 3;
  if (waited % 30 === 0) log(`  ${waited}분째 대기 중`);
  if (waited > 600) {
    log("10시간을 기다렸다. 오늘은 포기한다.");
    process.exit(2);
  }
}
log(`DART 열림 (대기 ${waited}분)`);

// ── 2. 수집 ────────────────────────────────────────────────
for (let round = 1; round <= 12; round++) {
  const before = fs.existsSync(path.join(DIR, "overview.json"))
    ? Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, "overview.json"), "utf8"))).length
    : 0;
  log(`수집 ${round}회차 시작 (현재 ${before}종목 처리됨)`);
  const r = await run("scripts/theme/collect.mjs");
  const after = Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, "overview.json"), "utf8"))).length;
  const filled = Object.values(JSON.parse(fs.readFileSync(path.join(DIR, "overview.json"), "utf8")))
    .filter((v) => v.text).length;
  log(`  종료 code=${r.code} · 처리 ${after} · 개요 ${filled}`);
  if (r.code === 0) { log("수집 완료"); break; }
  if (after === before) {
    // 한 발도 못 나갔다 — 다시 막힌 것이다. 길게 쉰다.
    log("  진전 없음. 10분 쉰다.");
    await sleep(600_000);
  } else {
    await sleep(60_000);
  }
}

// ── 3. 분류 ────────────────────────────────────────────────
log("분류 시작");
const c = await run("scripts/theme/classify.mjs");
log("분류 종료\n" + c.tail.split("\n").slice(-40).join("\n"));

// ── 4. 평가 ────────────────────────────────────────────────
log("평가 시작 (시총 수집 포함 — 몇 분 걸린다)");
const e = await run("scripts/theme/evaluate.mjs");
log("평가 종료\n" + e.tail);

fs.writeFileSync(
  REPORT,
  ["=== 분류 ===", c.tail, "", "=== 평가 ===", e.tail].join("\n"),
);
log(`끝. 결과 → ${REPORT}`);
