import { ReactNode } from "react";

export function Card({
  title,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-[0_2px_6px_rgba(20,22,60,.06)] ${className}`}
    >
      {(title || right) && (
        <header className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {right}
        </header>
      )}
      <div className="px-4 pb-4 pt-1">{children}</div>
    </section>
  );
}
