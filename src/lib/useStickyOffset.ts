"use client";
import { useEffect, type RefObject } from "react";

/**
 * 요소의 실제 높이(+상단 여백)를 CSS 변수로 노출한다.
 * 상단 고정 요소들이 서로의 높이를 하드코딩하지 않고 쌓이도록 하기 위함.
 * 예) 네비가 1단→2단으로 바뀌어도 아래 고정바들이 자동으로 밀려난다.
 */
export function usePublishHeight(
  ref: RefObject<HTMLElement | null>,
  cssVar: string,
  extra = 0,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty(cssVar, `${Math.round(h + extra)}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, [ref, cssVar, extra]);
}
