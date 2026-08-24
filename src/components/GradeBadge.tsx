"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { gradeTitle, scoreGrade, scoreGradeTone } from "@/lib/score";

/**
 * 여러 종목의 종합평가 등급을 한 번에 받아온다.
 * 이미 모아 둔 지표로 계산만 하므로 목록 옆에 붙여도 부담이 없다.
 * 아직 지표가 없는 종목은 빠진 채로 오고, 그때는 배지를 그리지 않는다.
 */
export function useGrades(codes: string[]) {
  const key = codes.length ? `/api/grades?codes=${codes.slice(0, 60).join(",")}` : null;
  const { data } = useSWR<{ scores: Record<string, number> }>(key, fetcher, {
    refreshInterval: 600_000,
    revalidateOnFocus: false,
  });
  return data?.scores ?? {};
}

/**
 * 종목명 옆에 붙는 종합평가 등급.
 *
 * 툴팁에 "무엇을 재는 점수인지" 를 반드시 같이 띄운다 — 목록에서는 배지만 보이므로
 * 설명이 없으면 A 가 "사도 되는 주식" 으로 읽힌다. 백테스트에서 이 점수는 수익률을
 * 예측하지 못했다(자세한 내용은 `lib/score.ts` 의 SCORE_MEANING 주석).
 */
export function GradeBadge({ score, className = "" }: { score?: number; className?: string }) {
  if (score == null) return null;
  const g = scoreGrade(score);
  return (
    <span
      className={`shrink-0 rounded border px-1 py-0.5 text-[10px] font-bold ${scoreGradeTone(g)} ${className}`}
      title={gradeTitle(score, g)}
    >
      {g}
    </span>
  );
}
