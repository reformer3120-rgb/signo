"use client";

/**
 * 윗층 테마 상세 — 구성종목 목록.
 *
 * 아래층 상세(ThemeDetailView)와 달리 재무·차트가 없다. 윗층은 시세로만
 * 판정한 묶음이라 "이 회사가 어떤가" 를 말할 근거가 없기 때문이다. 종목을
 * 누르면 종목 화면으로 보내고, 거기서 아래층 분류와 재무를 본다.
 */
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Card } from "@/components/Card";
import { fetcher } from "@/lib/swr";
import { pct, signColor, won } from "@/lib/format";
import type { UpperDetail } from "@/lib/upperTheme";

export function UpperDetailView({
  id,
  fallbackName,
  onBack,
}: {
  id: string;
  fallbackName?: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const { data, isLoading, error } = useSWR<{ data: UpperDetail }>(`/api/upper/${id}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
  const d = data?.data;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
          >
            ← 테마
          </button>
          <span>{d?.name ?? fallbackName ?? ""}</span>
          {d && (
            <span className={`tnum text-[13px] font-medium ${signColor(d.chg ?? 0)}`}>
              {d.chg === null ? "—" : pct(d.chg)}
            </span>
          )}
        </span>
      }
    >
      {error && <p className="py-6 text-center text-[12px] text-muted">불러오지 못했다.</p>}
      {isLoading && !d && <p className="py-6 text-center text-[12px] text-muted">불러오는 중…</p>}

      {d && (
        <>
          <div className="mb-3 rounded-lg border border-line bg-canvas px-3 py-2 text-[11px] text-muted">
            <span className="tnum">{d.count}종목</span>
            <span> · 상승 {d.up} · 하락 {d.down}</span>
            {/* 이 둘이 이 묶음을 판에 올린 근거다 */}
            <span className="tnum"> · 잔차 {d.w.toFixed(3)}</span>
            <span className="tnum"> · 거래대금 ×{d.su.toFixed(2)}</span>
            <span> · 후보 출처 {d.src}</span>
          </div>

          <ul className="grid gap-1.5 sm:grid-cols-2">
            {d.stocks.map((s) => (
              <li key={s.code}>
                <button
                  type="button"
                  onClick={() => router.push(`/stock?code=${s.code}`)}
                  className="flex w-full items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-left transition-colors hover:bg-surface"
                >
                  <span className="min-w-0 truncate text-[12.5px] font-medium">{s.name}</span>
                  <span className="ml-auto shrink-0 text-right">
                    <span className="tnum text-[12.5px]">{s.price === null ? "—" : won(s.price)}</span>
                    <span className={`tnum ml-2 text-[12px] font-bold ${signColor(s.chg ?? 0)}`}>
                      {s.chg === null ? "—" : pct(s.chg)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            시세로 판정한 묶음이다 — 사업보고서를 보지 않는다. 그래서 재무나 편입
            사유가 없고, 주에 한 번 갈린다. 종목을 누르면 그 종목의 사업 분류와
            재무를 볼 수 있다.
          </p>
        </>
      )}
    </Card>
  );
}
