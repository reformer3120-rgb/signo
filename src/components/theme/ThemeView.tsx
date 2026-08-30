"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeBoard } from "./ThemeBoard";
import { ThemeDetailView } from "./ThemeDetailView";
import { UpperBoard } from "./UpperBoard";
import { UpperDetailView } from "./UpperDetailView";

/**
 * 테마 화면. 보드에서 고르면 상세로 바뀐다.
 *
 * 주소(/theme?no=batt-cathode)에 남기므로 링크 공유가 그대로 된다.
 * 화면 전환은 지역 상태로 즉시 하고 주소는 뒤따라 맞춘다 — 주소만 믿으면
 * 상세로 들어갈 때마다 서버를 한 번 더 다녀와야 한다.
 *
 * ── 뒤로가기 ───────────────────────────────────────────────
 * 예전에는 router.replace 로 주소를 바꿨다. replace 는 히스토리 칸을 갈아치우므로
 * 상세 화면이 히스토리에 남지 않았고, 상세에서 브라우저 뒤로가기를 누르면
 * 대분류 목록이 아니라 테마 화면 자체를 벗어났다.
 *
 * 그래서 native History API 를 쓴다. Next 는 window.history.pushState 를
 * 라우터와 이어 주므로(01-app/01-getting-started/04-linking-and-navigating.md)
 * 서버를 다시 다녀오지 않고도 히스토리 칸이 하나 쌓인다. 되돌아오는 것은
 * popstate 로 받아 주소를 다시 읽는다 — 뒤로가기·앞으로가기, 그리고 종목 화면에
 * 갔다가 돌아오는 경우까지 한 곳에서 처리된다.
 */
const noOf = (search: string) => new URLSearchParams(search).get("no");

export function ThemeView({ initialNo }: { initialNo?: string }) {
  const [open, setOpen] = useState<{ no: string; name: string } | null>(
    initialNo ? { no: initialNo, name: "" } : null,
  );
  // 목록으로 돌아왔을 때 어느 대분류를 펼쳐 둘지 — 방금 보던 테마가 든 칸이다.
  const [focus, setFocus] = useState<string | undefined>(initialNo);
  // 우리가 쌓은 히스토리 칸 수. 공유 링크로 바로 들어온 사람은 0 이라
  // 뒤로가기를 부르면 사이트 밖으로 나가 버린다. 그때는 주소만 갈아치운다.
  const depth = useRef(0);
  // 윗층은 아래층과 판정 근거가 달라 상세도 따로 연다. 주소에 남기지 않는 것은
  // 주 1회 갈리는 회전 목록이라 링크가 며칠이면 가리키는 것이 달라지기 때문이다.
  const [upper, setUpper] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const onPop = () => {
      const no = noOf(window.location.search);
      // 뒤로가기면 우리 칸을 하나 썼고, 앞으로가기면 도로 쌓인 것이다.
      depth.current = no ? depth.current + 1 : Math.max(0, depth.current - 1);
      setOpen(no ? { no, name: "" } : null);
      if (no) setFocus(no);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const back = useCallback(() => {
    if (depth.current > 0) {
      // 상태 정리는 popstate 가 맡는다 — 브라우저 뒤로가기와 같은 길로 흐른다.
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", "/theme");
    setOpen(null);
  }, []);

  if (upper) {
    return (
      <UpperDetailView id={upper.id} fallbackName={upper.name} onBack={() => setUpper(null)} />
    );
  }
  if (open) {
    return <ThemeDetailView no={open.no} fallbackName={open.name} onBack={back} />;
  }
  return (
    <>
      <UpperBoard onOpen={(id, name) => setUpper({ id, name })} />
      <ThemeBoard
      focus={focus}
      onOpen={(no, name) => {
        setOpen({ no, name });
        setFocus(no);
        window.history.pushState(null, "", `/theme?no=${no}`);
        depth.current += 1;
      }}
      />
    </>
  );
}
