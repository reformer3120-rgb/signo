"use client";
import { useEffect, useState } from "react";

/**
 * 화면 크기에 맞는 차트 높이.
 *
 * 이 앱은 뷰포트 폭을 1152로 못 박아 두어(layout.tsx) 폰에서는 화면 전체가
 * 축소되어 보인다. 그래서 px 를 고정하면 데스크톱에서는 알맞은 높이가
 * 폰에서는 3분의 1로 쪼그라든다.
 *
 * 화면 높이에 비례해 잡으면 두 경우가 같이 해결된다. 폰은 축소되는 만큼
 * innerHeight(CSS px)가 커지므로, 비율로 주면 실제로 보이는 크기가
 * 데스크톱과 비슷해진다.
 *
 *   데스크톱 900px  → 378px          (화면의 42%)
 *   폰 390x844      → 1047 CSS px    (축소하면 356px, 역시 화면의 42%)
 */
export function useChartHeight(ratio = 0.42, min = 340, max = 1100) {
  const [h, setH] = useState(440);
  useEffect(() => {
    const calc = () => {
      const vh = window.innerHeight || 900;
      setH(Math.round(Math.min(max, Math.max(min, vh * ratio))));
    };
    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", calc);
    return () => {
      window.removeEventListener("resize", calc);
      window.removeEventListener("orientationchange", calc);
    };
  }, [ratio, min, max]);
  return h;
}
