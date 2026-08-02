"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import type { NewsItem } from "@/lib/naverApi";

function fmt(dt: string) {
  // YYYYMMDDHHMM
  if (dt?.length >= 12) return `${dt.slice(4, 6)}.${dt.slice(6, 8)} ${dt.slice(8, 10)}:${dt.slice(10, 12)}`;
  return "";
}

export function NewsCard({ code }: { code: string }) {
  const { data } = useSWR<{ data: NewsItem[] }>(`/api/stock-news?code=${code}`, fetcher, {
    refreshInterval: 300_000,
  });
  const items = data?.data ?? [];
  return (
    <Card title="관련 뉴스" right={<span className="text-xs text-muted">네이버</span>}>
      {!data ? (
        <div className="h-40 animate-pulse rounded-lg bg-line/30" />
      ) : items.length ? (
        <ul className="flex flex-col divide-y divide-line/40">
          {items.map((it, i) => (
            <li key={i}>
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 py-2.5 hover:bg-surface/60 rounded-md px-1 -mx-1"
              >
                <span className="text-sm leading-snug break-keep flex-1">{it.title}</span>
                <span className="text-[11px] text-muted whitespace-nowrap shrink-0 mt-0.5">
                  {it.office} · {fmt(it.datetime)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-muted py-4 text-center">뉴스가 없습니다.</div>
      )}
    </Card>
  );
}
