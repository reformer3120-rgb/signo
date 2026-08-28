// 한 종목은 한 테마에만 — 아래층을 배타 분류로 굳힌다.
//
// 왜 — 지금은 한 종목이 평균 1.71개 테마에 들어 있고, 코오롱은 9개다.
// 그 겹침의 대부분은 뒷받침 낱말 하나만 걸린 3~4점짜리 배치에서 나온다
// (규칙 배치 3,320건 중 3점이 1,418건, 4점이 547건 — 합쳐서 59%).
//
// 겹침이 특히 아픈 자리는 대표종목 뽑기다. 3점 배치에 걸리는 것은 사업이 많은
// 대형 지주사인데, 시총순으로 뽑으면 그것들이 곧장 1~3위로 올라온다. 실제로
// 소프트웨어·SI 상위 3종목이 삼성에스디에스·두산·LG 였다. 두산의 소프트웨어·SI
// 점수는 3점이고 매출 비중은 0% 다(건설기계 76% · 전자BG 16%).
//
// 그래서 아래층은 "이 회사가 무엇으로 버는가" 한 칸만 남긴다. 여러 사업을
// 하는 회사를 여러 칸에 보여주는 일은 윗층(이야기 테마)이 맡는다.
//
// ── 어느 칸을 남기나 (위에서부터 적용) ─────────────────────
//   1) 매출 비중   테마 낱말이 사업보고서 매출 부문 라벨에 걸리면 그 칸.
//                 여러 칸이 걸리면 비중이 큰 쪽. (겹치는 종목의 27% 가 여기서 갈린다)
//   2) 작업지      사람이 확인한 배치를 규칙보다 앞세운다.
//   3) 점수        낱말 근거가 많은 쪽.
//   4) 작은 칸     동점이면 종목 수가 적은 칸. 큰 칸은 뭉뚱그린 칸이라 흡수해
//                 버린다 — 풍산은 금속가공(94)이 아니라 방위산업(47),
//                 케이씨에스는 소프트웨어·SI(167)가 아니라 정보보안(63)이다.
//
// 사람이 한 번 봐야 하는 것(작업지가 여러 칸에 넣은 종목, 동점으로 갈린 것)은
// .cache/theme/exclusive-review.json 에 남긴다.
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "./dict.mjs";

const DIR = ".cache/theme";
const MIN_SHARE = 0.2; // 매출로 칸을 정하려면 적어도 이만큼은 돼야 한다
const byId = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/**
 * 사람이 손으로 못박은 것. 규칙보다 앞선다.
 * 규칙으로는 못 고치는 자리만 적는다 — 후보에 아예 없거나(BGF리테일은 유통·편의점
 * 후보가 없었다), 동점을 크기로 갈랐더니 엉뚱한 데로 간 자리(위메이드플레이).
 * 근거를 반드시 같이 적는다.
 */
const OVERRIDE = JSON.parse(fs.readFileSync(new URL("./overrides.json", import.meta.url), "utf8"));

/**
 * 매출 부문 라벨에는 표에서 줄이 갈리며 낱말 가운데 빈칸이 끼어든다.
 * 프레스티지바이오파마의 부문명이 "제품매출 바이오 시밀러 등"(100%)인데
 * 사전 낱말은 "바이오시밀러" 라 그냥은 안 걸린다.
 *
 * 그렇다고 빈칸을 통째로 지우면 안 된다 — "레거시 공정"이 "시공"이 되고
 * "CJ HOLDINGS"가 "NGS"가 되던 자리다(classify.mjs 머리말). 그래서 빈칸을
 * 눈감아 주는 것은 넉 자 이상인 낱말에만 한다. "시공"·"모듈" 같은 두 자짜리는
 * 그대로 둔다.
 */
const flexible = new Map();
function matches(label, word) {
  if (label.includes(word)) return true;
  if (word.length < 4) return false;
  let re = flexible.get(word);
  if (!re) {
    re = new RegExp([...word].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
    flexible.set(word, re);
  }
  return re.test(label);
}

/**
 * 이 종목의 매출에서 이 테마가 몇 %인가.
 * 사업보고서 매출 부문 라벨에 테마 낱말이 들어 있는 행을 더한다.
 * 라벨이 안 맞으면 판정 못 한다(null) — 못 하는 것은 못 한다고 둔다.
 */
export function salesShare(sales, code, id) {
  const rows = sales[code]?.rows;
  const t = byId[id];
  if (!rows || !t) return null;
  const words = [...(t.core ?? []), ...(t.sub ?? [])].filter((w) => w.length >= 2);
  let sum = 0;
  let hit = false;
  for (const r of rows) {
    const label = String(r.label ?? "");
    if (words.some((w) => matches(label, w))) {
      sum += r.비중 ?? 0;
      hit = true;
    }
  }
  return hit ? sum : null;
}

/**
 * classified.json 을 배타 분류로 줄인다.
 * @returns {{cls: object, review: array, stat: object}}
 */
export function makeExclusive(cls, sales) {
  const size = Object.fromEntries(Object.entries(cls).map(([id, a]) => [id, a.length]));
  const place = [];
  for (const [id, arr] of Object.entries(cls))
    for (const s of arr) place.push({ id, code: s.code, name: s.name, raw: s, score: s.manual ? 99 : s.score, manual: !!s.manual });

  const byCode = {};
  for (const p of place) (byCode[p.code] ??= []).push(p);

  const keep = new Set();
  const review = [];
  const stat = { total: Object.keys(byCode).length, multi: 0, bySales: 0, byScore: 0, byTie: 0, forced: 0 };

  // 못박은 것부터. 후보에 아예 없던 칸으로 보내는 경우가 있어(BGF리테일→유통·편의점)
  // 자리를 새로 만들어 준다.
  const injected = {};
  const forced = new Map();
  for (const o of OVERRIDE) {
    const ps = byCode[o.code];
    if (!ps) { console.warn(`  [손보기] ${o.name} ${o.code} — 분류에 없는 코드다. 건너뛴다.`); continue; }
    // 코드를 잘못 적으면 엉뚱한 회사를 옮긴다. 실제로 유진테크를 086390 으로
    // 적었다가 유니테스트를 옮길 뻔했다. 이름이 다르면 손대지 않는다.
    if (ps[0].name !== o.name) {
      console.warn(`  [손보기] ${o.code} 는 ${o.name} 이 아니라 ${ps[0].name} 이다. 건너뛴다.`);
      continue;
    }
    if (!byId[o.theme]) { console.warn(`  [손보기] ${o.name} — 없는 테마 ${o.theme}. 건너뛴다.`); continue; }
    forced.set(o.code, o.theme);
    keep.add(o.theme + "|" + o.code);
    stat.forced++;
    if (!ps.some((p) => p.id === o.theme)) {
      const src = ps[0].raw;
      (injected[o.theme] ??= []).push({ ...src, why: ["손보기"], manual: true, manualWhy: src.manualWhy ?? null });
    }
  }

  for (const [code, ps] of Object.entries(byCode)) {
    if (forced.has(code)) continue;
    if (ps.length === 1) { keep.add(ps[0].id + "|" + code); continue; }
    stat.multi++;

    // 1) 매출 비중. 곁가지 부문으로 칸이 정해지면 안 된다 — 넥센타이어가
    //    "기타 임대,렌탈 및 용역 등 4%" 한 줄 때문에 렌탈·구독으로 갔다.
    //    한국콜마는 건강기능식품 2.6%, 두산에너빌리티는 풍력 4.5% 였다.
    //    문턱 밑이면 매출로 판정하지 않고 낱말 점수로 넘긴다.
    const shared = ps.map((p) => ({ p, sh: salesShare(sales, code, p.id) }))
      .filter((x) => x.sh != null && x.sh >= MIN_SHARE);
    let win;
    let how;
    if (shared.length) {
      shared.sort((a, b) => b.sh - a.sh);
      win = shared[0].p;
      how = `매출 ${(shared[0].sh * 100).toFixed(1)}%`;
      stat.bySales++;
      // 절반도 안 되는 부문으로 칸이 정해지면 미덥지 않다. CJ제일제당이 물류
      // 43% 로 물류·운송에 갔는데 식품이 42% 다 — 정작 음식료 후보가 없었다.
      if (shared[0].sh < 0.5)
        review.push({ code, name: win.name, 정한곳: byId[win.id].name, 사유: `${how} — 절반 미만`, 후보: ps.map((p) => byId[p.id].name) });
    } else {
      // 2)+3) 작업지 우선, 그다음 점수 — score 에 작업지를 99 로 실어 두었다
      const max = Math.max(...ps.map((p) => p.score));
      const top = ps.filter((p) => p.score === max);
      if (top.length === 1) {
        win = top[0];
        how = win.manual ? "작업지" : `${max}점`;
        stat.byScore++;
      } else {
        // 4) 동점이면 작은 칸
        top.sort((a, b) => size[a.id] - size[b.id]);
        win = top[0];
        how = `${win.manual ? "작업지" : max + "점"} 동점 → 작은 칸(${size[win.id]}종목)`;
        stat.byTie++;
        review.push({
          code, name: win.name, 정한곳: byId[win.id].name, 사유: how,
          후보: top.map((p) => `${byId[p.id].name}(${size[p.id]})`),
        });
      }
    }
    keep.add(win.id + "|" + code);
    const seen = () => review.some((r) => r.code === code);
    // 작업지가 여러 칸에 넣은 종목은 사람이 다시 봐야 한다
    const manuals = ps.filter((p) => p.manual);
    if (manuals.length > 1 && !seen())
      review.push({
        code, name: win.name, 정한곳: byId[win.id].name, 사유: `작업지 ${manuals.length}칸 — ` + how,
        후보: manuals.map((p) => `${byId[p.id].name}(${size[p.id]})`),
      });
    // 작업지가 규칙과 어긋난 자리. BGF리테일이 작업지 때문에 가구·인테리어로
    // 갔는데 규칙은 음식료 7점을 가리켰다 — 작업지 쪽이 틀린 자리다.
    if (win.manual && !seen()) {
      const rule = ps.filter((p) => !p.manual).sort((a, b) => b.score - a.score)[0];
      if (rule && rule.score >= 5)
        review.push({
          code, name: win.name, 정한곳: byId[win.id].name,
          사유: `작업지가 규칙과 어긋남 — 규칙은 ${byId[rule.id].name} ${rule.score}점`,
          후보: ps.map((p) => `${byId[p.id].name}(${p.manual ? "작업지" : p.score + "점"})`),
        });
    }
  }

  const out = {};
  for (const [id, arr] of Object.entries(cls)) {
    const kept = arr.filter((s) => keep.has(id + "|" + s.code));
    if (injected[id]) kept.push(...injected[id]);
    if (kept.length) out[id] = kept;
  }
  for (const [id, arr] of Object.entries(injected)) if (!out[id]) out[id] = arr;
  return { cls: out, review, stat };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const cls = JSON.parse(fs.readFileSync(path.join(DIR, "classified.json"), "utf8"));
  const sales = JSON.parse(fs.readFileSync(path.join(DIR, "sales.json"), "utf8"));
  const before = Object.values(cls).reduce((a, x) => a + x.length, 0);
  const { cls: ex, review, stat } = makeExclusive(cls, sales);
  const after = Object.values(ex).reduce((a, x) => a + x.length, 0);
  fs.writeFileSync(path.join(DIR, "exclusive-review.json"), JSON.stringify(review, null, 1));

  console.log(`배치 ${before} → ${after}  (종목 ${stat.total}, 평균 소속 ${(before / stat.total).toFixed(2)} → 1.00)`);
  console.log(`겹쳤던 종목 ${stat.multi} — 매출로 ${stat.bySales} · 점수로 ${stat.byScore} · 동점 ${stat.byTie}`);
  console.log(`사람이 볼 것 ${review.length}건 → ${path.join(DIR, "exclusive-review.json")}`);

  const rows = Object.entries(ex).map(([id, a]) => ({ name: byId[id].name, n: a.length, was: cls[id].length }))
    .sort((a, b) => a.n - b.n);
  const small = rows.filter((r) => r.n < 10);
  console.log(`\n10종목 미만이 된 칸 ${small.length}개`);
  small.forEach((r) => console.log(`  ${r.name.padEnd(22)} ${r.was} → ${r.n}`));
  console.log(`\n가장 크게 준 칸 10`);
  [...rows].sort((a, b) => (a.n / a.was) - (b.n / b.was)).slice(0, 10)
    .forEach((r) => console.log(`  ${r.name.padEnd(22)} ${r.was} → ${r.n}`));
  const gone = Object.keys(cls).filter((id) => !ex[id]);
  if (gone.length) console.log(`\n빈 칸이 된 테마: ${gone.map((id) => byId[id].name).join(", ")}`);
}
