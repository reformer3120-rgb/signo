import { UsCurrencyProvider } from "@/components/us/UsCurrency";

/** 미국증시 화면 전체에서 통화(달러/원화) 선택을 공유 */
export default function UsLayout({ children }: { children: React.ReactNode }) {
  return <UsCurrencyProvider>{children}</UsCurrencyProvider>;
}
