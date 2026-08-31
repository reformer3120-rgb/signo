"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { useSticky } from "@/lib/useSticky";
import { StockSection } from "@/components/sections/StockSection";
import { StockStickyBar } from "@/components/stock/StockStickyBar";
import { StockBriefCard } from "@/components/stock/StockBriefCard";
import { StockDetailCard } from "@/components/stock/StockDetailCard";
import { FinancialsCard } from "@/components/stock/FinancialsCard";
import { SectorRankCard } from "@/components/stock/SectorRankCard";
import { NewsCard } from "@/components/stock/NewsCard";
import type { Interval } from "@/lib/types";
import type { Exch } from "@/components/ExchangeSelect";

export function StockView({
  initialCode,
  initialName,
}: {
  initialCode?: string;
  initialName?: string;
} = {}) {
  // 마지막으로 본 종목을 기억한다 — 다른 화면에 갔다 돌아와도 그대로.
  // 주소로 종목을 지정해 들어온 경우(대시보드에서 클릭 등)에는 그쪽이 우선.
  const [last, setLast] = useSticky("kr.stock.last", { code: "005930", name: "삼성전자" });
  const [picked, setPicked] = useState<{ code: string; name: string } | null>(
    initialCode ? { code: initialCode, name: initialName ?? initialCode } : null,
  );
  const code = picked?.code ?? last.code;
  const 적힌이름 = picked?.name ?? last.name;

  // 이름을 모른 채 코드만 들고 들어오는 길이 있다 — 주소에 name 이 없고
  // 우리 분류표에도 없는 종목이면 이름 자리에 코드가 그대로 박힌다.
  // 개요 카드가 어차피 부르는 주소라 SWR 이 같은 열쇠로 묶어 준다(요청은 한 번).
  const { data: brief } = useSWR<{ data: { name?: string | null } }>(
    적힌이름 === code ? `/api/stock-brief?code=${code}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
  const 받은이름 = brief?.data?.name ?? null;
  const name = 적힌이름 === code ? (받은이름 ?? code) : 적힌이름;
  const [tab, setTab] = useSticky("kr.stock.tab", "1D");
  const [minUnit, setMinUnit] = useSticky<Interval>("kr.stock.min", "5");
  // 거래소는 차트와 종목상세가 같이 본다 — 머리의 등락률과 카드의 1일
  // 수익률이 다른 거래소를 보면 한 화면에 같은 이름의 값이 둘 뜬다.
  const [exch, setExch] = useSticky<Exch>("kr.stock.exch", "KRX");

  const select = (c: string, n: string) => {
    setPicked({ code: c, name: n });
    setLast({ code: c, name: n });
  };
  useEffect(() => {
    if (initialCode) setLast({ code: initialCode, name: initialName ?? initialCode });
    // 진입 시 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, initialName]);

  // 이름을 알아냈으면 기억에도 넣어 둔다. 안 그러면 다른 화면에 갔다 돌아올
  // 때마다 코드가 다시 뜨고 이름을 또 받아 와야 한다.
  useEffect(() => {
    if (받은이름 && 받은이름 !== code) {
      setLast({ code, name: 받은이름 });
      setPicked((p) => (p && p.code === code ? { code, name: 받은이름 } : p));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, 받은이름]);

  const selectFromSector = (c: string, n: string) => {
    select(c, n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <StockStickyBar code={code} name={name} onSelect={select} />
      <StockSection
        code={code}
        name={name}
        tab={tab}
        minUnit={minUnit}
        exch={exch}
        onTab={setTab}
        onMinUnit={setMinUnit}
        onExch={setExch}
      />
      <StockBriefCard code={code} name={name} />
      <StockDetailCard code={code} exch={exch} />
      <FinancialsCard code={code} />
      <SectorRankCard code={code} onSelect={selectFromSector} />
      <NewsCard code={code} />
    </>
  );
}
