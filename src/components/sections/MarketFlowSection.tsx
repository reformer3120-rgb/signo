"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { GradeBadge, useGrades } from "@/components/GradeBadge";
import { useSticky } from "@/lib/useSticky";
import { compactWon, num, pct, signColor } from "@/lib/format";
import type { FiRow } from "@/lib/kis";

const BY_LABEL: Record<string, string> = {
  net: "외국인·기관",
  foreign: "외국인",
  inst: "기관",
};

const MARKETS = [
  { key: "ALL", label: "전체" },
  { key: "KOSPI", label: "코스피" },
  { key: "KOSDAQ", label: "코스닥" },
] as const;

/** 순매수 대금 (KIS는 백만원 단위) */
function Flow({ v }: { v: number }) {
  return (
    <td className={`text-right tnum px-2 whitespace-nowrap ${signColor(v)}`}>
      {v > 0 ? "+" : ""}
      {compactWon(v * 1e6)}
    </td>
  );
}

const SESSION_LABEL: Record<string, string> = {
  PRE: "NXT 프리마켓",
  REGULAR: "정규장",
  AFTER: "NXT 애프터마켓",
  CLOSED: "장 마감",
};

export function MarketFlowSection() {
  const [market, setMarket] = useState<"ALL" | "KOSPI" | "KOSDAQ">("ALL");
  const [dir, setDir] = useState<"buy" | "sell">("buy");
  // 어느 주체 기준으로 순위를 볼지 — 종합(외국인+기관) / 외국인 / 기관
  const [by, setBy] = useSticky<"net" | "foreign" | "inst">("kr.flow.by", "net");
  const { data, isLoading } = useSWR<{
    data: FiRow[];
    needKey?: boolean;
    mode?: "KRX+NXT" | "NXT" | "PENDING";
    session?: string;
  }>(`/api/market-flow?market=${market}&dir=${dir}&by=${by}`, fetcher, {
    refreshInterval: 120_000,
    keepPreviousData: true,
  });
  const rows = (data?.data ?? []).slice(0, 15);
  // 종목명 옆에 종합평가 등급 — 이미 모아 둔 지표로 계산만 한다
  const grades = useGrades(rows.map((r) => r.code));
  // 순매수(가집계) 이전: 거래대금 상위로 대체 표시
  const byValue = data?.mode === "NXT" || data?.mode === "PENDING";
  const nxtOnly = data?.mode === "NXT";

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {byValue
            ? `시장 수급 · ${nxtOnly ? "NXT" : "통합"} 거래대금 상위`
            : `시장 수급 · ${BY_LABEL[by]} ${dir === "sell" ? "순매도" : "순매수"} 상위`}
          {/* 현재 거래 세션(정규장 / NXT 프리·애프터마켓) */}
          {data?.session && (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                data.session === "REGULAR"
                  ? "border-confirm/40 bg-confirm/10 text-confirm"
                  : data.session === "CLOSED"
                    ? "border-line text-muted"
                    : "border-signal/40 bg-signal/10 text-signal"
              }`}
            >
              {SESSION_LABEL[data.session] ?? data.session}
            </span>
          )}
        </span>
      }
      right={
        <div className="flex items-center gap-2">
          {/* 순위를 매길 주체 — 데이터는 같고 정렬 기준만 달라진다 */}
          {!byValue && (
            <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
              {(
                [
                  ["net", "종합"],
                  ["foreign", "외국인"],
                  ["inst", "기관"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setBy(k)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    by === k ? "bg-brand text-white" : "text-muted hover:text-fg"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          {!byValue && (
            <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
              {([
                ["buy", "순매수"],
                ["sell", "순매도"],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setDir(k)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    dir === k
                      ? k === "buy"
                        ? "bg-up text-white"
                        : "bg-down text-white"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        <div className="flex items-center gap-1 rounded-lg bg-canvas/50 p-1">
          {MARKETS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMarket(m.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                market === m.key ? "bg-brand text-white" : "text-muted hover:text-fg"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        </div>
      }
    >
      {data?.needKey ? (
        <div className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
          KIS API 키가 설정되면 표시됩니다.
        </div>
      ) : isLoading && !rows.length ? (
        <div className="h-72 animate-pulse rounded-lg bg-line/30" />
      ) : (
        <div className="overflow-x-auto">
          {/*
            탭을 바꾸면 순매수 열이 둘에서 하나로 준다. 폭이 자동이면 남는 공간을
            다시 나눠 가지면서 현재가·등락률 자리가 매번 움직였다.
            폭을 비율로 못 박되, 한 주체만 볼 때는 그 열이 두 열 몫(26%)을 가져가
            합계가 늘 100%가 되게 한다 → 표는 꽉 차고 다른 열은 제자리에 있다.
          */}
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: byValue ? "30%" : "26%" }} />
              <col style={{ width: byValue ? "15%" : "13%" }} />
              <col style={{ width: byValue ? "13%" : "11%" }} />
              {byValue ? (
                <col style={{ width: "22%" }} />
              ) : by === "net" ? (
                <>
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                </>
              ) : (
                <col style={{ width: "26%" }} />
              )}
              <col style={{ width: byValue ? "20%" : "13%" }} />
              {!byValue && <col style={{ width: "11%" }} />}
            </colgroup>
            <thead>
              <tr className="text-xs text-muted border-b border-line">
                <th className="text-left font-medium py-2 pl-1">종목</th>
                <th className="text-right font-medium px-2">현재가</th>
                <th className="text-right font-medium px-2">등락률</th>
                {byValue ? (
                  <th className="text-right font-medium px-2 whitespace-nowrap">
                    {nxtOnly ? "NXT" : "통합"} 거래대금
                  </th>
                ) : (
                  <>
                    {/* 고른 주체의 열만 — 종합일 때만 둘 다 */}
                    {by !== "inst" && (
                      <th className="text-right font-medium px-2 whitespace-nowrap">
                        외국인 {dir === "sell" ? "순매도" : "순매수"}
                      </th>
                    )}
                    {by !== "foreign" && (
                      <th className="text-right font-medium px-2 whitespace-nowrap">
                        기관 {dir === "sell" ? "순매도" : "순매수"}
                      </th>
                    )}
                  </>
                )}
                <th className="text-right font-medium px-2 whitespace-nowrap">거래량</th>
                {!byValue && (
                  <th className="text-right font-medium px-2 whitespace-nowrap">NXT비중</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-line/40 hover:bg-surface/70">
                  <td className="max-w-0 py-1.5 pl-1 font-medium">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {/* 종목명도 등락에 따라 — 상승 빨강 / 하락 파랑 */}
                      <Link
                        href={`/stock?code=${r.code}&name=${encodeURIComponent(r.name)}`}
                        className={`min-w-0 truncate hover:underline ${signColor(r.changePct)}`}
                        title={r.name}
                      >
                        {r.name}
                      </Link>
                      <GradeBadge score={grades[r.code]} />
                    </div>
                  </td>
                  <td className="text-right tnum px-2">{num(r.price)}</td>
                  <td className={`text-right tnum px-2 ${signColor(r.changePct)}`}>{pct(r.changePct)}</td>
                  {byValue ? (
                    <td className="text-right tnum px-2 text-signal font-medium whitespace-nowrap">
                      {compactWon(r.nxtValue ?? 0)}
                    </td>
                  ) : (
                    <>
                      {by !== "inst" && <Flow v={r.foreignValue} />}
                      {by !== "foreign" && <Flow v={r.instValue} />}
                    </>
                  )}
                  <td className="text-right tnum px-2 text-muted">
                    {num(r.unVol > 0 ? r.unVol : r.krxVol)}
                  </td>
                  {!byValue && (
                    <td className="text-right tnum px-2">
                      {r.nxtShare >= 0 ? (
                        <span className={r.nxtShare >= 40 ? "text-signal font-semibold" : "text-muted"}>
                          {r.nxtShare}%
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-muted">
            {nxtOnly
              ? "NXT만 거래되는 시간대 — NXT 체결 기준 거래대금 상위 · KIS"
              : byValue
                ? "외국인·기관 순매수는 장 마감 후 가집계로 제공됩니다. 그전까지는 KRX+NXT 통합 거래대금 상위를 표시하며, 집계가 들어오면 자동으로 순매수 순위로 전환됩니다 · KIS"
                : `${BY_LABEL[by]} ${dir === "sell" ? "순매도" : "순매수"} 대금 순 · KRX 가집계 · 거래량은 KRX+NXT 통합 기준 · KIS`}
            <br />
            {/* 툴팁은 모바일에서 안 보인다 — 배지가 무엇인지 한 줄은 화면에 있어야 한다 */}
            종목명 옆 등급은 종합평가(기업 체력)이며 <b>주가 예측이 아닙니다</b>.
          </div>
        </div>
      )}
    </Card>
  );
}
