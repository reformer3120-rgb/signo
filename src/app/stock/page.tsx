import { StockView } from "@/components/stock/StockView";
import { nameOf } from "@/lib/ownTheme";

/**
 * /stock?code=005930&name=삼성전자 — 대시보드에서 종목 클릭 시 해당 종목으로 진입.
 *
 * name 은 없어도 된다. 링크를 손으로 치거나 남에게 받은 주소에는 대개 빠져
 * 있는데, 그때 이름 자리에 코드가 그대로 박혀 "068270 개요" 처럼 나왔다.
 * 우리 분류표에 있는 종목이면 여기서 이름을 채워 넣는다.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; name?: string }>;
}) {
  const sp = await searchParams;
  const code = /^\d{6}$/.test(sp.code ?? "") ? sp.code : undefined;
  return (
    <StockView initialCode={code} initialName={code ? (sp.name ?? nameOf(code) ?? undefined) : undefined} />
  );
}
