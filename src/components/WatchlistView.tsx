"use client";
import Link from "next/link";
import useSWR from "swr";
import { X } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";
import { num, pct, signColor } from "@/lib/format";
import { useWatchlist, type WatchItem } from "@/lib/watchlist";
import { koName } from "@/lib/usKo";
import type { Quote } from "@/lib/types";
import type { UsQuote } from "@/lib/us";

function KrRow({ it, onRemove }: { it: WatchItem; onRemove: () => void }) {
  const { data } = useSWR<{ data: Quote }>(`/api/quote?code=${it.code}`, fetcher, {
    refreshInterval: 60_000,
  });
  const q = data?.data;
  return (
    <li className="flex items-center gap-2 rounded-lg border border-line/60 px-3 py-2 text-sm">
      <Link
        href={`/stock?code=${it.code}&name=${encodeURIComponent(it.name)}`}
        className="min-w-0 flex-1 truncate font-medium hover:text-brand hover:underline"
      >
        {it.name}
        <span className="tnum ml-1.5 text-[11px] text-muted">{it.code}</span>
      </Link>
      <span className="tnum shrink-0 text-sm">{q ? num(q.price) : "-"}</span>
      <span
        className={`tnum w-16 shrink-0 text-right text-sm font-semibold ${signColor(q?.changePct ?? 0)}`}
      >
        {q ? pct(q.changePct) : "-"}
      </span>
      <button onClick={onRemove} className="shrink-0 text-muted hover:text-down" title="삭제">
        <X size={14} />
      </button>
    </li>
  );
}

function UsRow({ it, onRemove }: { it: WatchItem; onRemove: () => void }) {
  const { data } = useSWR<{ data: UsQuote[] }>(
    `/api/us-stock?part=detail&symbol=${it.code}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const d = (data?.data ?? {}) as { price?: number; changePct?: number };
  return (
    <li className="flex items-center gap-2 rounded-lg border border-line/60 px-3 py-2 text-sm">
      <Link
        href={`/us/stock?symbol=${it.code}`}
        className="min-w-0 flex-1 truncate font-medium hover:text-brand hover:underline"
      >
        {koName(it.code) ?? it.name}
        <span className="tnum ml-1.5 text-[11px] text-muted">{it.code}</span>
      </Link>
      <span className="tnum shrink-0 text-sm">{d.price ? num(d.price, 2) : "-"}</span>
      <span
        className={`tnum w-16 shrink-0 text-right text-sm font-semibold ${signColor(d.changePct ?? 0)}`}
      >
        {d.changePct !== undefined ? pct(d.changePct) : "-"}
      </span>
      <button onClick={onRemove} className="shrink-0 text-muted hover:text-down" title="삭제">
        <X size={14} />
      </button>
    </li>
  );
}

export function WatchlistView() {
  const { items, remove } = useWatchlist();
  const kr = items.filter((x) => x.market === "KR");
  const us = items.filter((x) => x.market === "US");

  return (
    <Card
      title="관심종목"
      right={<span className="text-xs text-muted">{items.length}종목 · 이 브라우저에 저장</span>}
    >
      {!items.length ? (
        <div className="grid h-28 place-items-center px-4 text-center text-sm text-muted">
          종목 화면에서 별(☆) 버튼을 누르면 여기에 모입니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { label: "한국", rows: kr },
            { label: "미국", rows: us },
          ].map(
            (g) =>
              g.rows.length > 0 && (
                <div key={g.label}>
                  <div className="mb-1.5 text-xs font-semibold text-muted">{g.label}</div>
                  <ul className="flex flex-col gap-1.5">
                    {g.rows.map((it) =>
                      it.market === "KR" ? (
                        <KrRow
                          key={`KR-${it.code}`}
                          it={it}
                          onRemove={() => remove(it.code, "KR")}
                        />
                      ) : (
                        <UsRow
                          key={`US-${it.code}`}
                          it={it}
                          onRemove={() => remove(it.code, "US")}
                        />
                      ),
                    )}
                  </ul>
                </div>
              ),
          )}
        </div>
      )}
    </Card>
  );
}
