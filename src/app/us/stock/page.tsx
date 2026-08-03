import { UsStockView } from "@/components/us/UsStockView";

export default async function UsStockPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const sp = await searchParams;
  const symbol = /^[A-Za-z0-9.\-^]{1,10}$/.test(sp.symbol ?? "") ? sp.symbol?.toUpperCase() : undefined;
  return <UsStockView initialSymbol={symbol} />;
}
