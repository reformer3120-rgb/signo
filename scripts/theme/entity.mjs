// HTML 실체를 푼다.
//
// 사업보고서 원문은 HTML 이라 「&amp;」 가 그대로 남는다. 표에서 뽑은 라벨뿐
// 아니라 상장기업 목록의 종목명에도 섞여 있었다.
//
//   신세계I&amp;C · F&amp;F · HL D&amp;I · SGC E&amp;C   (19종목)
//
// 종목명은 목록·검색·차트·카드에 다 나오므로 한 군데서 풀어 두고 쓴다.
const 실체 = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&apos;": "'", "&#39;": "'", "&nbsp;": " ", "&middot;": "·",
};

export const 실체풀기 = (s) =>
  String(s ?? "")
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp|middot);/g, (m) => 실체[m] ?? m)
    // 「&amp;amp;」 처럼 두 번 감싸인 것이 있다
    .replace(/&(amp|lt|gt|quot);/g, (m) => 실체[m] ?? m);
