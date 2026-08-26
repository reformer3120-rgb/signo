"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { StockBrief, type BriefData } from "@/components/StockBrief";

type Resp = BriefData;

/**
 * 종목 화면 맨 위의 한 장 소개.
 *
 * 차트와 호가보다 먼저 온다 — 처음 보는 종목이면 "이게 뭐 하는 회사냐" 가
 * 먼저이고, 그 답이 없으면 아래 숫자들이 다 의미가 없다.
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
        <div className="h-16 animate-pulse rounded-lg bg-surface" />
      </Card>
    );
  }
  if (!d || !d.biz.length) return null;

  return (
    <Card title={`${name} 개요`}>
      <StockBrief d={d} />
    </Card>
  );
}
