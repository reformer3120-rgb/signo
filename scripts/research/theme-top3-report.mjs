// top3-metrics.json → CSV + 마크다운 표
import fs from "node:fs";
const m = JSON.parse(fs.readFileSync(".cache/theme/top3-metrics.json", "utf8"));
const fmtD = (s) => (s ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}` : "");
const n1 = (x) => (x == null ? "" : x.toFixed(1));
const won = (x) => (x == null ? "" : x.toLocaleString("ko-KR"));
const cap = (x) => (x == null ? "" : x >= 10000 ? `${(x/10000).toFixed(1)}조` : `${x.toLocaleString("ko-KR")}억`);
const asOf = fmtD(m.asOf);

// CSV
const head = ["그룹","테마","종목명","코드","시가총액(억원)","종가","52주 고점","고점일","고점대비 하락률(%)","3개월 저점","저점일","저점대비 상승률(%)"];
const lines = [head.join(",")];
for (const r of m.rows) {
  lines.push([r.theme.group, r.theme.name, r.s.name, r.s.code, r.s.cap ?? "",
    r.price ?? "", r.hi ?? "", fmtD(r.hiDate), n1(r.dd), r.lo ?? "", fmtD(r.loDate), n1(r.up)]
    .map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : v)).join(","));
}
fs.writeFileSync("SIGNO-테마별-주요종목-낙폭.csv", "﻿" + lines.join("\r\n") + "\r\n");

// 마크다운
const groups = [...new Set(m.rows.map((r) => r.theme.group))];
const md = [];
md.push(`# 테마별 주요종목 낙폭·반등 (${asOf} 종가 기준)`);
md.push("");
md.push(`- 테마 ${new Set(m.rows.map(r=>r.theme.id)).size}개 × 시가총액 상위 3종목 = ${m.rows.length}행 (중복 상장 포함).`);
md.push(`- **고점대비 하락률** = 최근 52주(250거래일) 장중 최고가 대비 ${asOf} 종가.`);
md.push(`- **저점대비 상승률** = 최근 3개월(62거래일) 장중 최저가 대비 ${asOf} 종가.`);
md.push(`- 시세: 네이버 일봉(수정주가). 시가총액: 네이버 종목 통합 API.`);
md.push("");
md.push("본 자료의 지표는 투자 참고용이며, 투자의 최종 책임은 투자자 본인에게 있습니다.");
md.push("");
// 요약: 테마 평균
const byTheme = new Map();
for (const r of m.rows) {
  const k = r.theme.id;
  if (!byTheme.has(k)) byTheme.set(k, { t: r.theme, dd: [], up: [] });
  if (r.dd != null) byTheme.get(k).dd.push(r.dd);
  if (r.up != null) byTheme.get(k).up.push(r.up);
}
const avg = (a) => (a.length ? a.reduce((s,v)=>s+v,0)/a.length : null);
const summary = [...byTheme.values()].map((v) => ({ t: v.t, dd: avg(v.dd), up: avg(v.up) }));
md.push("## 한눈에 — 테마 평균 (주요 3종목 평균)");
md.push("");
md.push("### 고점에서 가장 많이 빠진 테마 10");
md.push("");
md.push("| 테마 | 그룹 | 고점대비 | 저점대비 |");
md.push("|---|---|--:|--:|");
for (const s of [...summary].sort((a,b)=>a.dd-b.dd).slice(0,10))
  md.push(`| ${s.t.name} | ${s.t.group} | ${n1(s.dd)}% | +${n1(s.up)}% |`);
md.push("");
md.push("### 저점에서 가장 많이 오른 테마 10");
md.push("");
md.push("| 테마 | 그룹 | 저점대비 | 고점대비 |");
md.push("|---|---|--:|--:|");
for (const s of [...summary].sort((a,b)=>b.up-a.up).slice(0,10))
  md.push(`| ${s.t.name} | ${s.t.group} | +${n1(s.up)}% | ${n1(s.dd)}% |`);
md.push("");
md.push("### 고점 근처를 지키는 테마 10 (낙폭이 가장 작은 쪽)");
md.push("");
md.push("| 테마 | 그룹 | 고점대비 | 저점대비 |");
md.push("|---|---|--:|--:|");
for (const s of [...summary].sort((a,b)=>b.dd-a.dd).slice(0,10))
  md.push(`| ${s.t.name} | ${s.t.group} | ${n1(s.dd)}% | +${n1(s.up)}% |`);
md.push("");
md.push("## 테마별 상세");
for (const g of groups) {
  md.push("");
  md.push(`### ${g}`);
  const ths = [...new Set(m.rows.filter((r) => r.theme.group === g).map((r) => r.theme.id))];
  for (const id of ths) {
    const rows = m.rows.filter((r) => r.theme.id === id);
    md.push("");
    md.push(`#### ${rows[0].theme.name}`);
    md.push("");
    md.push("| 종목 | 코드 | 시총 | 종가 | 52주 고점 (일자) | 고점대비 | 3개월 저점 (일자) | 저점대비 |");
    md.push("|---|---|--:|--:|--:|--:|--:|--:|");
    for (const r of rows) {
      if (r.err) { md.push(`| ${r.s.name} | ${r.s.code} | ${cap(r.s.cap)} | — | — | — | — | — |`); continue; }
      md.push(`| ${r.s.name} | ${r.s.code} | ${cap(r.s.cap)} | ${won(r.price)} | ${won(r.hi)} (${fmtD(r.hiDate)}) | ${n1(r.dd)}% | ${won(r.lo)} (${fmtD(r.loDate)}) | +${n1(r.up)}% |`);
    }
  }
}
md.push("");
fs.writeFileSync("SIGNO-테마별-주요종목-낙폭.md", md.join("\n"));
console.log("CSV", lines.length - 1, "행 · MD", md.length, "줄 · 기준일", asOf);
