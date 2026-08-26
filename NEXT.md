# 이어서 할 일

마지막 커밋 — 낱말 경계 고치기 · 작업지 미배정 줄이기 · PDF 2종 다시 뽑기

## 지금 상태

```
테마 91개 · 편입 2,602종목 · 응집도 0.482 (에프앤가이드 올린 폭 대비 108%)
무작위 상위 5% 를 넘은 테마 48/91
배포  https://signo-chi.vercel.app/theme
PDF   SIGNO-전종목-테마작업지.pdf (287쪽) · SIGNO-테마분류기준.pdf (34쪽)
      둘 다 91개 테마 · 2026-08-26 자료로 다시 뽑았다.
```

## 지난번에 한 것

- 낱말을 견줄 때 띄어쓰기를 통째로 지우던 것을 고쳤다. "레거시 공정"이 "시공"이
  되고 "CJ HOLDINGS"가 "NGS"가 되던 자리다. 자세한 것은 `classify.mjs` 머리말.
- 표를 문장인 척 세던 것을 걷어냈다 (`looksTable`).
- 건설·건축에서 "인테리어"·"분양"을 뒷받침 낱말로 내렸다. 138 → 111종목.
- 작업지 미배정 285 → 163건. 대분류 울타리 밖에서도 찾게 하고, 사람이 쓰는 말을
  `also` 에 채웠다.
- 제지·펄프를 91번째 테마로 세웠다 (18종목).

## 남은 일

1. **미배정 163건** — `.cache/theme/manual-unmatched.json`
   갈 테마가 아예 없는 쪽이 많다. 묶음으로 보면
   - 악기·문구·출판·인쇄 (삼익악기, 모나미, 양지사, 예림당, SM Life Design)
   - 미술품 경매 (서울옥션, 케이옥션)
   - 소형가전 (신일전자, 파세코, 오아, 앱코)
   - 위생용품 (지앤이헬스케어, 빌리언스)
   - 종합상사 (현대코퍼레이션홀딩, 신라교역)
   테마를 더 세울지 말지의 문제다. 제지·펄프처럼 열 종목이 넘고 같이 움직이는
   묶음이면 세울 값어치가 있고, 서넛뿐이면 아니다.

2. **울타리 밖 배정 48건 눈으로 보기** — `.cache/theme/manual-outgroup.json`
   대분류를 넘어 붙인 것들이라 사람이 한 번 훑는 편이 좋다. 지금 눈에 걸리는 것
   - 씨앗(사진 필름) → 섬유·화학소재
   - 씨앤에스링크(차량용 내비) → 자동차부품
   - 오상자이엘(IT·농업) → 농수축산
   - 한라IMS(철도차량 제동장치) → 자동차부품

3. **케이비아이동국실업** — 자동차부품사인데 아직 건설·건축(토목)에 있다.
   사업보고서에 토목시설물 건설부문이 실제로 적혀 있어서다(매출 24억).
   규칙으로는 비중을 못 보므로 작업지에서 손대는 편이 맞다.

4. **가구·인테리어 0.202 · 보안·경비 0.208** — 무작위보다 못하다.
   쪼개거나(가구 / 인테리어 시공) 합치거나 해야 한다.

## 파이프라인 차례 (순서를 지켜야 한다)

```
collect.mjs       DART 사업보고서 수집      → overview.json
build-df.mjs      낱말 빈도                → df.json      ← 사전을 고쳤으면 반드시
classify.mjs      규칙 분류                → classified.json
ingest-xlsx.mjs   작업지 읽기 <xlsx경로>    → manual.json · manual-unmatched.json
                                            · manual-outgroup.json
tidy-why.mjs      군더더기 제거 --write     (manual.json 고침)
strip-opinion.mjs 투자 평가 제거 --write    (manual.json 고침)
apply-manual.mjs  사람 것을 규칙 위에 얹기  (classified.json 고침)
build-data.mjs    화면용 데이터            → src/data/themes.json
evaluate.mjs      응집도 재기              → report-doc.txt

PDF 2종 (반드시 evaluate 를 먼저 돌린다 — 기준서가 응집도를 거기서 긁어 간다)
doc-data.mjs → make-pdf.py       기준서    SIGNO-테마분류기준.pdf
doc-all.mjs  → make-pdf-all.py   작업지    SIGNO-전종목-테마작업지.pdf
```

작업지 xlsx 는 `~/Downloads/SIGNO_전종목_테마작업지_완성_1.xlsx` 를 쓴다.
(`_2` 도 내용이 같다. 접미사 없는 것은 예전 판이라 배정이 887건뿐이다.)

## 클라우드(모바일 단독) 에서 안 되는 것

`.cache/` 가 gitignore 라 저장소에 없다. `overview.json` 18MB 를 비롯한
파이프라인 입력이 전부 로컬에만 있다. 그래서 클라우드 세션에서는
**분류·PDF 를 다시 돌릴 수 없다.** 화면(UI) 손보기와 코드 수정은 된다.

시세는 KIS 키가 있어야 하는데 `.env.local` 도 저장소에 없다.
키는 옮기지 않는다 — 필요하면 받는 쪽이 따로 발급한다.
