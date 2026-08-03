"use client";
import { useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { CandleChart, type Indicators } from "@/components/CandleChart";
import { IndicatorBar } from "@/components/IndicatorBar";
import { MaLegend } from "@/components/MaLegend";
import { num, pct, signColor } from "@/lib/format";
import type { Candle } from "@/lib/types";
import type { UsDetail, UsFinRow, UsNews, UsSearchItem } from "@/lib/us";

const TABS = [
  { key: "5m", label: "분봉" },
  { key: "1D", label: "일봉" },
  { key: "1W", label: "주봉" },
  { key: "1M", label: "월봉" },
  { key: "1Y", label: "연봉" },
];

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
                <span className="min-w-0 flex-1 truncate text-left text-xs text-muted">{it.name}</span>
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
        <Item label="시가총액" value={usd(d.marketCap)} />
        <Item label="PER" value={d.per ? `${d.per.toFixed(1)}배` : "-"} />
        <Item label="선행 PER" value={d.forwardPer ? `${d.forwardPer.toFixed(1)}배` : "-"} />
        <Item label="PBR" value={d.pbr ? `${d.pbr.toFixed(1)}배` : "-"} />
        <Item label="EPS" value={d.eps ? `${d.eps.toFixed(2)}$` : "-"} />
        <Item label="배당수익률" value={d.dividendYield ? `${d.dividendYield.toFixed(2)}%` : "-"} />
        <Item label="ROE" value={d.roe ? `${d.roe.toFixed(1)}%` : "-"} />
        <Item label="순이익률" value={d.profitMargin ? `${d.profitMargin.toFixed(1)}%` : "-"} />
        <Item label="매출성장률" value={d.revenueGrowth ? `${d.revenueGrowth.toFixed(1)}%` : "-"} />
        <Item label="부채비율" value={d.debtToEquity ? `${d.debtToEquity.toFixed(0)}%` : "-"} />
        <Item label="기관보유" value={d.heldByInstitutions ? `${d.heldByInstitutions.toFixed(1)}%` : "-"} />
        <Item label="베타" value={d.beta ? d.beta.toFixed(2) : "-"} />
        <Item
          label="목표주가"
          value={d.targetPrice ? `${num(d.targetPrice, 2)} (${d.upside > 0 ? "+" : ""}${d.upside}%)` : "-"}
        />
        <Item
          label="투자의견"
          value={
            d.recommendMean
              ? `${RECO_KO[d.recommendKey] ?? d.recommendKey} ${d.recommendMean.toFixed(2)}`
              : "-"
          }
        />
        <Item label="52주 최고" value={d.high52 ? num(d.high52, 2) : "-"} />
        <Item label="52주 최저" value={d.low52 ? num(d.low52, 2) : "-"} />
      </div>
    </Card>
  );
}

function FinancialsCard({ symbol }: { symbol: string }) {
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
    ["매출액", (r) => usd(r.revenue)],
    ["매출총이익", (r) => usd(r.grossProfit)],
    ["영업이익", (r) => usd(r.operatingIncome)],
    ["순이익", (r) => usd(r.netIncome)],
    ["영업이익률", (r) => `${r.operatingMargin}%`],
    ["순이익률", (r) => `${r.netMargin}%`],
    ["EPS", (r) => `${r.eps}$`],
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

export function UsStockView() {
  const [symbol, setSymbol] = useState("AAPL");
  const [tab, setTab] = useState("1D");
  const [ind, setInd] = useState<Indicators>({});

  const { data: detail } = useSWR<{ data: UsDetail }>(
    `/api/us-stock?part=detail&symbol=${symbol}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const { data: chart, isLoading } = useSWR<{ data: Candle[] }>(
    `/api/us-stock?part=chart&symbol=${symbol}&kind=${tab}`,
    fetcher,
    { refreshInterval: tab === "5m" ? 60_000 : 0, keepPreviousData: true },
  );
  const d = detail?.data;
  const candles = chart?.data ?? [];
  const hi = candles.length ? Math.max(...candles.map((c) => c.high)) : 0;
  const lo = candles.length ? Math.min(...candles.map((c) => c.low)) : 0;

  return (
    <>
      <div className="sticky top-[3.4rem] z-20 w-fit">
        <SymbolSearch onSelect={setSymbol} />
      </div>

      <Card>
        {/* 티커·현재가 — 카드가 보이는 동안 고정 */}
        <div className="sticky top-[5.9rem] z-10 mb-2 rounded-lg border border-line/60 bg-surface/95 px-3 py-2 backdrop-blur">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tnum text-xl font-semibold">{symbol}</span>
            {d && (
              <>
                <span className="text-xs text-muted">{d.name}</span>
                <span className="tnum text-xl font-bold">{num(d.price, 2)}</span>
                <span className={`tnum text-sm font-semibold ${signColor(d.changePct)}`}>
                  {pct(d.changePct)}
                </span>
              </>
            )}
            {!!hi && (
              <div className="ml-auto flex items-center gap-2.5 text-xs text-muted">
                <span>
                  고 <b className="tnum text-up">{num(hi, 2)}</b>
                </span>
                <span>
                  저 <b className="tnum text-down">{num(lo, 2)}</b>
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

        {isLoading && !candles.length ? (
          <div className="h-[440px] animate-pulse rounded-lg bg-line/40" />
        ) : candles.length ? (
          <CandleChart data={candles} indicators={ind} session={tab === "5m"} precision={2} />
        ) : (
          <div className="grid h-[440px] place-items-center text-sm text-muted">데이터 없음</div>
        )}
      </Card>

      <DetailCard symbol={symbol} />
      <FinancialsCard symbol={symbol} />
      <NewsCard symbol={symbol} />
    </>
  );
}
