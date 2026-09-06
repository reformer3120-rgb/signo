// .cache/theme/ 이 없을 때 무슨 일인지 알려 준다.
//
// 이 폴더는 39MB 라 저장소에 없다. 그래서 클라우드 세션(claude.ai/code)에서
// 테마 스크립트를 돌리면 ENOENT 만 뜨는데, 그것만 보고는 "내가 뭘 잘못했나"
// 부터 뒤지게 된다. 못 도는 것이 정상이라는 말을 먼저 해 준다.
import fs from "node:fs";

export function 캐시확인(파일, 만드는법) {
  if (fs.existsSync(파일)) return;
  const 폴더있나 = fs.existsSync(".cache/theme");
  console.error(`${파일} 이 없다.`);
  if (!폴더있나) {
    console.error("");
    console.error("  .cache/theme/ 자체가 없다 — 여기는 집 PC 가 아닌 듯하다.");
    console.error("  사업보고서 원문 39MB 는 저장소에 넣지 않는다. 만든 결과만");
    console.error("  커밋한다(src/data/themes.json · about.json · upper.json).");
    console.error("");
    console.error("  이 스크립트는 집 PC 에서만 돈다. 화면·로직 작업은 그대로");
    console.error("  하면 된다 — docs/폰에서-작업하기.md 를 볼 것.");
  } else if (만드는법) {
    console.error(`  ${만드는법} 를 먼저 돌릴 것.`);
  }
  process.exit(1);
}
