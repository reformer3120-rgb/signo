"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { scoreGrade, scoreGradeTone } from "@/lib/score";

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

/** 종목명 옆에 붙는 종합평가 등급 */
export function GradeBadge({ score, className = "" }: { score?: number; className?: string }) {
  if (score == null) return null;
  const g = scoreGrade(score);
  return (
    <span
      className={`shrink-0 rounded border px-1 py-0.5 text-[10px] font-bold ${scoreGradeTone(g)} ${className}`}
      title={`종합평가 ${score}점 (${g})`}
    >
      {g}
    </span>
  );
}
