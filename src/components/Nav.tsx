"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "대시보드" },
  { href: "/market", label: "시장지표" },
  { href: "/stock", label: "종목" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 sticky top-2 z-30 w-fit">
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              active ? "bg-brand text-white" : "text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
