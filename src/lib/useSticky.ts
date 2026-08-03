"use client";
import { useEffect, useState } from "react";

/**
 * 화면을 옮겼다 돌아와도 유지되는 설정값 (localStorage).
 * 서버 렌더와 값이 어긋나지 않도록 첫 렌더는 기본값으로 두고 마운트 후 복원한다.
 */
export function useSticky<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`signo:${key}`);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* 저장소 접근 실패 시 기본값 유지 */
    }
    // key가 바뀌면 다시 복원
  }, [key]);

  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(`signo:${key}`, JSON.stringify(v));
    } catch {
      /* 무시 */
    }
  };
  return [value, set];
}
