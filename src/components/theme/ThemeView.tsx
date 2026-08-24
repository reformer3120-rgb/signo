"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeBoard } from "./ThemeBoard";
import { ThemeDetailView } from "./ThemeDetailView";

/**
 * 테마 화면. 보드에서 고르면 상세로 바뀐다.
 *
 * 주소(/theme?no=64)에 남기므로 브라우저 뒤로가기와 링크 공유가 그대로 된다.
 * 다만 주소만 믿으면 상세 진입 때 서버 왕복이 한 번 더 생기므로,
 * 화면 전환은 지역 상태로 즉시 하고 주소는 뒤따라 맞춘다.
 */
export function ThemeView({ initialNo }: { initialNo?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<{ no: string; name: string } | null>(
    initialNo ? { no: initialNo, name: "" } : null,
  );

  if (open) {
    return (
      <ThemeDetailView
        no={open.no}
        fallbackName={open.name}
        onBack={() => {
          setOpen(null);
          router.replace("/theme", { scroll: false });
        }}
      />
    );
  }
  return (
    <ThemeBoard
      onOpen={(no, name) => {
        setOpen({ no, name });
        router.replace(`/theme?no=${no}`, { scroll: false });
      }}
    />
  );
}
