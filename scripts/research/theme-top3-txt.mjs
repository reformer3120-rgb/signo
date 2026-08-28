// top3-metrics.json → 메모장에서 바로 읽는 고정폭 텍스트
import fs from "node:fs";
const m = JSON.parse(fs.readFileSync(".cache/theme/top3-metrics.json", "utf8"));
const fmtD = (s) => (s ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}` : "");
const n1 = (x) => (x == null ? "-" : x.toFixed(1));
const won = (x) => (x == null ? "-" : x.toLocaleString("ko-KR"));
const cap = (x) => (x == null ? "-" : x >= 10000 ? `${(x/10000).toFixed(1)}조` : `${x.toLocaleString("ko-KR")}억`);
const asOf = fmtD(m.asOf);

/** 한글·전각은 두 칸으로 센다 */
const w = (s) => [...String(s)].reduce((a, c) => a + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(c) ? 2 : 1), 0);
const padR = (s, n) => String(s) + " ".repeat(Math.max(0, n - w(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - w(s))) + String(s);

const L = [];
const rule = (c = "=") => L.push(c.repeat(96));

rule();
L.push(`  테마별 주요종목 낙폭 · 반등   (${asOf} 종가 기준)`);
rule();
L.push("");
L.push(`  테마 ${new Set(m.rows.map(r=>r.theme.id)).size}개 x 시가총액 상위 3종목 = ${m.rows.length}행 (여러 테마에 걸친 종목은 중복)`);
L.push(`  고점대비 하락률 : 최근 52주(250거래일) 장중 최고가 대비 ${asOf} 종가`);
L.push(`  저점대비 상승률 : 최근 3개월(62거래일) 장중 최저가 대비 ${asOf} 종가`);
L.push(`  시세 = 네이버 일봉(수정주가) / 시가총액 = 네이버 종목 통합 API`);
L.push("");
L.push("  본 자료의 지표는 투자 참고용이며, 투자의 최종 책임은 투자자 본인에게 있습니다.");
L.push("");

// ── 요약
const byTheme = new Map();
for (const r of m.rows) {
  if (!byTheme.has(r.theme.id)) byTheme.set(r.theme.id, { t: r.theme, dd: [], up: [] });
  if (r.dd != null) byTheme.get(r.theme.id).dd.push(r.dd);
  if (r.up != null) byTheme.get(r.theme.id).up.push(r.up);
}
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const summary = [...byTheme.values()].map((v) => ({ t: v.t, dd: avg(v.dd), up: avg(v.up) }));

function block(title, list) {
  L.push(title);
  L.push("  " + "-".repeat(66));
  L.push("  " + padR("테마", 26) + padR("그룹", 16) + padL("고점대비", 12) + padL("저점대비", 12));
  L.push("  " + "-".repeat(66));
  for (const s of list)
    L.push("  " + padR(s.t.name, 26) + padR(s.t.group, 16) + padL(n1(s.dd) + "%", 12) + padL("+" + n1(s.up) + "%", 12));
  L.push("");
}
rule("-");
L.push("  [ 한눈에 ] 테마 평균 (주요 3종목 평균)");
rule("-");
L.push("");
block("  * 고점에서 가장 많이 빠진 테마 10", [...summary].sort((a, b) => a.dd - b.dd).slice(0, 10));
block("  * 최근 3개월 저점에서 가장 많이 오른 테마 10", [...summary].sort((a, b) => b.up - a.up).slice(0, 10));
block("  * 고점 근처를 지키는 테마 10 (낙폭이 가장 작은 쪽)", [...summary].sort((a, b) => b.dd - a.dd).slice(0, 10));

// ── 상세
rule("-");
L.push("  [ 테마별 상세 ]");
rule("-");
const HEAD = "  " + padR("종목", 20) + padR("코드", 8) + padL("시총", 9) + padL("종가", 12)
  + padL("52주고점", 12) + padR("  (일자)", 14) + padL("고점대비", 10)
  + padL("3개월저점", 12) + padR("  (일자)", 14) + padL("저점대비", 10);
for (const g of [...new Set(m.rows.map((r) => r.theme.group))]) {
  L.push("");
  L.push(`■ ${g}`);
  for (const id of [...new Set(m.rows.filter((r) => r.theme.group === g).map((r) => r.theme.id))]) {
    const rows = m.rows.filter((r) => r.theme.id === id);
    L.push("");
    L.push(`  ▷ ${rows[0].theme.name}`);
    L.push(HEAD);
    L.push("  " + "-".repeat(119));
    for (const r of rows) {
      if (r.err) { L.push("  " + padR(r.s.name, 20) + padR(r.s.code, 8) + padL(cap(r.s.cap), 9) + "   (시세 없음)"); continue; }
      L.push("  " + padR(r.s.name, 20) + padR(r.s.code, 8) + padL(cap(r.s.cap), 9) + padL(won(r.price), 12)
        + padL(won(r.hi), 12) + padR("  (" + fmtD(r.hiDate) + ")", 14) + padL(n1(r.dd) + "%", 10)
        + padL(won(r.lo), 12) + padR("  (" + fmtD(r.loDate) + ")", 14) + padL("+" + n1(r.up) + "%", 10));
    }
  }
}
L.push("");
rule();
L.push(`  끝. 생성: SIGNO / scripts/research/theme-top3-txt.mjs`);
rule();

fs.writeFileSync("SIGNO-테마별-주요종목-낙폭.txt", "﻿" + L.join("\r\n") + "\r\n");
console.log("txt", L.length, "줄");
