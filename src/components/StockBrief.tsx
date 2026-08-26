"use client";
import { pct, signColor, won } from "@/lib/format";

/**
 * 종목 한 장 소개 — 세 칸으로 고정한 틀.
 *
 *   주요사업   무엇을 팔아 돈을 버는가
 *   평가       숫자로 본 지금 상태
 *   모멘텀     지금 무슨 신호가 켜져 있는가
 *
 * ── 왜 문장을 안 쓰나 ──────────────────────────────────────
 * 예전에는 "제지(인쇄용지)를 생산하는 한솔그룹 계열사다." 한 문장이었다.
 * 종목이 백 개 깔린 목록에서는 아무도 읽지 않는다. 라벨과 값으로 끊어 두면
 * 눈이 필요한 줄로 바로 간다.
 *
 * ── 빈 칸은 지운다 ─────────────────────────────────────────
 * 자료가 종목마다 다르다. 증권가 컨센서스는 시총 상위 2할에만 있고, 측정
 * 신호는 지표 크론이 훑은 종목에만 있다. 없는 줄은 "—" 로 채우지 않고 아예
 * 지운다 — 빈 칸이 늘어선 화면은 고장난 것처럼 보인다.
 */

export interface BriefData {
  biz: string[];
  /** 오늘 등락률 — 테마와 견주는 데 쓴다 */
  chg?: number | null;
  themeName?: string;
  themeCount?: number;
  themeChg?: number | null;
  cap: number | null;
  growth: number | null;
  opm: number | null;
  finYear?: number | null;
  per: number | null;
  score: number | null;
  target: number | null;
  upside: number | null;
  recomm: number | null;
  ret1m: number | null;
  cross: string | null;
  foreign: number | null;
}

/** 억원 단위로 들어온 시가총액을 조/억으로 */
function cap(n: number | null): string | null {
  if (n === null) return null;
  return n >= 10_000 ? `${(n / 10_000).toFixed(2)}조` : `${won(n)}억`;
}

/** 라벨 한 줄. 값이 하나도 없으면 줄째로 사라진다. */
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  if (!has) return null;
  return (
    <div className="flex gap-2">
      <span className="w-11 shrink-0 pt-px text-[10.5px] text-muted">{k}</span>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">{children}</div>
    </div>
  );
}

/** 값 하나 — 이름을 앞에 작게 붙인다 */
function V({ k, v, tone }: { k?: string; v: string; tone?: number | null }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      {k && <span className="text-[10px] text-muted">{k}</span>}
      <span
        className={`tnum text-[11.5px] font-medium ${
          tone === null || tone === undefined ? "" : signColor(tone)
        }`}
      >
        {v}
      </span>
    </span>
  );
}

/** 골든크로스는 오름, 데드크로스는 내림 색으로 */
const crossTone = (c: string) =>
  c === "골든크로스" || c === "정배열" ? 1 : c === "데드크로스" || c === "역배열" ? -1 : 0;

export function StockBrief({ d, dense = false }: { d: BriefData; dense?: boolean }) {
  const 사업 = d.biz.slice(0, dense ? 3 : 4);
  const 대비 =
    d.chg !== null && d.chg !== undefined && d.themeChg !== null && d.themeChg !== undefined
      ? d.chg - d.themeChg
      : null;
  const 실적해 = d.finYear ? `${String(d.finYear).slice(2)}년` : "";

  return (
    <div className={`flex flex-col ${dense ? "gap-1" : "gap-1.5"}`}>
      <Row k="주요사업">
        {사업.map((b) => (
          <span
            key={b}
            className="rounded bg-surface px-1.5 py-0.5 text-[11.5px] font-medium"
          >
            {b}
          </span>
        ))}
        {d.themeName && (
          <span className="text-[10.5px] text-muted">
            {d.themeName}
            {d.themeCount ? ` ${d.themeCount}종목` : ""}
          </span>
        )}
        {cap(d.cap) && <V k="시총" v={cap(d.cap) as string} />}
      </Row>

      <Row k="평가">
        {d.score !== null && <V k="SIGNO" v={`${d.score}점`} />}
        {d.growth !== null && <V k={`매출${실적해}`} v={pct(d.growth)} tone={d.growth} />}
        {d.opm !== null && <V k="이익률" v={pct(d.opm)} tone={d.opm} />}
        {d.per !== null && <V k="PER" v={`${d.per.toFixed(1)}배`} />}
        {d.upside !== null && d.target !== null && (
          <V k="증권가목표" v={`${won(d.target)}원 ${pct(d.upside)}`} tone={d.upside} />
        )}
        {d.recomm !== null && <V k="의견" v={`${d.recomm.toFixed(1)}/5`} />}
      </Row>

      <Row k="모멘텀">
        {d.ret1m !== null && <V k="1개월" v={pct(d.ret1m)} tone={d.ret1m} />}
        {d.cross && d.cross !== "-" && <V v={d.cross} tone={crossTone(d.cross)} />}
        {d.foreign !== null && <V k="외국인" v={`${d.foreign.toFixed(1)}%`} />}
        {d.themeChg !== null && d.themeChg !== undefined && (
          <V k="테마" v={pct(d.themeChg)} tone={d.themeChg} />
        )}
        {/* 테마를 끌고 있나, 못 따라가고 있나. 지표 크론과 무관하게 늘 나온다 */}
        {대비 !== null && <V k="테마대비" v={`${대비 > 0 ? "+" : ""}${대비.toFixed(1)}%p`} tone={대비} />}
      </Row>
    </div>
  );
}
