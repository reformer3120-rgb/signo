// top3-metrics.json → 마크다운 · CSV · 텍스트 세 벌.
//
// 대분류(12) 안에 소분류(91), 그 안에 시가총액 상위 3종목을 둔다.
// 아래층이 배타 분류라 한 종목은 한 칸에만 들어간다 — 273행이 모두 다른 종목이다.
// 그 사실을 스스로 확인하고 파일 머리에 적는다.
//
// 실행
//   node scripts/research/theme-top3-drawdown.mjs   (시세 수집 · 계산)
//   node scripts/research/theme-top3-report.mjs     (이 파일)
import fs from "node:fs";

const M = JSON.parse(fs.readFileSync(".cache/theme/top3-metrics.json", "utf8"));
const OUT = "SIGNO-테마별-주요종목-낙폭";

const fmtD = (s) => (s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : "");
const n1 = (x) => (x == null ? "—" : x.toFixed(1));
const sgn = (x) => (x == null ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(1)}`);
const won = (x) => (x == null ? "—" : x.toLocaleString("ko-KR"));
const cap = (x) => (x == null ? "—" : x >= 10000 ? `${(x / 10000).toFixed(1)}조` : `${x.toLocaleString("ko-KR")}억`);
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const asOf = fmtD(M.asOf);

/* ── 대분류 → 소분류로 묶는다 ─────────────────────────────── */
const themes = new Map(); // 소분류
for (const r of M.rows) {
  const k = r.theme.id;
  if (!themes.has(k)) themes.set(k, { ...r.theme, rows: [] });
  themes.get(k).rows.push(r);
}
const groups = new Map(); // 대분류
for (const t of themes.values()) {
  if (!groups.has(t.group)) groups.set(t.group, { name: t.group, themes: [] });
  groups.get(t.group).themes.push(t);
}
const stat = (rows) => ({
  dd: avg(rows.map((r) => r.dd).filter((v) => v != null)),
  up: avg(rows.map((r) => r.up).filter((v) => v != null)),
});
for (const t of themes.values()) Object.assign(t, stat(t.rows));
for (const g of groups.values()) {
  g.rows = g.themes.flatMap((t) => t.rows);
  Object.assign(g, stat(g.rows));
  g.themes.sort((a, b) => a.dd - b.dd); // 많이 빠진 소분류를 앞에
}
const groupList = [...groups.values()].sort((a, b) => a.dd - b.dd);
const themeList = [...themes.values()];

/* ── 겹침 점검. 배타 분류라 0이어야 한다 ───────────────────── */
const seen = new Map();
for (const r of M.rows) seen.set(r.s.code, (seen.get(r.s.code) ?? 0) + 1);
const dup = [...seen.entries()].filter(([, n]) => n > 1);
const missing = M.rows.filter((r) => r.err).length;

/* ── CSV ──────────────────────────────────────────────────── */
const head = [
  "대분류", "소분류", "종목명", "코드", "시가총액(억원)", "종가",
  "52주 고점", "고점일", "고점대비 하락률(%)",
  "3개월 저점", "저점일", "저점대비 상승률(%)",
];
const csv = [head.join(",")];
for (const g of groupList)
  for (const t of g.themes)
    for (const r of t.rows)
      csv.push(
        [g.name, t.name, r.s.name, r.s.code, r.s.cap ?? "", r.price ?? "",
         r.hi ?? "", fmtD(r.hiDate), r.dd == null ? "" : r.dd.toFixed(1),
         r.lo ?? "", fmtD(r.loDate), r.up == null ? "" : r.up.toFixed(1)]
          .map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v))
          .join(","),
      );
fs.writeFileSync(`${OUT}.csv`, "﻿" + csv.join("\r\n") + "\r\n");

/* ── 마크다운 ─────────────────────────────────────────────── */
const L = [];
L.push(`# 테마별 주요종목 낙폭·반등 (${asOf} 종가 기준)`);
L.push("");
L.push(`대분류 **${groupList.length}개** → 소분류 **${themeList.length}개** → 각 시가총액 상위 **3종목** = **${M.rows.length}행**`);
L.push("");
L.push(`- **겹치는 종목 ${dup.length}개** — 아래층이 배타 분류라 한 종목은 한 칸에만 든다. ${M.rows.length}행이 모두 다른 종목이다.`);
L.push(`- **고점대비 하락률** = 최근 52주(250거래일) 장중 최고가 대비 ${asOf} 종가`);
L.push(`- **저점대비 상승률** = 최근 3개월(62거래일) 장중 최저가 대비 ${asOf} 종가`);
L.push(`- 주요종목 = 그 소분류의 시가총액 상위 3종목`);
L.push(`- 시세는 네이버 일봉(수정주가), 시가총액은 네이버 종목 통합 API${missing ? ` · 시세를 못 받은 종목 ${missing}개는 —` : ""}`);
L.push("");
L.push("본 자료의 지표는 투자 참고용이며, 투자의 최종 책임은 투자자 본인에게 있습니다.");
L.push("");

L.push("## 대분류 한눈에");
L.push("");
L.push("| 대분류 | 소분류 | 종목 | 고점대비 | 저점대비 |");
L.push("|---|--:|--:|--:|--:|");
for (const g of groupList)
  L.push(`| **${g.name}** | ${g.themes.length} | ${g.rows.length} | ${n1(g.dd)}% | +${n1(g.up)}% |`);
L.push("");

const top = (title, arr, cols) => {
  L.push(`### ${title}`);
  L.push("");
  L.push("| 소분류 | 대분류 | 고점대비 | 저점대비 |");
  L.push("|---|---|--:|--:|");
  for (const t of arr) L.push(`| ${t.name} | ${t.group} | ${n1(t.dd)}% | +${n1(t.up)}% |`);
  L.push("");
  void cols;
};
L.push("## 소분류 한눈에");
L.push("");
top("고점에서 가장 많이 빠진 10", [...themeList].sort((a, b) => a.dd - b.dd).slice(0, 10));
top("저점에서 가장 많이 오른 10", [...themeList].sort((a, b) => b.up - a.up).slice(0, 10));
top("고점 근처를 지키는 10", [...themeList].sort((a, b) => b.dd - a.dd).slice(0, 10));

L.push("## 상세");
for (const g of groupList) {
  L.push("");
  L.push(`### ${g.name}`);
  L.push("");
  L.push(`소분류 ${g.themes.length}개 · ${g.rows.length}종목 · 고점대비 평균 **${n1(g.dd)}%** · 저점대비 평균 **+${n1(g.up)}%**`);
  for (const t of g.themes) {
    L.push("");
    L.push(`#### ${t.name}  <sub>고점대비 ${n1(t.dd)}% · 저점대비 +${n1(t.up)}%</sub>`);
    L.push("");
    L.push("| 종목 | 코드 | 시총 | 종가 | 52주 고점 (일자) | 고점대비 | 3개월 저점 (일자) | 저점대비 |");
    L.push("|---|---|--:|--:|--:|--:|--:|--:|");
    for (const r of t.rows) {
      if (r.err) { L.push(`| ${r.s.name} | ${r.s.code} | ${cap(r.s.cap)} | — | — | — | — | — |`); continue; }
      L.push(
        `| ${r.s.name} | ${r.s.code} | ${cap(r.s.cap)} | ${won(r.price)} | ${won(r.hi)} (${fmtD(r.hiDate)}) | ${n1(r.dd)}% | ${won(r.lo)} (${fmtD(r.loDate)}) | +${n1(r.up)}% |`,
      );
    }
  }
}
L.push("");
fs.writeFileSync(`${OUT}.md`, L.join("\n"));

/* ── 텍스트 (고정폭) ──────────────────────────────────────── */
const w = (s) => [...String(s)].reduce((a, c) => a + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(c) ? 2 : 1), 0);
const padR = (s, n) => String(s) + " ".repeat(Math.max(0, n - w(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - w(s))) + String(s);
const T = [];
const rule = (c = "=", n = 108) => T.push(c.repeat(n));

rule();
T.push(`  테마별 주요종목 낙폭 · 반등   (${asOf} 종가 기준)`);
rule();
T.push("");
T.push(`  대분류 ${groupList.length}개 → 소분류 ${themeList.length}개 → 각 시가총액 상위 3종목 = ${M.rows.length}행`);
T.push(`  겹치는 종목 ${dup.length}개 — 한 종목은 한 칸에만 든다`);
T.push("");
T.push(`  고점대비 하락률 : 최근 52주(250거래일) 장중 최고가 대비 ${asOf} 종가`);
T.push(`  저점대비 상승률 : 최근 3개월(62거래일) 장중 최저가 대비 ${asOf} 종가`);
T.push(`  시세 = 네이버 일봉(수정주가) / 시가총액 = 네이버 종목 통합 API`);
T.push("");
T.push("  본 자료의 지표는 투자 참고용이며, 투자의 최종 책임은 투자자 본인에게 있습니다.");
T.push("");
rule("-");
T.push("  [ 대분류 한눈에 ]");
rule("-");
T.push("  " + padR("대분류", 16) + padL("소분류", 8) + padL("종목", 8) + padL("고점대비", 12) + padL("저점대비", 12));
T.push("  " + "-".repeat(56));
for (const g of groupList)
  T.push("  " + padR(g.name, 16) + padL(g.themes.length, 8) + padL(g.rows.length, 8) +
    padL(n1(g.dd) + "%", 12) + padL("+" + n1(g.up) + "%", 12));
T.push("");
rule("-");
T.push("  [ 상세 ]  ■ 대분류   ▷ 소분류");
rule("-");
const HEAD = "    " + padR("종목", 20) + padR("코드", 8) + padL("시총", 9) + padL("종가", 12) +
  padL("52주고점", 12) + padR("  (일자)", 14) + padL("고점대비", 10) +
  padL("3개월저점", 12) + padR("  (일자)", 14) + padL("저점대비", 10);
for (const g of groupList) {
  T.push("");
  T.push(`■ ${g.name}   소분류 ${g.themes.length} · ${g.rows.length}종목 · 고점대비 ${n1(g.dd)}% · 저점대비 +${n1(g.up)}%`);
  for (const t of g.themes) {
    T.push("");
    T.push(`  ▷ ${t.name}   (고점대비 ${n1(t.dd)}% · 저점대비 +${n1(t.up)}%)`);
    T.push(HEAD);
    T.push("    " + "-".repeat(119));
    for (const r of t.rows) {
      if (r.err) { T.push("    " + padR(r.s.name, 20) + padR(r.s.code, 8) + padL(cap(r.s.cap), 9) + "   (시세 없음)"); continue; }
      T.push("    " + padR(r.s.name, 20) + padR(r.s.code, 8) + padL(cap(r.s.cap), 9) + padL(won(r.price), 12) +
        padL(won(r.hi), 12) + padR("  (" + fmtD(r.hiDate) + ")", 14) + padL(n1(r.dd) + "%", 10) +
        padL(won(r.lo), 12) + padR("  (" + fmtD(r.loDate) + ")", 14) + padL("+" + n1(r.up) + "%", 10));
    }
  }
}
T.push("");
rule();
fs.writeFileSync(`${OUT}.txt`, "﻿" + T.join("\r\n") + "\r\n");

console.log(`대분류 ${groupList.length} · 소분류 ${themeList.length} · ${M.rows.length}행 · 기준일 ${asOf}`);
console.log(`겹치는 종목 ${dup.length}${dup.length ? " ← 배타 분류가 깨졌다" : ""} · 시세 결측 ${missing}`);
console.log(`→ ${OUT}.md · ${OUT}.csv · ${OUT}.txt`);
void sgn;
