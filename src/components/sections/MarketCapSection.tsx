"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { num, pct, signColor } from "@/lib/format";
import type { NStock } from "@/lib/naverApi";

const STEP = 20;
const MAX = 100;

function CapTable({ market, label, limit }: { market: string; label: string; limit: number }) {
  const { data, isLoading } = useSWR<{ data: NStock[] }>(
    `/api/marketcap?market=${market}&limit=${limit}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true },
  );
  const rows = data?.data ?? [];

  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs font-semibold text-muted">{label}</div>
      {isLoading && !rows.length ? (
        <div className="h-72 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-line">
                <th className="text-left font-medium py-2 pl-1 w-8">#</th>
                <th className="text-left font-medium">종목</th>
                <th className="text-right font-medium">현재가</th>
                <th className="text-right font-medium">등락률</th>
                <th className="text-right font-medium pr-1 whitespace-nowrap">시가총액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.code} className="border-b border-line/40 hover:bg-surface/70 transition-colors">
                  <td className="py-2 pl-1 tnum text-muted">{i + 1}</td>
                  <td className="max-w-[9rem] truncate font-medium">
                    {/* 종목명도 등락에 따라 — 상승 빨강 / 하락 파랑 */}
                    <Link
                      href={`/stock?code=${s.code}&name=${encodeURIComponent(s.name)}`}
                      className={`block truncate hover:underline ${signColor(s.changePct)}`}
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="text-right tnum">{num(s.price)}</td>
                  <td className={`text-right tnum font-medium ${signColor(s.changePct)}`}>
                    {pct(s.changePct)}
                  </td>
                  <td className="text-right tnum text-muted pr-1 whitespace-nowrap">{s.marketCap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MarketCapSection() {
  const [limit, setLimit] = useState(STEP);

  return (
    <Card
      title="시가총액 상위"
      right={<span className="text-xs text-muted">KRX+NXT 통합 · 60초</span>}
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
        <CapTable market="KOSPI" label="코스피" limit={limit} />
        <CapTable market="KOSDAQ" label="코스닥" limit={limit} />
      </div>
      <div className="mt-3 flex gap-2">
        {limit < MAX && (
          <button
            onClick={() => setLimit((v) => Math.min(MAX, v + STEP))}
            className="flex-1 rounded-lg border border-line py-2 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-fg"
          >
            더보기 (+{Math.min(STEP, MAX - limit)}종목)
          </button>
        )}
        {limit > STEP && (
          <button
            onClick={() => setLimit(STEP)}
            className="flex-1 rounded-lg border border-line py-2 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-fg"
          >
            접기 (상위 {STEP}종목)
          </button>
        )}
      </div>
    </Card>
  );
}
