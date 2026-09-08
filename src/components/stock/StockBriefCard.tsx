"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { Donut, type 조각 } from "@/components/stock/Donut";
import type { BriefData } from "@/components/StockBrief";
import type { Profile } from "@/lib/profile";
import type { Exch } from "@/components/ExchangeSelect";

type Resp = BriefData & {
  name?: string | null;
  about?: string[];
  why?: string | null;
} & Profile;

/**
 * 종목 화면 맨 위의 한 장 소개 — 이 회사가 무슨 일을 하는가.
 *
 * 차트와 호가보다 먼저 온다. 처음 보는 종목이면 "이게 뭐 하는 회사냐" 가
 * 먼저이고, 그 답이 없으면 아래 숫자들이 다 의미가 없다.
 *
 * ── 왜 숫자를 걷어냈나 ────────────────────────────────────
 * 전에는 평가(점수·매출·이익률·PER·목표주가)와 모멘텀(1개월·이평선·외국인)을
 * 넣었는데, 그 값이 하나같이 아래 카드에 그대로 또 있었다.
 *
 *   SIGNO 점수 · 골든크로스        → 섹터 종합평가
 *   매출성장 · 영업이익률           → 재무제표
 *   PER · 시총 · 목표주가 · 의견     → 종목 상세
 *   테마 N종목                     → 차트 위 테마 칩
 *
 * 여기 남은 숫자는 다른 데 없는 것들뿐이다 — 매출 구성과 주주 구성.
 *
 * ── 외국인 비중은 왜 여기서 받나 ───────────────────────────
 * 대량보유자는 굳혀 둘 수 있지만(분기 공시) 외국인 보유비중은 하루에도
 * 바뀐다. 그래서 종목상세와 같은 열쇠로 SWR 을 걸어 둔다 — 같은 열쇠라
 * 요청은 늘지 않고, 값만 나눠 쓴다.
 */
export function StockBriefCard({
  code,
  name,
  exch = "KRX",
}: {
  code: string;
  name: string;
  exch?: Exch;
}) {
  const { data, isLoading } = useSWR<{ data: Resp }>(
    code ? `/api/stock-brief?code=${code}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
  // 종목상세 카드가 이미 부르는 주소다. SWR 이 같은 열쇠로 묶어 준다.
  const { data: detail } = useSWR<{ data: { detail?: { foreignRate?: string } } }>(
    code ? `/api/stock-detail?code=${code}&exchange=${exch}` : null,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true },
  );
  const d = data?.data;

  if (isLoading && !d) {
    return (
      <Card title={`${name} 개요`}>
        {/* 카드도 bg-surface 라 뼈대를 같은 색으로 두면 아무것도 안 보인다 */}
        <div className="h-16 animate-pulse rounded-lg bg-line/60" />
      </Card>
    );
  }

  // 개요가 없으면 편입 사유 한 줄로 대신한다
  const 문장 = d?.about?.length ? d.about : d?.why ? [d.why] : [];
  // 주요사업 낱말은 개요 문장에서 뽑은 것이라 99.5%가 문장 안에 그대로 있다.
  // 바로 위에 쓰인 말을 칩으로 또 다는 것은 군더더기다.
  const 낱말 = (d?.biz ?? []).filter((b) => !문장.some((s) => s.includes(b))).slice(0, 4);

  const 매출 = d?.매출?.rows ?? [];
  const 주주 = 주주조각(d, detail?.data?.detail?.foreignRate);
  const 원형수 = (매출.length >= 2 ? 1 : 0) + (주주.length >= 2 ? 1 : 0);

  if (!d || (!문장.length && !낱말.length && !원형수)) return null;

  return (
    <Card title={`${name} 개요`}>
      {문장.length > 0 && (
        <ul className="space-y-1.5">
          {문장.map((s) => (
            <li key={s} className="flex gap-1.5 text-[13px] leading-relaxed">
              <span aria-hidden className="mt-[0.45em] size-[3px] shrink-0 rounded-full bg-muted" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}

      {낱말.length > 0 && (
        <div className={`flex flex-wrap items-center gap-1.5 ${문장.length ? "mt-2.5" : ""}`}>
          {낱말.map((b) => (
            <span key={b} className="rounded bg-surface px-1.5 py-0.5 text-[11.5px] font-medium">
              {b}
            </span>
          ))}
        </div>
      )}

      {원형수 > 0 && (
        <div
          className={`mt-3.5 gap-3.5 border-t border-line pt-3.5 ${
            원형수 === 2 ? "grid grid-cols-2" : "grid grid-cols-1"
          }`}
        >
          {매출.length >= 2 && (
            <Donut title="매출 구성" rows={매출} wide={원형수 === 1} foot={d.매출?.asOf ?? undefined} />
          )}
          {주주.length >= 2 && (
            <Donut title="주주 구성" rows={주주} wide={원형수 === 1} foot={d.주주?.asOf ?? undefined} />
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * 주주 원형 — 최대주주(및 특수관계인) + 대량보유자 + 외국인 + 그 밖.
 *
 * 외국계 보유자는 조각을 따로 내지 않는다. 외국인 보유비중 안에 이미 들어
 * 있어서 나누면 두 번 세어진다(NAVER 의 블랙록 7.09%). 대신 외국인 조각에
 * 이름을 적어 누가 들고 있는지는 보이게 한다.
 *
 * ── 외국인 조각을 아예 접는 경우 ───────────────────────────
 * 최대주주 자체가 외국계이면 그 지분이 외국인 보유비중에 통째로 들어 있다.
 * 둘을 나란히 놓으면 합이 100을 넘는다.
 *   한국씨티은행  최대주주(씨티은행 해외법인) 99.98% · 외국인 100%
 * 그래서 국내 조각과 외국인을 더해 100을 넘으면 외국인은 조각으로 두지 않고
 * 최대주주 조각에 한 줄로 적는다.
 */
function 주주조각(d: Resp | undefined, 외국인비율?: string): 조각[] {
  const rows = d?.주주?.rows ?? [];
  if (!rows.length) return [];
  const 외 = 외국인비율 ? Number(String(외국인비율).replace(/[^\d.]/g, "")) : NaN;

  const 국내 = rows.filter((r) => !r.foreign);
  const 외국 = rows.filter((r) => r.foreign);
  const 조각들: 조각[] = 국내.map((r) => ({ name: r.name, pct: r.pct }));
  const 국내합 = 조각들.reduce((a, r) => a + r.pct, 0);

  if (Number.isFinite(외) && 외 > 0) {
    if (국내합 + 외 > 100 && 조각들.length) {
      // 겹친다. 외국인은 조각을 내지 않고 맨 앞 조각에 적어 둔다.
      조각들[0] = { ...조각들[0], note: `외국인 ${외.toFixed(1)}% 와 겹침` };
    } else {
      조각들.push({
        name: "외국인",
        pct: +외.toFixed(1),
        note: 외국.length ? `${외국[0].name} ${외국[0].pct}% 포함` : undefined,
      });
    }
  } else {
    // 외국인 비중을 아직 못 받았으면 외국계 보유자만 따로 낸다
    for (const r of 외국) 조각들.push({ name: r.name, pct: r.pct });
  }

  const 합 = 조각들.reduce((a, r) => a + r.pct, 0);
  // 합이 100을 넘으면 어딘가 겹친 것이다. 억지로 "그 밖" 을 만들지 않는다.
  if (합 < 99.5) 조각들.push({ name: "그 밖", pct: +(100 - 합).toFixed(1) });
  return 조각들;
}
