"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { num, signColor } from "@/lib/format";
import type { StockDetail, Returns, InvestorBias } from "@/lib/naverApi";
import type { Exch } from "@/components/ExchangeSelect";

interface DetailResp {
  detail: StockDetail;
  returns: Returns | null;
  bias: InvestorBias | null;
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas/40 px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="tnum mt-0.5 text-sm font-semibold truncate">{value}</div>
    </div>
  );
}

function Ret({ label, v }: { label: string; v?: number }) {
  const has = v !== undefined && v !== null;
  return (
    <div className="min-w-0 rounded-lg border border-line bg-canvas/40 px-1 py-2 text-center">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`tnum mt-0.5 text-xs sm:text-sm font-bold truncate ${has ? signColor(v!) : "text-muted"}`}>
        {/* 두 자리로 적는다. 한 자리로 줄였더니 머리의 -0.94% 와 카드의
            -0.9% 가 서로 다른 값처럼 보였다. 자리는 좁지만 그 대가가 크다. */}
        {has ? `${v! > 0 ? "+" : ""}${v!.toFixed(2)}%` : "-"}
      </div>
    </div>
  );
}

// 주 → 만주 축약
const manju = (v: number) => `${v > 0 ? "+" : ""}${(v / 10000).toFixed(0)}만`;

const LEADER_STYLE: Record<string, string> = {
  개인: "bg-up/10 text-up border-up/30",
  외국인: "bg-brand/10 text-brand border-brand/30",
  기관: "bg-down/10 text-down border-down/30",
};

export function StockDetailCard({ code, exch = "KRX" }: { code: string; exch?: Exch }) {
  // 거래소를 같이 넘긴다. 1일 수익률은 화면 머리의 등락률과 같은 시세에서
  // 나와야 한다 — 다르면 한 화면에 같은 이름의 값이 둘 뜬다.
  const { data } = useSWR<{ data: DetailResp }>(
    `/api/stock-detail?code=${code}&exchange=${exch}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true },
  );
  const d = data?.data?.detail;
  const r = data?.data?.returns;
  const b = data?.data?.bias;
  if (!d) {
    return (
      <Card title="종목 상세">
        <div className="h-24 animate-pulse rounded-lg bg-line/30" />
      </Card>
    );
  }
  return (
    <Card
      title="종목 상세"
      right={<span className="text-xs text-muted">{d.name}</span>}
    >
      {/* 수급 매수 우위 */}
      {b && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">최근 {b.days}거래일 수급</span>
          {b.leader !== "-" ? (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                LEADER_STYLE[b.leader] ?? "bg-muted/10 text-muted border-line"
              }`}
            >
              {b.leader} 매수우위
            </span>
          ) : (
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
              뚜렷한 우위 없음
            </span>
          )}
          <div className="tnum ml-auto flex gap-2.5 text-[11px]">
            <span>
              개인 <b className={signColor(b.개인)}>{manju(b.개인)}</b>
            </span>
            <span>
              외인 <b className={signColor(b.외국인)}>{manju(b.외국인)}</b>
            </span>
            <span>
              기관 <b className={signColor(b.기관)}>{manju(b.기관)}</b>
            </span>
          </div>
        </div>
      )}

      {/* 기간별 수익률 */}
      {r && (
        <div className="mb-3 grid grid-cols-5 gap-1.5">
          <Ret label="1일" v={r.d1} />
          <Ret label="1주" v={r.w1} />
          <Ret label="1달" v={r.m1} />
          <Ret label="6달" v={r.m6} />
          <Ret label="1년" v={r.y1} />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        <Item label="시가총액" value={d.marketCapText || "-"} />
        <Item label="PER" value={d.per ? `${d.per}배` : "-"} />
        <Item label="PBR" value={d.pbr ? `${d.pbr}배` : "-"} />
        <Item label="EPS" value={d.eps ? `${num(d.eps)}원` : "-"} />
        <Item label="BPS" value={d.bps ? `${num(d.bps)}원` : "-"} />
        <Item label="배당수익률" value={d.dividendYield ? `${d.dividendYield}%` : "-"} />
        <Item label="외국인비율" value={d.foreignRate || "-"} />
        <Item
          label="목표주가"
          value={d.priceTarget ? `${num(d.priceTarget)} (${d.upside > 0 ? "+" : ""}${d.upside}%)` : "-"}
        />
        <Item label="투자의견" value={d.recommMean ? `${d.recommMean.toFixed(2)} / 5` : "-"} />
        <Item label="추정PER" value={d.cnsPer ? `${d.cnsPer}배` : "-"} />
        <Item label="52주 최고" value={d.high52 ? num(d.high52) : "-"} />
        <Item label="52주 최저" value={d.low52 ? num(d.low52) : "-"} />
      </div>
    </Card>
  );
}
