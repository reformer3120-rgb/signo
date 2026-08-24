import { ThemeView } from "@/components/theme/ThemeView";

/**
 * /theme?no=batt-cathode — 보드에서 고른 테마로 바로 들어올 수 있게 주소에 남긴다.
 * 자체 분류로 갈아끼우면서 식별자가 숫자에서 이름으로 바뀌었다.
 */
export default async function ThemePage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const sp = await searchParams;
  const no = /^[a-z0-9-]{2,40}$/.test(sp.no ?? "") ? sp.no : undefined;
  return <ThemeView initialNo={no} />;
}
