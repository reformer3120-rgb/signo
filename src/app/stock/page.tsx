import { StockView } from "@/components/stock/StockView";

/** /stock?code=005930&name=삼성전자 — 대시보드에서 종목 클릭 시 해당 종목으로 진입 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; name?: string }>;
}) {
  const sp = await searchParams;
  const code = /^\d{6}$/.test(sp.code ?? "") ? sp.code : undefined;
  return <StockView initialCode={code} initialName={code ? sp.name : undefined} />;
}
