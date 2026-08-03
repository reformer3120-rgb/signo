"use client";
import { useCallback, useEffect, useState } from "react";

export interface WatchItem {
  code: string; // 한국: 6자리, 미국: 티커
  name: string;
  market: "KR" | "US";
}

const KEY = "signo:watchlist";
const EVENT = "signo:watchlist-changed";

function read(): WatchItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WatchItem[]) : [];
  } catch {
    return [];
  }
}

/** 관심종목 (브라우저 저장) — 같은 화면의 여러 컴포넌트가 즉시 동기화된다 */
export function useWatchlist() {
  const [items, setItems] = useState<WatchItem[]>([]);

  useEffect(() => {
    setItems(read());
    const sync = () => setItems(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((next: WatchItem[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 저장 실패 무시 */
    }
    setItems(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const has = useCallback(
    (code: string, market: WatchItem["market"]) =>
      items.some((x) => x.code === code && x.market === market),
    [items],
  );

  const toggle = useCallback(
    (it: WatchItem) => {
      const cur = read();
      const exists = cur.some((x) => x.code === it.code && x.market === it.market);
      save(exists ? cur.filter((x) => !(x.code === it.code && x.market === it.market)) : [...cur, it]);
    },
    [save],
  );

  const remove = useCallback(
    (code: string, market: WatchItem["market"]) => {
      save(read().filter((x) => !(x.code === code && x.market === market)));
    },
    [save],
  );

  return { items, has, toggle, remove };
}
