"use client";
import { useEffect, useState } from "react";

/**
 * 화면에 고정된 차트 카드가 화면보다 커지지 않도록 차트 높이를 계산한다.
 *
 * 카드째 고정하면 카드가 화면보다 길 때 아래쪽(거래량·RSI·MACD)이 잘려 나가고
 * 아래 자료를 읽을 공간도 남지 않는다. 화면 높이에서 위쪽 고정 요소와 카드
 * 자체가 쓰는 자리를 뺀 만큼만 차트에 준다.
 */
export function useChartFit(chrome = 190) {
  const [h, setH] = useState<number | undefined>(undefined);
  useEffect(() => {
    const calc = () => {
      const cs = getComputedStyle(document.documentElement);
      const px = (name: string, fallback: number) =>
        parseInt(cs.getPropertyValue(name)) || fallback;
      const top = px("--nav-bottom", 90) + px("--stockbar-h", 44);
      const vh = window.innerHeight || 900;
      // 차트가 화면의 60%를 넘지 않게 한다. 고정해 두는 이상 아래 자료를 읽을
      // 자리가 남아야 의미가 있다. 위쪽 고정 요소가 두꺼우면 그만큼 더 줄인다.
      const byRatio = vh * 0.6 - chrome;
      const byRoom = vh - top - chrome - 120;
      setH(Math.min(560, Math.max(260, Math.round(Math.min(byRatio, byRoom)))));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [chrome]);
  return h;
}
