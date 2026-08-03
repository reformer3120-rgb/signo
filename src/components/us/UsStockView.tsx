"use client";
import { useState } from "react";
import { useSticky } from "@/lib/useSticky";
import useSWR from "swr";
import { Search } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { CandleChart, type Indicators } from "@/components/CandleChart";
import { IndicatorBar } from "@/components/IndicatorBar";
import { MaLegend } from "@/components/MaLegend";
import { num, pct, signColor } from "@/lib/format";
import type { Candle } from "@/lib/types";
import { useCur, CurrencyToggle, StockName } from "@/components/us/UsCurrency";
import { koName } from "@/lib/usKo";
import type { UsDetail, UsFinRow, UsNews, UsSearchItem, UsSectorRank } from "@/lib/us";

const TABS = [
  { key: "min", label: "분봉" },
  { key: "1D", label: "일봉" },
  { key: "1W", label: "주봉" },
  { key: "1M", label: "월봉" },
  { key: "1Y", label: "연봉" },
];
const MIN_UNITS = ["1m", "5m", "15m", "30m", "60m"];

/** 달러 금액 축약 */
function usd(v: number) {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e12) return `${s}${(a / 1e12).toFixed(2)}T$`;
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B$`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M$`;
  return `${s}${a.toLocaleString("en-US")}$`;
}

const RECO_KO: Record<string, string> = {
  strong_buy: "적극 매수",
  buy: "매수",
  hold: "중립",
  underperform: "비중축소",
  sell: "매도",
};

function SymbolSearch({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useSWR<{ data: UsSearchItem[] }>(
    q.trim() ? `/api/us-stock?part=search&q=${encodeURIComponent(q)}` : null,
    fetcher,
    { keepPreviousData: true },
  );
  const items = data?.data ?? [];

  return (
    <div className="relative w-60">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 focus-within:border-brand">
        <Search size={15} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="티커 · 종목명 검색"
          className="w-full bg-transparent text-sm outline-none placeholder:font-normal placeholder:text-muted"
        />
      </div>
      {open && q.trim() && items.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-canvas shadow-lg">
          {items.map((it) => (
            <li key={it.symbol}>
              <button
                onMouseDown={() => {
                  onSelect(it.symbol);
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface"
              >
                <span className="tnum font-semibold">{it.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-left text-xs text-muted">
                  {koName(it.symbol) ?? it.name}
                </span>
                <span className="text-[11px] text-muted">{it.exchange}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas/40 px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="tnum mt-0.5 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function DetailCard({ symbol }: { symbol: string }) {
  const { money, big } = useCur();
  const { data } = useSWR<{ data: UsDetail }>(
    `/api/us-stock?part=detail&symbol=${symbol}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const d = data?.data;
  if (!d)
    return (
      <Card title="종목 상세">
        <div className="h-24 animate-pulse rounded-lg bg-line/30" />
      </Card>
    );
  return (
    <Card
      title="종목 상세"
      right={
        <span className="text-xs text-muted">
          {d.sector}
          {d.industry && ` · ${d.industry}`}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <Item label="시가총액" value={big(d.marketCap)} />
        <Item label="PER" value={d.per ? `${d.per.toFixed(1)}배` : "-"} />
        <Item label="선행 PER" value={d.forwardPer ? `${d.forwardPer.toFixed(1)}배` : "-"} />
        <Item label="PBR" value={d.pbr ? `${d.pbr.toFixed(1)}배` : "-"} />
        <Item label="EPS" value={d.eps ? money(d.eps) : "-"} />
        <Item label="배당수익률" value={d.dividendYield ? `${d.dividendYield.toFixed(2)}%` : "-"} />
        <Item label="ROE" value={d.roe ? `${d.roe.toFixed(1)}%` : "-"} />
        <Item label="순이익률" value={d.profitMargin ? `${d.profitMargin.toFixed(1)}%` : "-"} />
        <Item label="매출성장률" value={d.revenueGrowth ? `${d.revenueGrowth.toFixed(1)}%` : "-"} />
        <Item label="부채비율" value={d.debtToEquity ? `${d.debtToEquity.toFixed(0)}%` : "-"} />
        <Item label="기관보유" value={d.heldByInstitutions ? `${d.heldByInstitutions.toFixed(1)}%` : "-"} />
        <Item label="베타" value={d.beta ? d.beta.toFixed(2) : "-"} />
        <Item
          label="목표주가"
          value={d.targetPrice ? `${money(d.targetPrice)} (${d.upside > 0 ? "+" : ""}${d.upside}%)` : "-"}
        />
        <Item
          label="투자의견"
          value={
            d.recommendMean
              ? `${RECO_KO[d.recommendKey] ?? d.recommendKey} ${d.recommendMean.toFixed(2)}`
              : "-"
          }
        />
        <Item label="52주 최고" value={d.high52 ? money(d.high52) : "-"} />
        <Item label="52주 최저" value={d.low52 ? money(d.low52) : "-"} />
      </div>
    </Card>
  );
}

function FinancialsCard({ symbol }: { symbol: string }) {
  const { money, big } = useCur();
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");
  const { data } = useSWR<{ data: UsFinRow[] }>(
    `/api/us-stock?part=financials&symbol=${symbol}&period=${period}`,
    fetcher,
    { keepPreviousData: true },
  );
  const rows = data?.data ?? [];
  const tab = (p: "annual" | "quarterly", label: string) => (
    <button
      onClick={() => setPeriod(p)}
      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
        period === p ? "bg-brand text-white" : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  const LINES: [string, (r: UsFinRow) => string][] = [
    ["매출액", (r) => big(r.revenue)],
    ["매출총이익", (r) => big(r.grossProfit)],
    ["영업이익", (r) => big(r.operatingIncome)],
    ["순이익", (r) => big(r.netIncome)],
    ["영업이익률", (r) => `${r.operatingMargin}%`],
    ["순이익률", (r) => `${r.netMargin}%`],
    ["EPS", (r) => money(r.eps)],
  ];

  return (
    <Card
      title="재무제표"
      right={
        <div className="flex gap-1 rounded-lg bg-line/30 p-0.5">
          {tab("annual", "연간")}
          {tab("quarterly", "분기")}
        </div>
      }
    >
      {!rows.length ? (
        <div className="h-40 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 pl-1 text-left font-medium">항목</th>
                {rows.map((r) => (
                  <th key={r.period} className="whitespace-nowrap px-2 text-right font-medium">
                    {r.period}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINES.map(([label, fn]) => (
                <tr key={label} className="border-b border-line/40">
                  <td className="whitespace-nowrap py-2 pl-1 font-medium">{label}</td>
                  {rows.map((r) => (
                    <td key={r.period} className="tnum whitespace-nowrap px-2 text-right">
                      {fn(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function scoreColor(s: number) {
  if (s >= 70) return "text-confirm";
  if (s >= 45) return "text-signal";
  return "text-muted";
}

function SectorCard({
  symbol,
  onSelect,
}: {
  symbol: string;
  onSelect: (s: string) => void;
}) {
  const { data } = useSWR<{ data: UsSectorRank }>(
    `/api/us-stock?part=sector&symbol=${symbol}`,
    fetcher,
    { refreshInterval: 900_000, keepPreviousData: true },
  );
  const r = data?.data;
  return (
    <Card title="섹터 종합평가" right={<span className="text-xs text-muted">{r?.sector ?? "야후"}</span>}>
      {!r ? (
        <div className="h-56 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <>
          {r.target && (
            <div className="mb-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="shrink-0 text-center">
                  <div className={`tnum text-3xl font-bold ${scoreColor(r.target.score)}`}>
                    {r.target.score}
                  </div>
                  <div className="text-[11px] text-muted">점 / 100</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {koName(r.target.symbol) ?? r.target.name}{" "}
                    <span className="tnum text-xs font-normal text-muted">{r.target.symbol}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {r.sector} 내 <b className="text-fg">{r.rank}위</b> / {r.total}종목
                  </div>
                  <div className="tnum mt-1 text-[11px] text-muted">
                    PER {r.target.per || "-"} · PBR {r.target.pbr || "-"} · 배당{" "}
                    {r.target.dividendYield || 0}% · 1년 {r.target.year1 > 0 ? "+" : ""}
                    {r.target.year1}%
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {(
                  [
                    ["밸류", r.target.parts.밸류],
                    ["성장", r.target.parts.성장],
                    ["수익성", r.target.parts.수익성],
                    ["모멘텀", r.target.parts.모멘텀],
                    ["배당", r.target.parts.배당],
                    ["규모", r.target.parts.규모],
                  ] as [string, number][]
                ).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-canvas/60 px-1.5 py-1.5 text-center">
                    <div className="truncate text-[10px] text-muted">{k}</div>
                    <div className="tnum text-sm font-bold">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mb-1.5 text-xs text-muted">
            {r.sector} 대표 종목 (종합점수순) · 클릭하면 해당 종목으로 이동
          </div>
          <ol className="flex flex-col gap-1">
            {r.ranked.map((s) => {
              const me = s.symbol === symbol;
              return (
                <li
                  key={s.symbol}
                  onClick={() => !me && onSelect(s.symbol)}
                  role={me ? undefined : "button"}
                  tabIndex={me ? undefined : 0}
                  onKeyDown={(e) => {
                    if (!me && (e.key === "Enter" || e.key === " ")) onSelect(s.symbol);
                  }}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${
                    me
                      ? "border border-brand/30 bg-brand/10"
                      : "cursor-pointer border border-line/50 hover:border-brand/40 hover:bg-brand/5"
                  }`}
                >
                  <span className="tnum w-6 shrink-0 text-xs text-muted">{s.rank}</span>
                  <StockName symbol={s.symbol} fallback={s.name} className="min-w-0 flex-1" />
                  <span className="tnum hidden shrink-0 text-[11px] text-muted sm:inline">
                    PER {s.per || "-"}
                  </span>
                  <span className={`tnum w-16 shrink-0 text-right text-[11px] ${signColor(s.year1)}`}>
                    {s.year1 > 0 ? "+" : ""}
                    {s.year1}%
                  </span>
                  <span className={`tnum w-9 shrink-0 text-right text-sm font-bold ${scoreColor(s.score)}`}>
                    {s.score}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 text-[11px] leading-relaxed text-muted">
            점수 = 밸류(PER·PBR·EPS) 25 + 모멘텀(1년·200일선·50일선) 22 + 성장(선행EPS 개선) 20 +
            수익성(선행PER) 18 + 배당 8 + 규모 7 (섹터 내 상대평가, 100점)
          </div>
        </>
      )}
    </Card>
  );
}

function NewsCard({ symbol }: { symbol: string }) {
  const { data } = useSWR<{ data: UsNews[] }>(`/api/us-stock?part=news&symbol=${symbol}`, fetcher, {
    refreshInterval: 600_000,
  });
  const rows = data?.data ?? [];
  return (
    <Card title="관련 뉴스" right={<span className="text-xs text-muted">야후 파이낸스</span>}>
      {!rows.length ? (
        <div className="h-32 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((n, i) => (
            <li key={i}>
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-baseline gap-2 rounded-lg border border-line/50 px-3 py-2 text-sm transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
                <span className="shrink-0 text-[11px] text-muted">{n.publisher}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function UsStockView({ initialSymbol }: { initialSymbol?: string } = {}) {
  const [symbol, setSymbol] = useState(initialSymbol ?? "AAPL");
  const [tab, setTab] = useSticky("us.stock.tab", "1D");
  const [minU, setMinU] = useSticky("us.stock.min", "5m");
  const { money } = useCur();
  const [ind, setInd] = useState<Indicators>({});

  const { data: detail } = useSWR<{ data: UsDetail }>(
    `/api/us-stock?part=detail&symbol=${symbol}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const { data: chart, isLoading } = useSWR<{ data: Candle[] }>(
    `/api/us-stock?part=chart&symbol=${symbol}&kind=${tab === "min" ? minU : tab}`,
    fetcher,
    { refreshInterval: tab === "min" ? 60_000 : 0, keepPreviousData: true },
  );
  const d = detail?.data;
  const candles = chart?.data ?? [];
  const hi = candles.length ? Math.max(...candles.map((c) => c.high)) : 0;
  const lo = candles.length ? Math.min(...candles.map((c) => c.low)) : 0;

  return (
    <>
      <div className="sticky top-[3.4rem] z-20 flex w-fit flex-wrap items-center gap-2">
        <SymbolSearch onSelect={setSymbol} />
        <CurrencyToggle />
      </div>

      <Card>
        {/* 티커·현재가 — 카드가 보이는 동안 고정 */}
        <div className="sticky top-[5.9rem] z-10 mb-2 rounded-lg border border-line/60 bg-surface/95 px-3 py-2 backdrop-blur">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xl font-semibold">{koName(symbol) ?? d?.name ?? symbol}</span>
            <span className="tnum text-xs text-muted">{symbol}</span>
            {d && (
              <>
                <span className="tnum text-xl font-bold">{money(d.price)}</span>
                <span className={`tnum text-sm font-semibold ${signColor(d.changePct)}`}>
                  {pct(d.changePct)}
                </span>
              </>
            )}
            {!!hi && (
              <div className="ml-auto flex items-center gap-2.5 text-xs text-muted">
                <span>
                  고 <b className="tnum text-up">{money(hi)}</b>
                </span>
                <span>
                  저 <b className="tnum text-down">{money(lo)}</b>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <IndicatorBar value={ind} onChange={setInd} />
            {ind.ma && <MaLegend />}
          </div>
          <div className="flex items-center gap-2">
          {tab === "min" && (
            <select
              value={minU}
              onChange={(e) => setMinU(e.target.value)}
              className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs font-medium outline-none focus:border-brand"
            >
              {MIN_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u.replace("m", "분")}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === t.key ? "bg-brand text-white" : "text-muted hover:text-fg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          </div>
        </div>

        {isLoading && !candles.length ? (
          <div className="h-[440px] animate-pulse rounded-lg bg-line/40" />
        ) : candles.length ? (
          <CandleChart data={candles} indicators={ind} session={tab === "min"} precision={2} />
        ) : (
          <div className="grid h-[440px] place-items-center text-sm text-muted">데이터 없음</div>
        )}
      </Card>

      <DetailCard symbol={symbol} />
      <FinancialsCard symbol={symbol} />
      <SectorCard
        symbol={symbol}
        onSelect={(s) => {
          setSymbol(s);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
      <NewsCard symbol={symbol} />
    </>
  );
}
