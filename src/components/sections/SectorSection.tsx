"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { SectorPeek } from "@/components/SectorPeek";
import { pct, signColor } from "@/lib/format";
import type { Sector } from "@/lib/naverApi";

function SectorBar({
  s,
  max,
  onPick,
}: {
  s: Sector;
  max: number;
  onPick: (code: string, name: string) => void;
}) {
  const up = s.changeRate >= 0;
  const w = max ? (Math.abs(s.changeRate) / max) * 100 : 0;
  const bar = (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 truncate shrink-0">{s.name}</span>
      <div className="flex-1 h-2 rounded-full bg-line/40 overflow-hidden">
        <div className={`h-full rounded-full ${up ? "bg-up" : "bg-down"}`} style={{ width: `${w}%` }} />
      </div>
      <span className={`tnum w-14 text-right font-medium ${signColor(s.changeRate)}`}>
        {pct(s.changeRate)}
      </span>
    </div>
  );
  // 마우스를 올리면 구성종목이 펼쳐지고, 고르면 그 종목으로 이동
  return (
    <SectorPeek market="kr" code={s.code} title={s.name} onPick={onPick}>
      {bar}
    </SectorPeek>
  );
}

export function SectorSection() {
  const router = useRouter();
  const pick = (code: string, name: string) =>
    router.push(`/stock?code=${code}&name=${encodeURIComponent(name)}`);
  const { data, isLoading } = useSWR<{ data: Sector[] }>("/api/sectors", fetcher, {
    refreshInterval: 60_000,
  });

  const { strong, weak, max } = useMemo(() => {
    const secs = [...(data?.data ?? [])].sort((a, b) => b.changeRate - a.changeRate);
    return {
      strong: secs.slice(0, 6),
      weak: secs.slice(-6).reverse(),
      max: Math.max(1, ...secs.map((s) => Math.abs(s.changeRate))),
    };
  }, [data]);

  return (
    <Card title="섹터 강약" right={<span className="text-xs text-muted">KRX 업종 · 60초</span>}>
      {isLoading && !data ? (
        <div className="h-64 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-up mb-2">강한 섹터</div>
            <div className="flex flex-col gap-2">
              {strong.map((s) => (
                <SectorBar key={s.name} s={s} max={max} onPick={pick} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-down mb-2">약한 섹터</div>
            <div className="flex flex-col gap-2">
              {weak.map((s) => (
                <SectorBar key={s.name} s={s} max={max} onPick={pick} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
