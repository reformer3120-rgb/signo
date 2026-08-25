"use client";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/swr";
import { Card } from "@/components/Card";

interface Row {
  id: string;
  name: string;
  count: number;
}

/**
 * 이 종목이 어느 테마에 드는지 보여 주고, 눌러서 그 테마로 건너뛴다.
 *
 * 구성종목이 적은 것을 앞에 둔다 — "2차전지 양극재" 가 "2차전지" 보다 이 종목을
 * 더 정확히 설명한다. 종목수가 함께 보여야 얼마나 좁은 테마인지 가늠이 된다.
 */
export function StockThemeCard({ code }: { code: string }) {
  const router = useRouter();
  const { data, isLoading } = useSWR<{ data: Row[] }>(
    code ? `/api/stock-themes?code=${code}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 600_000 },
  );
  const rows = data?.data ?? [];

  // 어느 테마에도 안 드는 종목이 있다. 빈 카드를 띄우느니 숨긴다.
  if (!isLoading && !rows.length) return null;

  return (
    <Card
      title="테마"
      right={
        <span className="text-[11px] text-muted">눌러서 같은 테마 종목 보기</span>
      }
    >
      {isLoading ? (
        <div className="flex gap-1.5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-7 w-28 animate-pulse rounded-full bg-line/40" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {rows.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(`/theme?no=${t.id}`)}
                className="inline-flex items-baseline gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-[12.5px] transition-colors hover:border-brand hover:text-brand"
              >
                {t.name}
                <span className="tnum text-[10.5px] text-muted">{t.count}</span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
            SIGNO 가 이 종목의 사업보고서를 읽어 붙인 테마다. 좁은 테마일수록 앞에 온다.
          </p>
        </>
      )}
    </Card>
  );
}
