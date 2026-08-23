"use client";
import { useEffect, useMemo } from "react";
import useSWR, { preload } from "swr";
import { fetcher } from "@/lib/swr";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { SectorPeek } from "@/components/SectorPeek";
import { useSticky } from "@/lib/useSticky";
import { pct, signColor } from "@/lib/format";
import type { SectorMove, SectorPeriod } from "@/lib/naverApi";

const PERIODS: { key: SectorPeriod; label: string }[] = [
  { key: "1d", label: "당일" },
  { key: "1w", label: "1주" },
  { key: "1m", label: "1개월" },
];

function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { key: T; label: string }[];
}) {
  return (
    <div className="flex rounded-lg border border-line p-0.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
            value === it.key ? "bg-brand text-white" : "text-muted hover:text-fg"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function SectorBar({
  s,
  max,
  group,
  period,
  onPick,
}: {
  s: SectorMove;
  max: number;
  /** 세부는 업종 코드로, 대분류는 이름으로 구성종목을 찾는다 */
  group: "detail" | "broad";
  period: SectorPeriod;
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
    <SectorPeek market="kr" code={s.key} title={s.name} group={group} period={period} onPick={onPick}>
      {bar}
    </SectorPeek>
  );
}

export function SectorSection() {
  const router = useRouter();
  const pick = (code: string, name: string) =>
    router.push(`/stock?code=${code}&name=${encodeURIComponent(name)}`);

  // 화면을 옮겼다 와도 보던 기준이 유지되게
  const [period, setPeriod] = useSticky<SectorPeriod>("kr.sector.period", "1d");
  const [scope, setScope] = useSticky<"broad" | "detail">("kr.sector.scope", "detail");
  const broad = scope === "broad";

  // 1주·1개월은 전 종목 일봉을 받아 만들기 때문에 처음 부를 때 십수 초 걸린다.
  // 기본 화면(당일)이 뜨는 동안 배경으로 미리 불러 둔다. 사용자가 탭을 누를
  // 무렵에는 이미 만들어져 있어 기다림이 없다.
  useEffect(() => {
    preload("/api/sectors?period=1w&group=detail", fetcher);
  }, []);

  const { data, isLoading } = useSWR<{ data: SectorMove[] }>(
    `/api/sectors?period=${period}&group=${scope}`,
    fetcher,
    // 당일은 장중에 계속 바뀌지만 주·월은 그렇지 않다
    { refreshInterval: period === "1d" ? 60_000 : 600_000, keepPreviousData: true },
  );

  const { strong, weak, max } = useMemo(() => {
    const secs = [...(data?.data ?? [])].sort((a, b) => b.changeRate - a.changeRate);
    // 대분류는 11개뿐이라 8개씩 뽑으면 양쪽이 겹친다
    const n = broad ? Math.floor(secs.length / 2) : 8;
    return {
      strong: secs.slice(0, n),
      weak: secs.slice(-n).reverse(),
      max: Math.max(1, ...secs.map((s) => Math.abs(s.changeRate))),
    };
  }, [data, broad]);

  const note = broad ? "11개 대분류" : "78개 세부업종";
  const span = period === "1d" ? "당일" : period === "1w" ? "최근 5거래일" : "최근 20거래일";

  return (
    <Card
      title="섹터 강약"
      right={
        <div className="flex items-center gap-1.5">
          <Tabs value={scope} onChange={setScope} items={[{ key: "detail", label: "세부" }, { key: "broad", label: "대분류" }]} />
          <Tabs value={period} onChange={setPeriod} items={PERIODS} />
        </div>
      }
    >
      <div className="mb-2 text-[11px] text-muted">
        {note} · {span} · 시가총액 가중
      </div>
      {isLoading && !data ? (
        <div className="h-64 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-up mb-2">강한 섹터</div>
            <div className="flex flex-col gap-2">
              {strong.map((s) => (
                <SectorBar key={s.key} s={s} max={max} group={scope} period={period} onPick={pick} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-down mb-2">약한 섹터</div>
            <div className="flex flex-col gap-2">
              {weak.map((s) => (
                <SectorBar key={s.key} s={s} max={max} group={scope} period={period} onPick={pick} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
