"use client";
import { useEffect, useState } from "react";
import { useSticky } from "@/lib/useSticky";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { useChartHeight } from "@/lib/useChartHeight";
import { KrSessionBadge } from "@/components/SessionBadge";
import { KrFuturesStrip } from "@/components/FuturesStrip";
import { CandleChart, type Indicators } from "@/components/CandleChart";
import { IndicatorBar } from "@/components/IndicatorBar";
import { MaLegend } from "@/components/MaLegend";
import { compactWon, num, pct, signColor } from "@/lib/format";
import type { Candle, Quote } from "@/lib/types";

interface Flow {
  date: string;
  breadth: { upper: number; up: number; flat: number; down: number; lower: number };
  nxt: { up: number; flat: number; down: number; traded: number; value: number } | null;
  spot: { personal: number; foreign: number; institutional: number; program: number };
  futures: { personal: number; foreign: number; institutional: number } | null;
  futQuote: { name: string; price: number; changePct: number } | null;
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
  const [ctab, setCtab] = useSticky(`kr.index.${market}.tab`, "1D");
  const [minU, setMinU] = useSticky(`kr.index.${market}.min`, "5m");
  const [ind, setInd] = useState<Indicators>({});
  const kind = ctab === "min" ? minU : ctab;
  // 대시보드 안이라 종목 차트보다 작게 잡는다
  const idxH = useChartHeight(0.24, 190, 640);
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
      <div className="mb-1.5 flex items-center justify-between gap-2 flex-wrap">
        <IndicatorBar value={ind} onChange={setInd} />
        {ind.ma && <MaLegend />}
      </div>
      {candles.length ? (
        <CandleChart
          data={candles}
          height={idxH}
          indicators={ind}
          session={ctab === "min" || ctab === "1D"}
          viewKey={`kridx:${market}:${kind}`}
        />
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

      {/* NXT(넥스트레이드) 등락 — NXT에서 실제 체결된 종목만 집계 */}
      {flow?.nxt && flow.nxt.traded > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-signal/25 bg-signal/5 py-1.5 text-xs font-medium">
          <span className="text-signal">NXT</span>
          <span className="text-up">↑ <span className="tnum">{num(flow.nxt.up)}</span></span>
          <span className="text-muted">보합 <span className="tnum">{num(flow.nxt.flat)}</span></span>
          <span className="text-down">↓ <span className="tnum">{num(flow.nxt.down)}</span></span>
          <span className="text-muted">
            거래 <span className="tnum">{num(flow.nxt.traded)}</span>종목 ·{" "}
            <span className="tnum">{compactWon(flow.nxt.value)}</span>
          </span>
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
          {/* 지수선물 시세는 카드 아래 전용 박스에서 한 번만 보여준다 */}
          <div className="mb-1 text-[11px] text-muted">선물 수급 (계약)</div>
          {f ? (
            <div className="grid grid-cols-3 gap-1">
              <Chip label="개인" text={num(f.personal)} cls={signColor(f.personal)} />
              <Chip label="외인" text={num(f.foreign)} cls={signColor(f.foreign)} />
              <Chip label="기관" text={num(f.institutional)} cls={signColor(f.institutional)} />
            </div>
          ) : (
            <div className="grid h-9 place-items-center rounded bg-canvas/40 text-[11px] text-muted/60">
              투자자별 수급은 코스피200 선물만 제공
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
    <Card
      title="지수 · 수급"
      right={
        <div className="flex items-center gap-2">
          <KrSessionBadge />
          <span className="text-xs text-muted">코스피 · 코스닥</span>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <IndexPane market="KOSPI" label="코스피" flow={flows?.KOSPI} />
        <IndexPane market="KOSDAQ" label="코스닥" flow={flows?.KOSDAQ} />
      </div>
      {/* 지수선물은 장전·장중·장 마감 어느 때나 보여준다 (마감 뒤에는 야간 흐름) */}
      <KrFuturesStrip />
    </Card>
  );
}
