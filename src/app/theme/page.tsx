import { ThemeView } from "@/components/theme/ThemeView";

/** /theme?no=64 — 테마 보드에서 고른 테마로 바로 들어올 수 있게 번호를 주소에 남긴다 */
export default async function ThemePage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const sp = await searchParams;
  const no = /^\d+$/.test(sp.no ?? "") ? sp.no : undefined;
  return <ThemeView initialNo={no} />;
}
