"use client";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/swr";
import { pct, signColor } from "@/lib/format";

interface Row {
  id: string;
  name: string;
  count: number;
  chg: number | null;
}

/**
 * 종목명 줄에 붙는 테마 칩. 이름과 그 테마의 오늘 등락률을 함께 보여 주고,
 * 누르면 그 테마로 건너뛴다.
 *
 * 종목 값과 테마 값이 한 줄에 나란히 있어야 "이 종목이 테마를 끌고 있나,
 * 테마를 못 따라가고 있나" 가 바로 읽힌다. 따로 떨어진 카드에 두면
 * 눈을 왔다 갔다 해야 한다.
 */
export function StockThemeChips({ code }: { code: string }) {
  const router = useRouter();
  const { data } = useSWR<{ data: Row[] }>(
    code ? `/api/stock-themes?code=${code}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
  const rows = data?.data ?? [];
  if (!rows.length) return null;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {/* 좁은 테마가 앞에 온다. 줄이 길어지지 않게 셋까지만. */}
      {rows.slice(0, 3).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => router.push(`/theme?no=${t.id}`)}
          title={`${t.name} · ${t.count}종목 — 눌러서 같은 테마 종목 보기`}
          className="inline-flex items-baseline gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] transition-colors hover:border-brand hover:text-brand"
        >
          {t.name}
          {t.chg !== null && (
            <b className={`tnum font-semibold ${signColor(t.chg)}`}>{pct(t.chg)}</b>
          )}
        </button>
      ))}
      {rows.length > 3 && <span className="text-[10px] text-muted">+{rows.length - 3}</span>}
    </span>
  );
}
