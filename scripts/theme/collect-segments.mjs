// 사업부문별 매출을 표 구조 그대로 읽는다.
//
// ── 왜 다시 만드나 ────────────────────────────────────────
// sales.json 은 테마 분류에는 충분했지만 화면에 낼 품질이 아니었다. 원형
// 그래프로 띄우자마자 드러났다.
//
//   셀트리온     "및 용역 등 CT-P13 바이오시밀러 외"   ← 세 칸이 붙었다
//   링크제니시스  "중국外 63% · 대만 13% · 북미 7%"     ← 지역별 표를 긁었다
//   노타         "다음과 같습니다. 구분 도 도 고객 A"   ← 환율 민감도 표
//
// 원인은 태그를 지운 글에서 낱말을 걸어 읽은 것이다. 컬럼 경계가 사라지니
// 이어붙고, 어느 표에서 왔는지도 알 수 없다.
//
// ── 표를 표로 읽는다 ──────────────────────────────────────
// 매출실적표는 머리글이 정해져 있다.
//
//   <TH>사업부문</TH> <TH>매출유형</TH> <TH>품 목</TH> <TH>제35기</TH> …
//
// 머리글로 표를 고르고, 컬럼 자리로 값을 집는다. 옆 칸이 딸려 올 수 없다.
//
// ── 병합을 풀어야 한다 ────────────────────────────────────
// 사업부문 칸은 ROWSPAN 으로 묶여 있다. 둘째 행에는 그 칸이 아예 없다.
//
//   <TD ROWSPAN="2">바이오의약품</TD> <TD>제품 및 용역 등</TD> …
//   <TD>기타</TD> <TD>기타</TD> …      ← 사업부문 자리가 비어 있다
//
// 그대로 읽으면 "기타" 가 사업부문이 된다. 위에서 이어받아야 한다.
//
// 실행
//   node scripts/theme/collect-segments.mjs             이어서 모은다
//   node scripts/theme/collect-segments.mjs --limit 40  앞 40종목만
import fs from "node:fs";
import path from "node:path";
import { 공시목록, 원문글, 한도넘었나, 셈 } from "./dart.mjs";
import { 매출표아님, 알짜조각, 기대배수 } from "./매출표.mjs";

const DIR = ".cache/theme";
const OUT = path.join(DIR, "segments.json");
const 인자 = (n, 기본) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : 기본; };
const LIMIT = 인자("--limit", Infinity);
// 한 종목만 다시 뽑아 본다 — 규칙을 고친 뒤 확인할 때 쓴다
// 어느 잣대로 받은 것인지 남겨 둔다. 잣대를 고치면 이 수를 올리고
// --묵은것 으로 돌리면 옛 잣대로 받은 것만 다시 받는다. 호출 한도가 빠듯해
// 한 번에 다 못 돌릴 때 쓸모가 있다.
const 판 = 12;
const 약한것만 = process.argv.includes("--약한것");
const 묵은것만 = process.argv.includes("--묵은것");
const 왜 = process.argv.includes("--왜");
const ONLY = (() => { const i = process.argv.indexOf("--only"); return i > 0 ? process.argv[i + 1] : null; })();

const 읽기 = (p, 기본) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : 기본);
const out = 읽기(OUT, {});
const corp = 읽기(path.join(DIR, "corp.json"), {});
const 코드 = {};
for (const v of Object.values(corp)) if (v?.code) 코드[v.code] = v.corp;
const themes = JSON.parse(fs.readFileSync("src/data/themes.json", "utf8"));
const 종목 = themes.themes.flatMap((t) => t.stocks).filter((s) => 코드[s.code]);

const 글 = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
/**
 * 칸에서 금액을 읽는다.
 *
 * 그냥 Number() 로는 안 된다. 실제 칸은 이렇게 생겼다.
 *   "21,094(14,745)"  원화 뒤에 괄호로 외화를 적는다 (딜리)
 *   "△1,234"          음수를 세모로 적는다
 *   "74.4%"           비중을 적은 칸
 *   "-"               값 없음
 * 앞머리의 수만 집는다.
 */
const 돈 = (s) => {
  const m = String(s ?? "").trim().match(/^[△▲▽▼-]?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return NaN;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return /^[△▲▽▼-]/.test(String(s).trim()) ? -n : n;
};

/** 표 한 덩이를 행×칸 배열로 편다. ROWSPAN·COLSPAN 을 풀어 자리를 맞춘다. */
function 표풀기(tbl) {
  const rows = [];
  const 이월 = []; // {값, 남음} — 아래로 이어지는 칸
  for (const m of tbl.matchAll(/<TR\b[^>]*>([\s\S]*?)<\/TR>/gi)) {
    const 칸 = [];
    let 자리 = 0;
    const 남은것 = [...(m[1].matchAll(/<T[DHUE]\b([^>]*)>([\s\S]*?)<\/T[DHUE]>/gi))];
    let 다음 = 0;
    while (다음 < 남은것.length || 이월.some((c) => c && c.남음 > 0)) {
      const c = 이월[자리];
      if (c && c.남음 > 0) { 칸[자리] = c.값; c.남음--; 자리++; continue; }
      if (다음 >= 남은것.length) break;
      const [, 속성, 속] = 남은것[다음++];
      const 값 = 글(속);
      const rs = Number((속성.match(/ROWSPAN="(\d+)"/i) ?? [])[1] ?? 1);
      const cs = Number((속성.match(/COLSPAN="(\d+)"/i) ?? [])[1] ?? 1);
      for (let k = 0; k < cs; k++) {
        칸[자리] = 값;
        if (rs > 1) 이월[자리] = { 값, 남음: rs - 1 };
        자리++;
      }
    }
    if (칸.length) rows.push(칸);
  }
  return rows;
}

/**
 * 매출실적표를 찾아 부문별 금액을 뽑는다.
 *
 * 머리글 낱말로 표를 고르려다 실패했다. 회사마다 머리글이 다르고
 * (사업부문 / 품목 / 구분), 엉뚱한 표가 같은 낱말을 쓴다 — 사람인은
 * "사업부문" 이 든 표가 직원 현황표 하나뿐이었다.
 *
 * 그래서 사람이 읽는 대로 한다. "매출실적" 이라는 제목 바로 뒤의 표를 잡고,
 * 컬럼은 이름이 아니라 자리로 정한다.
 *
 *   값 칸    데이터 행 대부분이 숫자인 가장 왼쪽 칸 (= 당기)
 *   이름 칸  그 왼쪽의 첫 글자 칸 (= 사업부문, 없으면 품목)
 *
 * 셀트리온 [사업부문 매출유형 품목 값…] · 알서포트 [품목 값…] ·
 * 사람인 [사업부문 구분 값…] 이 모두 같은 규칙으로 풀린다.
 */
function 부문뽑기(xml, 원, 배수) {
  // 제목이 목차에도 나온다. 목차를 잡으면 그 뒤 6만 자 안의 엉뚱한 표를 쓴다 —
  // 삼성전기가 주식 총수 표를 잡아 "보통주 96.3% / 우선주 3.7%" 가 나왔다.
  //
  // 진짜 절은 <TITLE> 태그로 표시된다. 그것을 먼저 찾고, 없을 때만 본문
  // 아무 데나 나온 자리를 쓴다.
  const 말 = String.raw`매\s*출\s*실\s*적|매출\s*및\s*수주|매출에\s*관한\s*사항|부문별\s*매출|사업부문별\s*매출`;
  const 절 = new RegExp(`<TITLE[^>]*>[^<]*(?:${말})[^<]*</TITLE>`, "g");
  const 아무데나 = new RegExp(말, "g");
  const 자리 = [...xml.matchAll(절)].map((x) => x.index);
  if (!자리.length) 자리.push(...[...xml.matchAll(아무데나)].map((x) => x.index));

  // 자리마다 뽑아 보고 가장 나은 것을 쓴다.
  //
  // 예전에는 첫 자리에서 한 줄이라도 나오면 거기서 끝냈다. 그래서 뒤에 진짜
  // 사업부문 표가 있어도 안 봤다 — 614종목이 조각 하나로 끝났다.
  let 한줄 = null;
  for (const 시작 of 자리.slice(0, 8)) {
    const c = 구역에서(xml.slice(시작, 시작 + 60000), 원, 배수);
    if (쓸만한가(c)) return c;
    if (c && !한줄) 한줄 = c;
  }
  return 한줄;
}

/**
 * 한 줄짜리는 뒤로 미룬다.
 *
 * 앞에 나오는 표가 옳다는 원칙은 그대로다 — 조각 수를 앞세웠더니 환율표
 * (USD·EUR·JPY)와 연구과제 목록이 딸려 왔다. 다만 조각이 하나뿐이면 매출유형
 * 한 줄인 경우가 많으므로, 뒤에 둘 이상인 표가 있으면 그쪽을 쓴다.
 */
function 쓸만한가(c) {
  return !!c && c.rows.length >= 2;
}

/**
 * 뽑은 표가 정말 매출 표인가 — 합계를 매출액과 견주고, 단위도 함께 맞춘다.
 *
 * 엉뚱한 표를 이름으로 걸러 내려다 끝이 없었다. 충당금 변동표, 파생상품
 * 명세, 지식재산권 현황, 수주잔고, 거래처 목록, 국책과제… 새 종목을 볼
 * 때마다 새 표가 나왔다. 잣대를 뒤집는다. 매출 표라면 조각의 합이 그 해
 * 매출액과 맞아야 한다. 이름을 아무리 그럴듯하게 지어도 이건 못 속인다.
 *
 * ── 단위도 여기서 정한다 ──────────────────────────────────
 * 표 앞의 「(단위 : 백만원)」 을 읽어 쓰는데, 그 글이 표에서 멀거나 아예
 * 없는 경우가 많다. 그러면 합이 백만분의 일로 나와 멀쩡한 표가 버려졌다.
 *   동국S&C · 인화정공 · 톱텍  비율 0.00 인데 표는 맞았다
 * 그래서 흔한 단위를 차례로 대 보고 매출액과 맞는 것을 쓴다. 맞는 단위가
 * 없으면 그 표가 아니다.
 *
 * 폭을 넓게 잡은 까닭은 연결과 별도가 다르고 내부거래를 빼는 데가 있어서다.
 *   삼성전기 1.000 · 셀트리온 1.000 · 삼성전자 1.090(내부거래 미제거)
 */
const 단위들 = [1, 1e3, 1e6, 1e8];

function 맞는단위(c, 원, 배수 = [1]) {
  if (!c?.rows?.length || !(원 > 0)) return undefined;   // 견줄 것이 없으면 판단 보류
  const 합 = c.rows.reduce((a, r) => a + r.v, 0);
  if (!(합 > 0)) return null;
  const 맞나 = (u) => {
    const 비 = (합 * u) / 원;
    return 배수.some((k) => 비 >= k * 0.7 && 비 <= k * 1.45);
  };
  // 표에서 읽은 단위를 먼저 믿는다
  if (맞나(c.단위)) return c.단위;
  for (const u of 단위들) if (맞나(u)) return u;
  return null;
}

/** --왜 를 주면 어느 규칙에서 표를 버렸는지 찍는다 */
const 버림 = (까닭, 이름들) => {
  if (왜) console.log(`     버림(${까닭}) ${(이름들 ?? []).slice(0, 6).join(" · ").slice(0, 70)}`);
  return true;
};

/** 한 구역 안의 표들을 차례로 보며 부문별 금액을 뽑는다 */
function 구역에서(구역, 원, 배수) {
  let 최고 = null;
  for (const m of 구역.matchAll(/<TABLE\b[\s\S]*?<\/TABLE>/gi)) {
    const tbl = m[0];
    const rows = 표풀기(tbl).filter((r) => r.length >= 2);
    if (rows.length < 2) { 버림("줄이 둘 미만"); continue; }

    const 폭 = Math.max(...rows.map((r) => r.length));
    const 숫자 = (v) => Number.isFinite(돈(v)) && String(v).trim() !== "";
    // 값 칸 — 데이터 행의 절반 넘게가 숫자인 가장 왼쪽 칸
    let 값칸 = -1;
    for (let c = 1; c < 폭; c++) {
      const 있는것 = rows.filter((r) => (r[c] ?? "").trim());
      if (있는것.length < 2) continue;
      if (있는것.filter((r) => 숫자(r[c])).length / 있는것.length > 0.5) { 값칸 = c; break; }
    }
    if (값칸 < 1) { 버림("숫자 칸 없음"); continue; }

    // 이름 칸 — 값 칸 왼쪽에서 숫자가 아닌 가장 왼쪽 칸.
    // 0번이 일련번호인 표가 있어 숫자 칸은 건너뛴다.
    let 이름칸 = -1;
    for (let c = 0; c < 값칸; c++) {
      const 있는것 = rows.filter((r) => (r[c] ?? "").trim());
      if (있는것.length < 2) continue;
      if (있는것.filter((r) => 숫자(r[c])).length / 있는것.length < 0.5) { 이름칸 = c; break; }
    }
    if (이름칸 < 0) { 버림("이름 칸 없음"); continue; }

    // 부문마다 수출·내수·합계 세 줄이 오는 표가 많다. 셋을 다 더하면 두 배가
    // 된다 — 삼성전기가 매출 11.3조인데 22.6조로 잡혔다. 원형은 비율만 쓰므로
    // 겉으로는 멀쩡해 보이지만, 합계가 맞아야 이 표가 매출 표인지 가릴 수 있다.
    //
    //   컴포넌트 수출 5,006,765 · 내수 191,737 · 합계 5,198,502
    //
    // 그래서 합계 줄이 있으면 그것만 쓰고, 없을 때만 세부를 더한다.
    const 소계칸 = (r) =>
      r.some((cell, i) => i !== 이름칸 && i !== 값칸 && /^(합\s*계|소\s*계|계)$/.test(String(cell ?? "").trim()));
    const 묶음 = new Map();
    const 합 = new Map();
    for (const r of rows) {
      const 이름 = (r[이름칸] ?? "").trim();
      const v = 돈(r[값칸]);
      if (!이름 || !Number.isFinite(v) || v <= 0) continue;
      if (/합\s*계|총\s*계|^계$|^소\s*계$/.test(이름)) continue;
      if (/^\d/.test(이름)) continue;            // 머리글 행·연도 행
      if (이름.length > 24) continue;             // 문장이 들어온 것
      // 머리글 행이 데이터인 척 섞여 든다 — "매출유형 0%" "사업부문 0%"
      if (/^(사업\s*부문|매출\s*유형|품\s*목|구\s*분|부\s*문|사업|유형|제품|품명)$|매출\s*유형\s*및\s*품목/.test(이름)) continue;
      // 소계는 조각이 아니라 그 위 묶음이다. "용역매출 소계" 처럼 붙어 오기도 한다.
      if (/소\s*계|합\s*계|총\s*계/.test(이름)) continue;
      // 각주 표를 잡은 것 — "주1)" "주2)"
      if (/^주\s*\d/.test(이름)) continue;
      // 같은 이름을 띄어쓰기만 달리 적는 데가 있다. 그대로 두면 한 부문이 두
      // 조각으로 갈린다 — 다이나믹디자인이 「타이어금형 · 타이어 금형」 이었다.
      const 열쇠 = 이름.replace(/\s+/g, "");
      const g = 묶음.get(열쇠) ?? { 보임: 이름, 소계: null, 세부: 0 };
      if (소계칸(r)) g.소계 = (g.소계 ?? 0) + v;
      else g.세부 += v;
      묶음.set(열쇠, g);
    }
    for (const g of 묶음.values()) 합.set(g.보임, g.소계 ?? g.세부);
    if (합.size < 1) { 버림("쓸 줄이 하나도 안 남음"); continue; }
    const 이름들 = [...합.keys()];
    // 매출 표가 아닌 표는 건너뛰고 다음 표를 본다 — 화면 쪽과 같은 규칙이다.
    //
    // 거래처별·지역별·종속회사별 매출 표는 합이 매출액과 맞아서 「합을 견주는」
    // 잣대로는 못 거른다. 그래서 집고 거기서 멈췄고, 반기보고서에서 그러면
    // 사업보고서로 되돌아가 제대로 된 표를 찾을 기회까지 잃었다(204종목).
    { const 왜못 = 매출표아님(이름들); if (왜못) { 버림(왜못, 이름들); continue; } }
    // 이름이 죄다 한두 글자 로마자면 사업부문이 아니라 등급표다 (D · C · CC · CCC)
    if (이름들.every((n) => /^[A-Za-z+-]{1,4}$/.test(n))) { 버림("등급표", 이름들); continue; }
    // 환율 표 — 통화 코드가 절반을 넘으면 매출이 아니다 (USD · EUR · JPY · VND)
    const 통화 = /^(USD|EUR|JPY|CNY|CNH|VND|PHP|MXN|SGD|TWD|HKD|GBP|AUD|CAD|CHF|IDR|THB|INR|BRL|RUB|TRY|PLN|MYR|KRW|AED|SAR)$/i;
    if (이름들.filter((n) => 통화.test(n)).length / 이름들.length >= 0.4) { 버림("통화 코드", 이름들); continue; }
    // 연구개발비·비용 명세 표 — 무엇을 쓰느냐지 어디서 버느냐가 아니다.
    //   다우기술  연구개발비용 계 · 인 건 비 · 위 탁 용 역 비 · 감 가 상 각 비
    const 비용 = /연구개발비|인건비|위탁용역비|감가상각비|복리후생비|지급수수료|외주가공비|재료비|경상연구|회계처리/;
    if (이름들.filter((n) => 비용.test(n.replace(/\s+/g, ""))).length >= 2) { 버림("비용 명세", 이름들); continue; }
    // 연구개발 과제 목록 — 사업부문이 열 갈래를 넘는 회사는 없다.
    //   다우기술  다우오피스4.0 · 뿌리오 차세대 서비스 개발 및 구축 · …(18개)
    if (이름들.length > 12) { 버림("갈래가 열둘 넘음", 이름들); continue; }
    // 인력 표 — 사람 수를 센 것이다
    //   다우기술  책임연구원 · 선임연구원 · 리드 & 수석연구원 · 연구소장
    const 사람 = /연구원|연구소장|임원|직원|박사|석사|학사|정규직|계약직|기간제|남자|여자|사무직|생산직/;
    if (이름들.filter((n) => 사람.test(n.replace(/\s+/g, ""))).length >= 2) { 버림("인력 표", 이름들); continue; }

    // 매출 표가 아닌 표들.
    //
    // 한 줄짜리를 건너뛰고 뒤를 더 보게 하자, 뒤에 있던 온갖 표가 딸려 왔다.
    // 사업부문 이름으로는 절대 나오지 않는 말들을 모아 둔다.
    //
    //   코스맥스엔비티  기말 · 설정 · 기초 · 제각          충당금 변동표
    //   장원테크        총 장부금액 · 손실충당금 · 기대 손실률  대손충당금표
    //   LS에코에너지    파생상품(공정가치위험회피) · 확정계약   파생상품 명세
    //   제이스로보틱스  전년도 수주 이월액 · 당해년도 수주액   수주잔고표
    //   인티큐브        저작권 · 특허 · 상표 · 인증          지식재산권 현황
    //   보라티알        종사자수(B) · 사업체수(A)            산업 통계
    //   해성디에스      LF개발팀 · BGA개발팀 · COB개발팀     연구조직도
    //   월덱스          미국달러/원 · 일본엔/원              환율 민감도
    const 아닌표 =
      /^(기초|기말|설정|제각|환입|상각|증가|감소|취득|처분|대체)$|충당금|장부금액|손실률|파생상품|평가이익|평가손실|위험회피|확정계약|수주잔고|이월액|수주액|저작권|상표권?$|특허권|실용신안|디자인권|의장권|지식재산|산업재산|^PCT$|종사자수|사업체수|개발팀|기획팀|연구팀|사업팀|달러\/원|엔\/원|위안\/원|유로\/원/;
    if (이름들.filter((n) => 아닌표.test(n.replace(/\s+/g, ""))).length >= 2) { 버림("매출 표가 아님", 이름들); continue; }

    // 88종목을 눈으로 훑어 나온 나머지 유형들.
    //
    //   애닉             일본 엔화/원 · 미국 달러/원        환율 민감도(한글)
    //   링세오코리아      통화선도(매도) · 구리선물(매입)     파생상품 명세
    //   엠에프엠코리아    주임 · 과장 · 실장 · 부장          직급별 인원
    //   인제니아테라퓨틱스 Principal Scientist · Sr. Research Associate  직책별 인원
    //   테크트랜스        특허권 · 상표 등록권               지식재산권 현황
    //   메지온            잔금 · 계약금                     계약 조건
    //   카이바이오텍      …공급계약서 · 위탁제조 계약        계약 목록
    //   스튜디오에스      한시점에 이전하는 재화 · 기간에 걸쳐 이전하는 용역  수익인식 기준
    //   부산은행          보장성보험 · 연금보험 · 화재보험    방카슈랑스 판매
    //   한화플러스제3호   NH투자증권 · KB증권                주주 목록
    const 딴표 =
      /(엔화|달러|바트화|위안화?|유로|루피|링깃)[/／]원|통화선도|통화스왑|이자율스왑|선물환|[가-힣]+선물[(（]|^(주임|대리|과장|차장|부장|실장|사원|팀장|이사|상무|전무)$|Scientist|Research ?Associate|Engineer$|^특허권?$|^상표( ?등록권)?$|^디자인권$|^실용신안권?$|잔금|계약금|중도금|계약서$|한시점|기간에 ?걸쳐|보장성보험|연금보험|화재보험|변액보험|투자증권|자산운용|인베스트먼트/;
    if (이름들.filter((n) => 딴표.test(n.replace(/\s+/g, ""))).length >= 2) { 버림("딴 표", 이름들); continue; }

    // 나라 이름만 늘어선 표 — 지역별이지 사업부문이 아니다
    //   종근당  한국 · 일본 · 기타 · 스위스
    const 나라 =
      /^(한국|국내|해외|중국|일본|미국|유럽|아시아|미주|중동|대만|홍콩|싱가포르|베트남|인도|인도네시아|태국|말레이시아|필리핀|호주|캐나다|멕시코|브라질|독일|영국|프랑스|스위스|이탈리아|스페인|러시아|폴란드|헝가리|체코|터키|튀르키예|기타지역)$/;
    if (이름들.filter((n) => 나라.test(n.replace(/\s+/g, ""))).length >= 2) { 버림("나라 이름", 이름들); continue; }

    // 개발 코드명만 늘어선 표 — 신약 파이프라인이다
    //   휴온스   HD204 · PBP1502      영진약품  YPL-001 · YRA-1909
    //   종근당   CKD-510 · Lobeglitazone(듀비에) · CKD-11101
    // 이름이 다 코드일 필요는 없다 — 절반만 코드면 파이프라인 표다.
    if (이름들.length >= 2
        && 이름들.filter((n) => /[A-Z]{2,5}[- ]?\d{3,}/.test(n)).length / 이름들.length >= 0.5) { 버림("파이프라인", 이름들); continue; }
    // 이름이 죄다 판로·지역이면 사업부문 표가 아니다 (내수/수출, 국내/해외)
    if (이름들.every((n) => /^(내수|수출|국내|해외|기타|아시아|미주|유럽|중국|일본|미국)$/.test(n))) { 버림("판로·지역", 이름들); continue; }
    // 재무상태표를 잡은 것 — 조각이 많은 종목은 대개 이쪽이었다.
    //   STX그린로지스  유동성장기차입금 · 장기차입금 · 리스부채
    //   NH올원리츠     비유동자산 · 투자부동산 · 비유동부채
    // 매출 부문 이름에 계정과목이 섞이면 그 표가 아니다. 묶어서 가릴 것이
    // 아니라 버려야 한다.
    // 재무상태표뿐 아니라 손익계산서도 잡힌다 — 로마숫자 머리가 확실한 신호다.
    //   에스티씨라이프  Ⅵ.영업외수익 · Ⅷ.법인세비용차감전순이익
    //   일화모직공업    Ⅳ. 판매비와관리비 · Ⅵ. 영 업 외 수 익
    if (이름들.some((n) => /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/.test(n))) { 버림("로마숫자(손익계산서)", 이름들); continue; }
    const 계정 = /자산|부채|자본|차입금|채권|채무|잉여금|충당금|사채|예수금|미지급|선급|재고|현금및|지배기업|소유지분|영업외|법인세|순이익|판매비|관리비|매출총이익|매출원가|복리후생|지급수수료|감가상각|급\s*여/;
    if (이름들.filter((n) => 계정.test(n)).length / 이름들.length > 0.3) { 버림("계정과목", 이름들); continue; }



    const 앞 = 구역.slice(Math.max(0, m.index - 700), m.index);
    const u = 글(앞).match(/단위\s*[:：]\s*(백만원|천원|억원|원)/);
    const 단위 = { 원: 1, 천원: 1e3, 백만원: 1e6, 억원: 1e8 }[u?.[1] ?? "원"];
    if (process.argv.includes("--표")) {
      console.log("  ── 표 ──");
      for (const r of rows) console.log("   ", JSON.stringify(r.slice(0, 8)));
    }
    const 후보 = { 단위, rows: [...합].map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v) };
    // 매출액과 안 맞으면 이 표가 아니다 — 다음 표를 본다
    const 고른단위 = 맞는단위(후보, 원, 배수);
    if (고른단위 === null) { 버림(`합이 매출액과 안 맞음(합 ${[...합.values()].reduce((a,b)=>a+b,0)})`, 이름들); continue; }
    if (고른단위 !== undefined) 후보.단위 = 고른단위;
    if (쓸만한가(후보)) return 후보;
    if (!최고) 최고 = 후보;
  }
  return 최고;
}

/** 종목별 매출액(원) — 뽑은 표가 매출 표인지 견주는 데 쓴다 */
const 매출액 = (() => {
  const 읽기 = (n) => {
    const f = path.join(DIR, n);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  };
  // 재무 API 가 안 주는 회사는 사업보고서 원문에서 읽어 둔 것을 쓴다
  // (collect-revenue.mjs --원문). 잣대가 있어야 엉뚱한 표를 걸러 낸다.
  const a = 읽기("revenue.json"), b = 읽기("revenue-doc.json");
  const 나 = { ...a };
  for (const [c, v] of Object.entries(b)) if (!(나[c] > 0) && v > 0) 나[c] = v;
  return 나;
})();

const 쉼 = (ms) => new Promise((r) => setTimeout(r, ms));

async function 최근보고서(corpCode) {
  // 목록·원문 모두 dart.mjs 가 받은 것을 남겨 둔다. 잣대를 고쳐 다시 돌릴 때
  // 호출이 들지 않는 까닭이다.
  const 목록 = await 공시목록(corpCode, { bgn: "20240101", end: "20301231", ty: "A", n: 20 });
  if (!목록?.length) return null;
  // 가장 최근 것을 쓴다.
  //
  // 예전에는 사업보고서를 먼저 찾았다. 그런데 사업보고서는 한 해에 한 번이라
  // 9월이면 반년 넘게 묵은 것을 본다. 사업구조를 알자는 것이지 정확한 매출액을
  // 알자는 것이 아니므로, 분기·반기라도 최신이 낫다.
  //
  // 대신 검증 잣대를 손봐야 한다 — 분기·반기 표는 누적이라 합이 연매출의
  // 0.25·0.5·0.75 배로 나온다. 어느 보고서를 받았는지 알고 있으니 기대 배수를
  // 그에 맞춘다(아래 기대배수()).
  // 최신을 먼저 보되, 거기서 표를 못 찾으면 사업보고서로 되돌아간다.
  // 반기보고서는 표가 성겨 아예 없는 회사가 있다 — 삼성전자가 그랬다.
  const 최근 = [...목록].sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt));
  const 사업 = 최근.find((r) => /사업보고서/.test(r.report_nm));
  const 후보 = [최근[0], 사업].filter((r, i, a) => r && a.findIndex((x) => x?.rcept_no === r.rcept_no) === i);
  return 후보.length ? 후보 : null;
}

/** 한도에 걸렸으면 알리고 멈춘다 — 다음에 이어받는다 */
const 멈출때 = () => {
  if (!한도넘었나()) return false;
  console.log("\n하루 호출 한도를 넘었다. 여기서 멈춘다 — 다시 돌리면 이어서 받는다.");
  return true;
};

let 한것 = 0, 새로 = 0, 못찾음 = 0;
const 시작 = Date.now();
for (const s of 종목) {
  if (ONLY && s.code !== ONLY) continue;
  // --limit 은 실제로 받은 수로 센다. 건너뛴 것까지 세면 이미 받아 둔 것이
  // 한도를 다 갉아먹어, 700 을 줘도 87개밖에 못 돌았다.
  if (새로 >= LIMIT) break;
  한것++;
  // --약한것 은 이미 받은 것 중 시원찮은 것만 다시 받는다.
  // 호출 한도가 빠듯할 때 쓸 것부터 고쳐 쓰려고 둔다.
  if (!ONLY) {
    const 있는것 = out[s.code];
    if (약한것만) { if (있는것?.rows?.length >= 2) continue; }
    else if (묵은것만) { if (있는것?.판 === 판) continue; }
    else if (있는것 !== undefined) continue;
  }
  try {
    const 보고서들 = await 최근보고서(코드[s.code]);
    if (멈출때()) break;
    if (!보고서들) { out[s.code] = null; 못찾음++; continue; }
    // 최신 보고서를 먼저 보되, 거기서 나온 표가 성기면 사업보고서도 본다.
    //
    // 예전에는 한 조각이라도 나오면 거기서 멈췄다. 반기보고서는 표가 성겨
    // 「제품 100%」 한 줄로 끝나는 데가 많은데, 같은 회사 사업보고서에는
    // 사업부문이 갈라져 있다 — 조각 하나로 끝난 종목이 364, 매출유형만 나온
    // 종목이 114 였다. 둘을 다 보고 알맹이가 많은 쪽을 쓴다.
    let 얻은것 = null;
    // -1 에서 시작한다. 0 이면 알맹이 없는 표(「제품 · 상품」)를 아예 안 남겨
    // 「표를 못 찾음」 으로 세어진다 — 화면은 어차피 안 그리지만 뒤에 규칙을
    // 고쳐 다시 볼 자료까지 버리는 셈이다.
    let 최고 = -1;
    for (const r0 of 보고서들) {
      await 쉼(40);
      const xml = await 원문글(r0.rcept_no);
      if (한도넘었나()) break;
      if (xml === null) continue; // 통신 실패 — 남기지 않고 다음에 다시 받는다
      if (ONLY) console.log("  문서", xml.length, "자 ·", r0.report_nm);
      const seg = 부문뽑기(xml, 매출액[s.code] ?? 0, 기대배수(r0.report_nm));
      if (!seg) { if (ONLY) console.log("  이 보고서에서는 표를 못 찾음"); continue; }
      const 알짜 = 알짜조각(seg.rows.map((r) => r.label));
      if (ONLY) console.log(`  ${r0.report_nm} — 조각 ${seg.rows.length} · 알맹이 ${알짜}`);
      if (알짜 > 최고) { 최고 = 알짜; 얻은것 = { ...seg, report: r0.report_nm, asOf: r0.rcept_dt, 판: 판 }; }
      if (최고 >= 2) break;
    }
    if (멈출때()) break;
    if (!얻은것) 못찾음++;
    // 못 찾은 것에도 판을 남긴다. 안 남기면 --묵은것 이 이것들을 끝없이 다시
    // 받는다 — 600 을 줬는데 344 만 새로 받았던 까닭이다.
    out[s.code] = 얻은것 ?? { 판, rows: [] };
    새로++;
  } catch (e) { out[s.code] = null; if (ONLY) console.log("  오류:", String(e.message).slice(0, 140)); }
  if (새로 && 새로 % 50 === 0) {
    fs.writeFileSync(OUT, JSON.stringify(out));
    console.log(`  ${한것}/${Math.min(종목.length, LIMIT)} · 새로 ${새로} · 못 찾음 ${못찾음} · ${((Date.now()-시작)/1000).toFixed(0)}초`);
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
const 있는것 = Object.values(out).filter(Boolean);
const { 부름, 캐시 } = 셈();
console.log(`\n종목 ${Object.keys(out).length} · 부문 뽑힌 종목 ${있는것.length}`);
console.log(`DART 두드림 ${부름}건 · 남겨 둔 것으로 때움 ${캐시}건`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size/1024).toFixed(0)}KB`);
