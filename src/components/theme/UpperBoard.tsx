"use client";

/**
 * 윗층 테마판 — "지금 움직이는 묶음".
 *
 * 아래 사업 분류(91개)와 성격이 다르다. 그쪽은 무엇으로 버는가이고 분기에 한 번
 * 바뀌는데, 이쪽은 왜 같이 움직이는가이고 주 1회 갈린다. 그래서 목록도 고정
 * 명단이 아니라 회전한다 — 주 단위로 상위 20 중 넷쯤이 바뀐다.
 *
 * 접어 둔 채로 시작한다. 테마 화면의 주인은 아래층이고 이것은 얹은 것이다.
 */
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { pct, signColor } from "@/lib/format";
import { useSticky } from "@/lib/useSticky";
import type { UpperRow } from "@/lib/upperTheme";

export function UpperBoard({ onOpen }: { onOpen: (id: string, name: string) => void }) {
  const [open, setOpen] = useSticky<boolean>("kr.theme.upperOpen", true);
  const [all, setAll] = useState(false);
  const [rest, setRest] = useState(false);
  const { data } = useSWR<{ data: UpperRow[]; meta?: { 만든날?: string } }>(
    "/api/upper",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 120_000 },
  );
  const rows = data?.data ?? [];
  if (!rows.length) return null;
  // 판은 지금 돈이 들어온 것만. 쉬는 것은 아래에 따로 접어 둔다 —
  // 테마는 죽었다 살아나므로 명단을 버리지 않지만, 판에 섞으면
  // "지금 움직이는 테마" 라는 이름이 거짓이 된다.
  const 판 = rows.filter((t) => t.active);
  const 쉬는것 = rows.filter((t) => !t.active);
  const 보일것 = all ? 판 : 판.slice(0, 8);

  return (
    <div className="mb-3 rounded-lg border border-line bg-canvas">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-[11px] text-muted">{open ? "▼" : "▶"}</span>
        <span className="text-[13px] font-medium">지금 움직이는 테마</span>
        <span className="tnum text-[11px] text-muted">{판.length}</span>
        {data?.meta?.만든날 && (
          <span className="tnum ml-auto text-[10.5px] text-muted">{data.meta.만든날} 기준</span>
        )}
      </button>

      {open && (
        <>
          <ul className="border-t border-line">
            {보일것.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpen(t.id, t.name)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface"
                >
                  <span className="min-w-0 truncate text-[12.5px]">{t.name}</span>
                  <span className="tnum shrink-0 text-[10.5px] text-muted">{t.count}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="hidden max-w-[14rem] truncate text-[11px] text-muted sm:block">
                      {t.leaders.map((l, i) => (
                        <span key={l.code}>
                          {i > 0 && " · "}
                          {l.name}
                          <span className={`tnum ml-0.5 ${signColor(l.chg ?? 0)}`}>
                            {l.chg === null ? "" : pct(l.chg)}
                          </span>
                        </span>
                      ))}
                    </span>
                    {/* 거래대금 배수 — 이 테마가 오늘 왜 판에 있는지의 근거다 */}
                    <span className="tnum w-11 text-right text-[10.5px] text-muted">×{t.su.toFixed(2)}</span>
                    <span
                      className={`tnum w-14 text-right text-[12.5px] font-medium ${signColor(t.chg ?? 0)}`}
                    >
                      {t.chg === null ? "—" : pct(t.chg)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {판.length > 8 && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              className="w-full border-t border-line py-1.5 text-[11px] text-muted hover:text-fg"
            >
              {all ? "접기" : `더보기 (+${판.length - 8})`}
            </button>
          )}

          {/* 쉬는 테마 — 명단은 그대로 두고 판에서만 내린 것들이다.
              돌아오면 다시 위로 올라온다. */}
          {쉬는것.length > 0 && (
            <div className="border-t border-line px-3 py-2">
              <button
                type="button"
                onClick={() => setRest(!rest)}
                className="text-[11px] text-muted hover:text-fg"
              >
                {rest ? "▼" : "▶"} 쉬는 테마 {쉬는것.length}
              </button>
              {rest && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {쉬는것.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(t.id, t.name)}
                        className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
                        title={`마지막으로 판에 오른 날 ${t.lastSeen} · ${t.seen}번 올랐다`}
                      >
                        {t.name}
                        <span className="tnum ml-1 text-[10px]">{t.lastSeen.slice(5)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="border-t border-line px-3 py-2 text-[11px] leading-relaxed text-muted">
            사업 분류가 아니라 <b className="font-medium text-fg">지금 같이 움직이는 묶음</b>이다.
            시장 몫을 걷어낸 상관과 거래대금으로 골랐고, 주에 한 번 갈린다.
            <span className="tnum"> ×</span>는 최근 거래대금이 평소의 몇 배인가다.
            판에서 내려간 테마도 명단은 그대로 두었다 — 테마는 식었다가 돌아온다.
          </p>
        </>
      )}
    </div>
  );
}
