"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { usePublishHeight } from "@/lib/useStickyOffset";

/** 1단계: 시장 구분 */
const MARKETS = [
  { key: "kr", label: "한국증시", root: "/" },
  { key: "us", label: "미국증시", root: "/us" },
  { key: "watch", label: "관심종목", root: "/watchlist" },
  { key: "cal", label: "캘린더", root: "/calendar" },
];

/** 2단계: 시장별 화면 */
const SUB: Record<string, { href: string; label: string }[]> = {
  kr: [
    { href: "/", label: "대시보드" },
    { href: "/stock", label: "종목" },
    { href: "/market", label: "시장지표" },
  ],
  us: [
    { href: "/us", label: "대시보드" },
    { href: "/us/stock", label: "종목" },
    { href: "/us/market", label: "시장지표" },
  ],
};

function marketOf(path: string) {
  if (path.startsWith("/us")) return "us";
  if (path.startsWith("/watchlist")) return "watch";
  if (path.startsWith("/calendar")) return "cal";
  return "kr";
}

export function Nav() {
  const path = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  // 상단 여백(top-2 = 8px)을 더해 아래 고정 요소들이 참조할 바닥 위치를 알린다
  usePublishHeight(ref, "--nav-bottom", 8);
  const cur = marketOf(path);
  const subs = SUB[cur] ?? [];

  return (
    <div ref={ref} className="sticky top-2 z-30 flex w-fit flex-col gap-1.5">
      <nav className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
        {MARKETS.map((m) => (
          <Link
            key={m.key}
            href={m.root}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              cur === m.key ? "bg-brand text-white" : "text-muted hover:text-fg"
            }`}
          >
            {m.label}
          </Link>
        ))}
      </nav>
      {subs.length > 0 && (
        <nav className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          {subs.map((s) => {
            const active =
              s.href === "/" || s.href === "/us" ? path === s.href : path.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  active ? "bg-brand/15 text-brand" : "text-muted hover:text-fg"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
