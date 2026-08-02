"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { CandleChart, type Indicators } from "@/components/CandleChart";
import { IndicatorBar } from "@/components/IndicatorBar";
import { MaLegend } from "@/components/MaLegend";
import { compactWon, num, pct, signColor } from "@/lib/format";
import type { Candle, Quote } from "@/lib/types";

interface Flow {
  date: string;
  breadth: { upper: number; up: number; flat: number; down: number; lower: number };
  spot: { personal: number; foreign: number; institutional: number; program: number };
  futures: { personal: number; foreign: number; institutional: number } | null;
}

const CHART_TABS = [
  { key: "min", label: "분" },
  { key: "1D", label: "일" },
  { key: "1W", label: "주" },
  { key: "1M", label: "월" },
  { key: "1Y", label: "년" },
];

function Chip({ label, text, cls }: { label: string; text: string; cls: string }) {
  return (
    <div className="flex flex-col items-center rounded-md bg-canvas/50 px-1 py-1.5">
      <span className="text-[10px] text-muted">{label}</span>
      <span className={`tnum text-xs font-semibold ${cls}`}>{text}</span>
    </div>
  );
}

const MIN_UNITS = ["1m", "5m", "15m", "30m", "60m"];

function IndexPane({ market, label, flow }: { market: "KOSPI" | "KOSDAQ"; label: string; flow?: Flow }) {
  const [ctab, setCtab] = useState("1D");
  const [minU, setMinU] = useState("5m");
  const [ind, setInd] = useState<Indicators>({});
  const kind = ctab === "min" ? minU : ctab;
  const { data: idx } = useSWR<{ data: Quote[] }>("/api/indices", fetcher, { refreshInterval: 30_000 });
  const { data: chart } = useSWR<{ data: Candle[] }>(
    `/api/index-chart?market=${market}&kind=${kind}`,
    fetcher,
    { refreshInterval: ctab === "min" ? 60_000 : 600_000 },
  );
  const q = idx?.data?.find((x) => x.name === label);
  const candles = chart?.data ?? [];
  const s = flow?.spot;
  const f = flow?.futures;

  return (
    <div className="min-w-0 rounded-lg border border-line/60 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{label}</span>
          {q && (
            <>
              <span className="tnum text-lg font-bold">{num(q.price, 2)}</span>
              <span className={`tnum text-sm font-medium ${signColor(q.changePct)}`}>{pct(q.changePct)}</span>
            </>
          )}
        </div>
      </div>
      {/* 지표와 봉주기를 같은 선상에 배치 */}
      <div className="mb-1.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <IndicatorBar value={ind} onChange={setInd} />
          {ind.ma && <MaLegend />}
        </div>
        <div className="flex items-center gap-1">
          {ctab === "min" && (
            <select
              value={minU}
              onChange={(e) => setMinU(e.target.value)}
              className="rounded-md border border-line bg-canvas px-1.5 py-0.5 text-xs font-medium outline-none focus:border-brand"
            >
              {MIN_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u.replace("m", "분")}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-0.5 rounded-lg bg-canvas/50 p-0.5">
            {CHART_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setCtab(t.key)}
                className={`px-2 py-0.5 rounded-md text-xs font-medium ${ctab === t.key ? "bg-brand text-white" : "text-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {candles.length ? (
        <CandleChart data={candles} height={230} indicators={ind} session={ctab === "min" || ctab === "1D"} />
      ) : (
        <div className="h-[230px] animate-pulse rounded-lg bg-line/30" />
      )}

      {flow?.breadth && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md bg-canvas/50 py-1.5 text-xs font-medium">
          <span className="text-up">↑ <span className="tnum">{num(flow.breadth.up)}</span></span>
          {flow.breadth.upper > 0 && (
            <span className="text-up/70">상한 <span className="tnum">{flow.breadth.upper}</span></span>
          )}
          <span className="text-muted">보합 <span className="tnum">{num(flow.breadth.flat)}</span></span>
          <span className="text-down">↓ <span className="tnum">{num(flow.breadth.down)}</span></span>
          {flow.breadth.lower > 0 && (
            <span className="text-down/70">하한 <span className="tnum">{flow.breadth.lower}</span></span>
          )}
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] text-muted mb-1">현물 수급</div>
          {s ? (
            <div className="grid grid-cols-4 gap-1">
              <Chip label="개인" text={compactWon(s.personal)} cls={signColor(s.personal)} />
              <Chip label="외인" text={compactWon(s.foreign)} cls={signColor(s.foreign)} />
              <Chip label="기관" text={compactWon(s.institutional)} cls={signColor(s.institutional)} />
              <Chip label="프로그램" text={compactWon(s.program)} cls={signColor(s.program)} />
            </div>
          ) : (
            <div className="h-9 animate-pulse rounded bg-line/30" />
          )}
        </div>
        <div>
          <div className="text-[11px] text-muted mb-1">선물 수급 (계약)</div>
          {f ? (
            <div className="grid grid-cols-3 gap-1">
              <Chip label="개인" text={num(f.personal)} cls={signColor(f.personal)} />
              <Chip label="외인" text={num(f.foreign)} cls={signColor(f.foreign)} />
              <Chip label="기관" text={num(f.institutional)} cls={signColor(f.institutional)} />
            </div>
          ) : (
            <div className="grid h-9 place-items-center rounded bg-canvas/40 text-[11px] text-muted/60">
              선물 데이터 없음
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function IndexSection() {
  const { data: flows } = useSWR<{ KOSPI: Flow; KOSDAQ: Flow }>("/api/index-flow", fetcher, {
    refreshInterval: 60_000,
  });

  return (
    <Card title="지수 · 수급" right={<span className="text-xs text-muted">코스피 · 코스닥</span>}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <IndexPane market="KOSPI" label="코스피" flow={flows?.KOSPI} />
        <IndexPane market="KOSDAQ" label="코스닥" flow={flows?.KOSDAQ} />
      </div>
    </Card>
  );
}
