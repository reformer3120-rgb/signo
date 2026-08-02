"use client";
import { useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { fetcher } from "@/lib/swr";
import type { SearchItem } from "@/lib/naverApi";

export function StockSearch({
  onSelect,
}: {
  onSelect: (code: string, name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useSWR<{ data: SearchItem[] }>(
    q.trim() ? `/api/search?q=${encodeURIComponent(q)}` : null,
    fetcher,
    { keepPreviousData: true },
  );
  const items = data?.data ?? [];

  return (
    <div className="relative w-60">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 focus-within:border-brand">
        <Search size={15} className="text-muted shrink-0" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="종목 검색"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted placeholder:font-normal"
        />
      </div>
      {open && q.trim() && items.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-line bg-canvas shadow-lg">
          {items.map((it) => (
            <li key={it.code}>
              <button
                onMouseDown={() => {
                  onSelect(it.code, it.name);
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-surface"
              >
                <span className="font-medium">{it.name}</span>
                <span className="tnum text-xs text-muted">
                  {it.code} · {it.market}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
