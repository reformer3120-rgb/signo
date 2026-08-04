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

function writeLocal(next: WatchItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패해도 화면은 그대로 동작한다 */
  }
}

const idOf = (x: WatchItem) => `${x.market}:${x.code}`;

/** 두 목록을 합친다 — 순서를 지키면서 중복만 걷어낸다 */
function merge(a: WatchItem[], b: WatchItem[]): WatchItem[] {
  const seen = new Set<string>();
  const out: WatchItem[] = [];
  for (const x of [...a, ...b]) {
    const id = idOf(x);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(x);
  }
  return out;
}

/** 서버에 저장 — 실패해도 브라우저 저장본은 남으므로 조용히 넘어간다 */
function push(items: WatchItem[]) {
  fetch("/api/watchlist", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  }).catch(() => {});
}

/**
 * 관심종목.
 *
 * 브라우저(localStorage)와 서버 양쪽에 둔다.
 *   - 브라우저 저장본은 화면이 뜨자마자 바로 보여주기 위한 것
 *   - 서버 저장본은 앱을 지웠다 깔거나 캐시를 비워도 남기기 위한 것
 * 서버는 쿠키를 주 열쇠로, 접속 IP를 보조 열쇠로 주인을 찾는다 (api/watchlist).
 *
 * 처음 뜰 때 두 목록을 합쳐 양쪽을 맞춘다. 한쪽에만 있던 종목이 사라지지 않는다.
 */
export function useWatchlist() {
  const [items, setItems] = useState<WatchItem[]>([]);

  useEffect(() => {
    setItems(read());

    // 서버 목록을 받아 합친다
    fetch("/api/watchlist")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: WatchItem[]; stored?: boolean } | null) => {
        if (!j?.stored) return; // 서버 저장이 꺼져 있으면 브라우저 저장본만 쓴다
        const fromServer = j.data ?? [];
        const merged = merge(read(), fromServer);
        writeLocal(merged);
        setItems(merged);
        window.dispatchEvent(new Event(EVENT));
        // 서버에 없던 종목이 있으면 올려둔다
        if (merged.length !== fromServer.length) push(merged);
      })
      .catch(() => {});

    const sync = () => setItems(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((next: WatchItem[]) => {
    writeLocal(next);
    setItems(next);
    window.dispatchEvent(new Event(EVENT));
    push(next);
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
