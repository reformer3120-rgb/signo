"use client";
import { useRouter } from "next/navigation";
import { UsSection } from "@/components/sections/UsSection";
import { CloseReportButton } from "@/components/CloseReportButton";

export function UsDashboard() {
  const router = useRouter();
  return (
    <>
      <CloseReportButton
        api="/api/us-report"
        title="미국증시 마감 리포트"
        desc="지수·섹터·특징주·시총상위·시장지표를 텍스트로 저장"
        filePrefix="signo-미국마감리포트"
      />
      <UsSection onPick={(s) => router.push(`/us/stock?symbol=${encodeURIComponent(s)}`)} />
    </>
  );
}
