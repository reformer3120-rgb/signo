# 이어서 할 일

마지막 커밋 `d7bd51a` — 작업지 2차 반영 · 낱말 무게 도입

## 지금 상태

```
테마 90개 · 편입 2,548종목 · 응집도 0.475 (에프앤가이드 대비 104%)
배포  https://signo-chi.vercel.app/theme
```

## 남은 일 (골라서 하면 된다)

1. **PDF 2종 다시 뽑기** — 90개 테마와 새 기준이 아직 안 들어갔다
   ```
   node scripts/theme/doc-all.mjs
   python scripts/theme/make-pdf-all.py
   python scripts/theme/make-pdf.py
   ```
   → `.cache/theme/` 가 있어야 한다. 로컬 PC 에서만 된다.

2. **미배정 279건** — 한 문장으로는 업종이 안 드러난 종목들
   `.cache/theme/manual-unmatched.json`

3. **건설·건축 잔여 오분류** — 낱말 무게로 243→138 까지 줄였지만 남아 있다
   - 선샤인푸드(갈매기 프랜차이즈)가 "인테리어" 하나로 들어옴
   - 케이비아이동국실업(자동차부품)이 "토목" 하나로 들어옴
   → `dict.mjs` 의 `ind-construct` 에 `notWith` 를 두는 쪽이 맞다

## 파이프라인 차례 (순서를 지켜야 한다)

```
collect.mjs      DART 사업보고서 수집      → overview.json
build-df.mjs     낱말 빈도                → df.json
classify.mjs     규칙 분류                → classified.json
ingest-xlsx.mjs  작업지 읽기              → manual.json
tidy-why.mjs     군더더기 제거            (manual.json 고침)
strip-opinion.mjs 투자 평가 제거 --write   (manual.json 고침)
apply-manual.mjs 사람 것을 규칙 위에 얹기  (classified.json 고침)
build-data.mjs   화면용 데이터            → src/data/themes.json
evaluate.mjs     응집도 재기
```

## 클라우드(모바일 단독) 에서 안 되는 것

`.cache/` 가 gitignore 라 저장소에 없다. `overview.json` 18MB 를 비롯한
파이프라인 입력이 전부 로컬에만 있다. 그래서 클라우드 세션에서는
**분류·PDF 를 다시 돌릴 수 없다.** 화면(UI) 손보기와 코드 수정은 된다.

시세는 KIS 키가 있어야 하는데 `.env.local` 도 저장소에 없다.
키는 옮기지 않는다 — 필요하면 받는 쪽이 따로 발급한다.
