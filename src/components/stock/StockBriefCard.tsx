"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import type { BriefData } from "@/components/StockBrief";

type Resp = BriefData & { about?: string[]; why?: string | null };

/**
 * 종목 화면 맨 위의 한 장 소개 — 이 회사가 무슨 일을 하는가.
 *
 * 차트와 호가보다 먼저 온다. 처음 보는 종목이면 "이게 뭐 하는 회사냐" 가
 * 먼저이고, 그 답이 없으면 아래 숫자들이 다 의미가 없다.
 *
 * ── 왜 숫자를 걷어냈나 ────────────────────────────────────
 * 전에는 여기에 평가(점수·매출·이익률·PER·목표주가)와 모멘텀(1개월·이평선·
 * 외국인)까지 넣었다. 그런데 그 값들이 아래 카드에 그대로 또 있다.
 *
 *   SIGNO 점수 · 골든크로스        → 섹터 종합평가
 *   매출성장 · 영업이익률           → 재무제표
 *   PER · 시총 · 목표주가 · 의견     → 종목 상세
 *   1개월 · 외국인                  → 종목 상세
 *
 * 같은 숫자를 두 번 보여 줄 이유가 없고, 그러느라 정작 "무슨 회사인가" 가
 * 숫자에 묻혔다. 그래서 겹치지 않는 셋만 남긴다 —
 * 사업 설명 · 주요사업 낱말 · 테마.
 *
 * 문장은 사업보고서 '사업의 내용 — 사업의 개요' 에서 옮긴 것이다(지어내지
 * 않는다). 2,497종목 중 2,367종목(94.8%)에 서고, 못 세운 종목은 테마 편입
 * 사유 한 줄로, 그것도 없으면 주요사업 낱말만으로 카드가 선다.
 *
 * 테마 화면의 종목 카드(ThemeDetailView)는 이 변경과 무관하다. 거기서는
 * 시총·매출성장·이익률·PER 이 다른 데 없어서 StockBrief 를 그대로 쓴다.
 */
export function StockBriefCard({ code, name }: { code: string; name: string }) {
  const { data, isLoading } = useSWR<{ data: Resp }>(
    code ? `/api/stock-brief?code=${code}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
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
  // 주요사업 낱말은 개요 문장에서 뽑아낸 것이라 대개 문장 안에 그대로 들어
  // 있다(전체의 99.5%). 바로 위에 쓰인 말을 칩으로 또 다는 것은 군더더기라
  // 문장에 없는 것만 남긴다 — 개요가 없어 칩만 서는 종목에서는 다 남는다.
  const 낱말 = (d?.biz ?? []).filter((b) => !문장.some((s) => s.includes(b))).slice(0, 4);
  // 문장도 낱말도 없으면 빈 카드가 된다 — 그때는 카드째 숨는다
  if (!d || (!문장.length && !낱말.length)) return null;

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

      {(낱말.length > 0 || d.themeName) && (
        <div className={`flex flex-wrap items-center gap-1.5 ${문장.length ? "mt-2.5" : ""}`}>
          {낱말.map((b) => (
            <span key={b} className="rounded bg-surface px-1.5 py-0.5 text-[11.5px] font-medium">
              {b}
            </span>
          ))}
          {d.themeName && (
            <span className="text-[11px] text-muted">
              {d.themeName}
              {d.themeCount ? ` ${d.themeCount}종목` : ""}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
