"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { pct, signColor } from "@/lib/format";

interface Peer {
  code: string;
  name: string;
  changeRate: number;
}

/**
 * 섹터에 마우스를 올리면 구성종목을 펼쳐 보여주고, 고르면 그 종목으로 이동한다.
 * 터치 기기에는 마우스오버가 없으므로 탭으로도 열린다.
 */
export function SectorPeek({
  market,
  code,
  title,
  onPick,
  children,
}: {
  market: "kr" | "us";
  code: string;
  title: string;
  onPick: (code: string, name: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 열려 있는 동안에만 불러온다 (섹터 22개를 미리 다 받지 않도록)
  const { data, isLoading } = useSWR<{ data: Peer[] }>(
    open && code ? `/api/sector-stocks?market=${market}&code=${encodeURIComponent(code)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 120_000 },
  );
  const peers = data?.data ?? [];

  // 화면 아래쪽 섹터는 목록이 잘리므로 위로 펼친다
  useEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAbove(window.innerHeight - r.bottom < 240);
  }, [open]);

  // 바깥을 누르면 닫기 (탭으로 연 경우)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // 막대에서 목록으로 마우스를 옮기는 사이에 닫히지 않도록 약간 늦춘다
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={() => (open ? setOpen(false) : show())}
    >
      <div className="cursor-pointer">{children}</div>
      {open && (
        <div
          className={`absolute left-0 z-30 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl ${
            above ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <div className="mb-1 px-1.5 text-[11px] font-semibold text-muted">
            {title} · 시총 상위
          </div>
          {isLoading && !peers.length ? (
            <div className="h-24 animate-pulse rounded-lg bg-line/30" />
          ) : !peers.length ? (
            <div className="px-1.5 py-3 text-center text-xs text-muted">구성종목 없음</div>
          ) : (
            <ul className="flex flex-col">
              {peers.map((p) => (
                <li key={p.code}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      onPick(p.code, p.name);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs hover:bg-canvas"
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className={`tnum shrink-0 font-medium ${signColor(p.changeRate)}`}>
                      {pct(p.changeRate)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
