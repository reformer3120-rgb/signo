// 개요 카드가 쓸 것들을 하나로 굳힌다 — 매출 구성과 대량보유자.
//
// ── 설립 연도는 싣지 않는다 ────────────────────────────────
// 처음에는 넣었다가 뺐다. 셋이 걸렸다.
//   커버리지 54%   1,343/2,496. 칩이 있다 없다 하면 없는 종목이 빠진 것처럼 보인다.
//   연혁은 문장에  의미가 생기는 것은 설립 연도가 아니라 그 뒤의 사건이고,
//                 사업보고서에 적힌 회사는 개요 문장이 이미 담는다
//                 (셀트리온 "2023년 12월 셀트리온헬스케어를 합병").
//   판단에 안 쓰임 "1973년 설립"이 삼성전기를 볼 때 바꾸는 것이 별로 없다.
// 받아 둔 company.json 은 지운 것이 아니라 그대로 둔다 — 연혁을 제대로 다룰
// 일이 생기면 그때 쓴다.
//
// 모으는 것과 굳히는 것을 나눈 이유는 themes.json·about.json 과 같다.
// 원문 39MB 를 배포에 실을 수 없으므로 만든 결과만 커밋한다.
//
// ── 조각을 몇 개까지 보이나 ────────────────────────────────
// 조각 수 중앙이 2 이고 9할이 4 이하다. 넷을 넘는 것은 110종목뿐이라
// 상위 넷만 두고 나머지를 "그 밖" 으로 묶는다. 범례가 길어지면 폰에서
// 카드가 통째로 길어진다.
//
// ── 외국인 조각은 여기서 만들지 않는다 ──────────────────────
// 외국인 보유비중은 시세와 함께 움직여 하루에도 바뀐다. 굳혀 두면 낡는다.
// 화면이 그릴 때 시세에서 받아 합친다. 여기서는 대량보유자가 외국계인지만
// 표시해 둔다 — 그래야 화면이 "외국인 25.4% (블랙록 7.1% 포함)" 처럼
// 겹침을 밝힐 수 있다.
//
// 실행
//   node scripts/theme/build-profile.mjs   → src/data/profile.json
import fs from "node:fs";
import path from "node:path";
import { 실체풀기 } from "./entity.mjs";

const DIR = ".cache/theme";
const OUT = "src/data/profile.json";
const MAX조각 = 4;

const 읽기 = (p, 기본) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : 기본);
const segments = 읽기(path.join(DIR, "segments.json"), {});
const holders = 읽기(path.join(DIR, "holders.json"), {});
const largest = 읽기(path.join(DIR, "largest.json"), {});
const 매출액 = 읽기(path.join(DIR, "revenue.json"), {});
// 재무 API 가 안 주는 회사(코넥스·비상장·상장폐지)는 사업보고서 원문의
// 요약재무정보에서 읽어 둔 것을 쓴다 — collect-revenue.mjs --원문
const 원문매출 = 읽기(path.join(DIR, "revenue-doc.json"), {});
const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const 종목 = themes.themes.flatMap((t) => t.stocks);

// 매출 표가 아닌 표를 가리는 규칙은 한 곳에 모아 두었다 — 뽑는 쪽
// (collect-segments.mjs)도 같은 것을 본다.
import {
  눌러, 매출표아님, 기대배수, 손익표, 합계행, 상계행, 머리글, 밋밋, 주식표, 종속표, 지역표,
} from "./매출표.mjs";


/**
 * 화면에 쓸 라벨을 다듬는다.
 *
 * 사업보고서 표에는 글자를 하나씩 떼어 놓은 칸이 흔하다.
 *   「상 품 매 출」 「기 타」 「수 출」
 * 낱자만으로 이루어졌으면 도로 붙인다. 그래야 읽히고, 걸러 내는 잣대에도
 * 제대로 걸린다.
 */
function 라벨다듬기(name) {
  let t = 실체풀기(name).replace(/[\s ]+/g, " ").trim();
  const 토막 = t.split(" ");
  // 한 글자짜리 토막이 섞여 있으면 표에서 글자가 흩어진 것이다.
  //   「상 품 매 출」 「원소재가 공」 「기 타」
  // 한글로만 된 라벨일 때만 붙인다 — 「제주 톡쏘다」 처럼 멀쩡한 띄어쓰기를
  // 건드리지 않으려고.
  if (토막.length >= 2 && 토막.some((w) => w.length === 1)
      && /^[가-힣\s]+$/.test(t)) t = 토막.join("");
  return t.replace(/\s*:\s*/g, ": ").trim();
}

/** 무슨 사업인지 알려 주는 라벨인가 */
function 알맹이(name) {
  const x = 눌러(name);
  if (x.length < 2) return false;
  if (밋밋.test(x) || 주식표.test(x) || 종속표.test(x) || 지역표.test(x)) return false;
  if (/^[A-Z]$/.test(x)) return false;              // A · B · C
  if (/^[\d.,%\-()※]+$/.test(x)) return false;       // (1) · ------------
  return true;
}

/**
 * 매출 구성 — 상위 넷 + 그 밖. 백분율로 굳혀 화면이 다시 계산하지 않게 한다.
 *
 * ── 엉뚱한 표를 걸러 낸다 ──────────────────────────────────
 * 표 제목으로 찾아 와도 다른 표가 걸린다. 라벨을 보면 드러난다.
 *   보통주 83.9% · 우선주 16.1%                 주식의 총수 표
 *   상장 50% · 비상장 50%                       종속회사 현황 표
 *   수출 64.9% · 내수 21.1%                     지역별 매출 표
 *   사업목적정비(삭제) 75% · 사업목적 추가 25%   정관 변경 표
 * 한 라벨만 걸리는 것으로는 안 버린다 — 주성코퍼레이션은 「물류 82.4% ·
 * 통신네트워크 16.9% · 연결(국내) 0.3%」 라 셋째 줄만 종속회사 말이다.
 *
 * ── 매출유형별은 안 쓴다 ──────────────────────────────────
 * 「제품 87.2% · 상품 2.4% · 기타 10.4%」 는 무슨 사업인지 하나도 알려 주지
 * 않는다. 원형을 그리려던 까닭이 「이 회사가 어디서 돈을 버나」 였으므로
 * 알맹이 있는 라벨이 하나도 없으면 그리지 않는다.
 */
function 매출(code) {
  const v = segments[code];
  if (!v?.rows?.length || v.rows.length < 2) return null;

  if (매출표아님(v.rows.map((r) => r.label), v.rows.length)) return null;

  // 합계 행은 조각에서 뺀다
  const 알짜 = v.rows.filter((r) => {
    const x = 눌러(r.label);
    return !합계행.test(x) && !손익표.test(x) && !머리글.test(x) && !상계행.test(x);
  });
  if (알짜.length < 2) return null;

  const 합 = 알짜.reduce((a, r) => a + r.v, 0);
  if (합 <= 0) return null;
  const 몫 = (x) => +((100 * x) / 합).toFixed(1);

  // 알맹이 있는 조각이 한 톨도 없으면 그릴 뜻이 없다
  if (!알짜.some((r) => 알맹이(r.label) && 몫(r.v) >= 5)) return null;

  // 조각이 다 같은 크기면 표에 숫자가 없어 고르게 나눈 것이다 — 목록이지
  // 구성이 아니다. 한울앤제주가 제품 열둘을 8.3% 씩 늘어놓았다.
  if (알짜.length >= 3) {
    const 값 = 알짜.map((r) => r.v);
    if (Math.max(...값) - Math.min(...값) <= Math.max(...값) * 0.02) return null;
  }

  const 상위 = 알짜.slice(0, MAX조각).map((r) => ({
    name: 라벨다듬기(r.label),
    pct: 몫(r.v),
  }));
  const 밖 = 알짜.slice(MAX조각).reduce((a, r) => a + r.v, 0);
  // 0.1% 도 안 되는 "그 밖" 은 조각으로 두지 않는다 — 범례만 한 줄 늘린다
  if (밖 > 0 && 몫(밖) >= 0.1) 상위.push({ name: "그 밖", pct: 몫(밖) });

  // 한 조각이 99% 를 넘으면 원형이 아니라 동그라미다
  if (상위.some((r) => r.pct >= 99)) return null;

  // 조각의 합이 그 해 매출액과 맞는지 표시해 둔다.
  //
  // 맞으면 「매출 구성」 이라 불러도 된다. 매출액을 모르면 이 표가 정말 매출
  // 표인지 확인할 길이 없으므로 화면이 「사업 구성」 이라 부른다 — 사업부문이
  // 무엇무엇인지는 맞고, 그 비율이 매출 비중인지까지는 장담하지 않는다는 뜻이다.
  const 원 = 매출액[code] > 0 ? 매출액[code] : (원문매출[code] ?? 0);
  const 합원 = v.rows.reduce((a, r) => a + r.v, 0) * (v.단위 ?? 1);
  const 비 = 원 > 0 ? 합원 / 원 : null;
  // 어느 보고서에서 뽑았는지 알고 있으니 기대 배수를 그에 맞춘다. 그 규칙은
  // 뽑는 쪽과 같은 것을 봐야 한다 — 한쪽만 넓혔더니 뽑히기는 하는데 검증은
  // 안 되는 종목이 147 생겼다.
  const 배수 = 기대배수(v.report);
  const 검증 = 비 !== null && 배수.some((k) => 비 >= k * 0.7 && 비 <= k * 1.45);

  return { rows: 상위, asOf: v.asOf ?? null, report: v.report ?? null, 검증 };
}
/**
 * 이름을 견주기 좋게 다듬는다.
 *
 * 같은 회사를 두고 공시마다 다르게 적는다. 회사 꼴을 먼저 떼고 나서
 * 괄호와 띄어쓰기를 지워야 둘이 같아진다.
 *   (주)셀트리온홀딩스  ┐
 *   주식회사 셀트리온홀딩스 ┴→ 셀트리온홀딩스
 */
const 이름꼴 = (s) =>
  String(s ?? "")
    .replace(/\(주\)|\(유\)|㈜|㈜|주식회사|유한회사/g, "")
    .replace(/[()（）\s]/g, "");

/**
 * 주주 조각 — 최대주주(및 특수관계인) + 대량보유자.
 *
 * ── 최대주주를 따로 받아 오는 이유 ─────────────────────────
 * 대량보유상황보고(5%룰)는 '보유 상황이 바뀌었을 때' 내는 공시라, 지분을
 * 쥐고 가만히 있는 지배주주는 최근 목록에 안 뜬다.
 *   삼성전기  대량보유만 보면 국민연금 9.87 · 블랙록 5.01 뿐이고
 *             실제 최대주주 삼성전자 23.69% 가 통째로 빠졌다
 * 그래서 사업보고서의 최대주주 현황(hyslrSttus)을 따로 받아 맨 앞에 둔다.
 *
 * 겹치는 이름은 뺀다. 최대주주가 대량보유 공시에도 이름을 올린 경우가
 * 있어서, 그대로 두면 같은 지분을 두 번 센다.
 */
function 주주(code) {
  const rows = holders[code]?.rows ?? [];
  const 최대 = largest[code];
  const 조각 = [];

  // DART 이름에는 줄바꿈이 든 것이 있다 — 「주식회사↵케이피엠테크」
  const 이름다듬기 = (s) => String(s ?? "").replace(/[\s\u00a0]+/g, " ").trim();

  if (최대?.pct > 0) {
    const 본인이름 = 이름다듬기(최대.name);
    조각.push({
      name: 최대.인원 > 1 ? `${본인이름} 외 ${최대.인원 - 1}인` : 본인이름,
      pct: 최대.pct,
      // 최대주주 현황표에는 국적 칸이 없다. 대량보유 쪽에 같은 이름이
      // 외국계로 적혀 있을 때만 외국계로 본다.
      foreign: rows.some((r) => 이름꼴(r.name) === 이름꼴(최대.name) && r.foreign === true),
      구분: "최대주주",
    });
  }

  const 쓴이름 = new Set([이름꼴(최대?.name)]);
  let 합 = 조각[0]?.pct ?? 0;
  for (const r of rows) {
    if (조각.length >= 4) break;
    if (쓴이름.has(이름꼴(r.name))) continue;
    // 5%룰 공시는 '본인 + 특별관계자' 를 합쳐 낸다. 그래서 최대주주 쪽 합계와
    // 거의 같은 값이 다른 이름으로 또 들어온다.
    //   삼성전자  최대주주 삼성생명보험 외 18인 19.84%
    //             대량보유 삼성물산 19.69%  ← 같은 지분을 삼성물산이 대표로 낸 것
    // 이름이 달라 못 거르므로 값으로 거른다.
    if (최대?.pct > 0 && Math.abs(r.pct - 최대.pct) <= 1) continue;
    // 이름도 값도 안 맞는데 겹치는 것들이 남는다. 영문·국문 표기가 갈린
    // 같은 투자자, 계열사가 저마다 대표로 낸 그룹 공시가 그렇다.
    //   클래시스  BCPE Centur Investments, LP 54.16
    //             비씨피이 센츄어인베스트먼츠, 엘피 68.13  ← 같은 곳
    //   KG모빌리티 KG에코솔루션 외 9인 60.85 / KG케미칼 49
    // 어느 쪽이 겹쳤는지 가릴 길이 없으므로, 합이 100을 넘게 만드는 조각은
    // 넣지 않는다. 덜 보여 줄지언정 없는 지분을 그리지는 않는다.
    if (합 + r.pct > 100) continue;
    합 += r.pct;
    쓴이름.add(이름꼴(r.name));
    조각.push({
      name: 이름다듬기(r.name),
      pct: r.pct,
      // 국적은 공시의 국적 칸에서 읽은 것이다. 이름으로 가르지 않았다.
      foreign: r.foreign === true,
      구분: r.구분 ?? null,
    });
  }

  if (!조각.length) return null;
  return { rows: 조각, asOf: 최대?.asOf ?? rows[0]?.asOf ?? null };
}

const out = {};
let 매출수 = 0, 주주수 = 0;
for (const s of 종목) {
  const m = 매출(s.code);
  const h = 주주(s.code);
  if (!m && !h) continue;
  if (m) 매출수++;
  if (h) 주주수++;
  out[s.code] = { ...(m ? { 매출: m } : {}), ...(h ? { 주주: h } : {}) };
}

fs.writeFileSync(OUT, JSON.stringify(out));
const 원형둘 = Object.values(out).filter((v) => (v.매출?.rows.length ?? 0) >= 2 && v.주주).length;
console.log(`종목 ${Object.keys(out).length} / ${종목.length}`);
console.log(`  매출 구성 ${매출수} · 대량보유자 ${주주수}`);
console.log(`  원형 둘 다 서는 종목 ${원형둘}`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
