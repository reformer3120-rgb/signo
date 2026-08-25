# SIGNO 테마 분류 기준서 PDF.
#
# 사전(dict.mjs)에서 뽑은 자료를 그대로 찍는다. 문서에 내용을 손으로 옮겨
# 적으면 사전을 고쳤을 때 어긋나므로, 갱신은 doc-data.mjs 를 다시 돌리는 것으로 한다.
#
# 실행
#   node scripts/theme/doc-data.mjs && python scripts/theme/make-pdf.py
# 결과 → SIGNO-테마분류기준.pdf
import json
import os
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

DATA = json.load(open(".cache/theme/doc.json", encoding="utf-8"))
OUT = "SIGNO-테마분류기준.pdf"

# ── 글꼴 ──────────────────────────────────────────────────
FONTS = r"C:\Windows\Fonts"
pdfmetrics.registerFont(TTFont("KR", os.path.join(FONTS, "malgun.ttf")))
pdfmetrics.registerFont(TTFont("KR-B", os.path.join(FONTS, "malgunbd.ttf")))
pdfmetrics.registerFontFamily("KR", normal="KR", bold="KR-B")

# ── 색 (SIGNO 토큰) ───────────────────────────────────────
BRAND = colors.HexColor("#3844BE")
FG = colors.HexColor("#15162A")
MUTED = colors.HexColor("#5A5E73")
LINE = colors.HexColor("#E4E5EF")
SURF = colors.HexColor("#F5F6FA")
UP = colors.HexColor("#E23D3D")

ss = getSampleStyleSheet()


def st(name, size, leading, color=FG, font="KR", space_before=0, space_after=0, left=0):
    return ParagraphStyle(
        name, parent=ss["Normal"], fontName=font, fontSize=size, leading=leading,
        textColor=color, spaceBefore=space_before, spaceAfter=space_after,
        leftIndent=left, alignment=TA_LEFT,
    )


S = {
    "title": st("t", 24, 30, FG, "KR-B", 0, 4),
    "sub": st("s", 10.5, 16, MUTED, "KR", 0, 0),
    "h1": st("h1", 15, 21, BRAND, "KR-B", 16, 6),
    "h2": st("h2", 12, 17, FG, "KR-B", 12, 4),
    "theme": st("th", 11.5, 16, FG, "KR-B", 0, 2),
    "body": st("b", 9.5, 15, FG, "KR", 0, 2),
    "note": st("n", 8.8, 13.5, MUTED, "KR", 0, 1),
    "cell": st("c", 8.6, 12.5, FG, "KR"),
    "cellm": st("cm", 8.6, 12.5, MUTED, "KR"),
    "cellb": st("cb", 8.6, 12.5, FG, "KR-B"),
}


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def rx(s):
    """정규식 문자열을 사람이 읽을 꼴로 — /a|b/ → a · b"""
    if not s:
        return None
    inner = re.sub(r"^/|/[a-z]*$", "", s)
    return " · ".join(p.strip() for p in inner.split("|") if p.strip())


def kv_table(rows, widths):
    t = Table(rows, colWidths=widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 0), (0, -1), SURF),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
    ]))
    return t


story = []
W = 170 * mm

# ── 표지 ──────────────────────────────────────────────────
sm = DATA["요약"]
story += [
    Spacer(1, 30 * mm),
    Paragraph("SIGNO 테마 분류 기준서", S["title"]),
    Paragraph(
        f"{DATA['테마수']}개 테마 · {DATA['종목수']:,}종목 · {DATA['편입건수']:,}편입 &nbsp;|&nbsp; {DATA['만든날']} 기준",
        S["sub"],
    ),
    Spacer(1, 8 * mm),
    Paragraph(
        "이 문서는 SIGNO 가 테마를 <b>어떻게 나누고 무엇을 근거로 종목을 넣는지</b> 적은 것이다. "
        "분류는 남의 것을 가져오지 않고 직접 세웠다. 근거는 각 회사가 금융감독원 전자공시(DART)에 "
        "제출한 사업보고서의 ‘사업의 개요’ 다.",
        S["body"],
    ),
    Spacer(1, 5 * mm),
]

story += [kv_table([
    [Paragraph("무엇으로 만드나", S["cellb"]), Paragraph(esc(DATA["기준"]), S["cell"])],
    [Paragraph("테마 목록", S["cellb"]), Paragraph("SIGNO 가 산업 구조를 따라 직접 정의 (60개)", S["cell"])],
    [Paragraph("편입 사유", S["cellb"]), Paragraph("그 종목 사업보고서에서 뽑은 근거 문장", S["cell"])],
    [Paragraph("시세·시총·PER", S["cellb"]), Paragraph("한국투자증권(KIS)", S["cell"])],
    [Paragraph("매출성장·영업이익률", S["cellb"]), Paragraph("DART 확정 실적", S["cell"])],
], [38 * mm, W - 38 * mm])]

story += [
    Spacer(1, 6 * mm),
    Paragraph("품질 — 같이 움직이는가", S["h2"]),
    Paragraph(
        "테마가 제구실을 하는지는 ‘같은 테마 종목이 같이 움직이는가’ 로 잰다. "
        "테마 안 종목쌍의 일간 수익률 상관을 재고, 시장에서 아무렇게나 뽑은 묶음과 견준다.",
        S["body"],
    ),
    Spacer(1, 2 * mm),
]
story += [kv_table([
    [Paragraph("SIGNO 분류", S["cellb"]), Paragraph(f"<b>{sm['ours']}</b>", S["cell"])],
    [Paragraph("무작위 묶음", S["cellb"]), Paragraph(f"{sm['random']} (상위 5% 경계 {sm['p95']})", S["cell"])],
    [Paragraph("견줌 대상", S["cellb"]), Paragraph(f"상용 분류 {sm['fn']} → <b>{sm['ratio']}%</b> 수준", S["cell"])],
    [Paragraph("무작위를 넘은 테마", S["cellb"]), Paragraph(f"{sm['beat']}", S["cell"])],
], [38 * mm, W - 38 * mm])]

story += [
    Spacer(1, 4 * mm),
    Paragraph(
        "같은 조건(테마별 시총 상위 12종목 · 최근 60거래일 · 같은 대조군)에서 잰 값이다.",
        S["note"],
    ),
    PageBreak(),
]

# ── 어떻게 나누나 ─────────────────────────────────────────
story += [
    Paragraph("1. 테마를 나누는 기준", S["h1"]),
    Paragraph("① 밸류체인 단계로 쪼갠다", S["h2"]),
    Paragraph(
        "‘2차전지’ 를 한 덩어리로 두면 셀 제조사와 장비사가 섞여 같이 움직이지 않는다. "
        "소재 · 셀 · 장비 · 재활용으로 나눠야 응집도가 산다. 실제로 갈라 놓은 쪽이 잘 나왔고"
        "(반도체 소재 0.710 · 반도체 장비 0.652), 한 덩어리로 뒀던 화장품(0.199)과 콘텐츠(0.261)는 "
        "바닥이었다. 그래서 화장품을 브랜드 / ODM / 원료·부자재로, 콘텐츠를 영상 / 웹툰 / 음악으로 쪼갰다.",
        S["body"],
    ),
    Paragraph("② 사업보고서 문장으로 판정할 수 있어야 한다", S["h2"]),
    Paragraph(
        "‘정치인 관련주’ 처럼 사업보고서에 근거가 없는 것은 넣지 않는다. 못 하는 것은 못 한다고 "
        "이 문서 끝에 적어 두었다.",
        S["body"],
    ),
    Paragraph("③ 한 종목이 여러 테마에 들어가도 된다", S["h2"]),
    Paragraph(
        "솔브레인은 반도체 소재이면서 2차전지 소재다. 실제로 그렇기 때문에 둘 다에 넣는다. "
        "종목 화면에서는 구성종목이 적은 테마를 앞에 둔다 — 좁은 테마일수록 그 종목을 정확히 설명한다.",
        S["body"],
    ),
]

story += [
    Paragraph("2. 종목을 넣는 규칙", S["h1"]),
    Paragraph(
        "사업의 개요를 문장으로 쪼갠 뒤, 아래를 차례로 통과한 문장에서만 낱말을 센다.",
        S["body"],
    ),
    Spacer(1, 2 * mm),
]
story += [kv_table([
    [Paragraph("① 남의 이야기 버리기", S["cellb"]),
     Paragraph("시황 · 전방산업 · 고객사 · 업계 나열 · 원재료 조달 · 전망과 계획 · 표를 풀어 놓은 줄은 "
               "통째로 뺀다. 사업보고서는 자기 이야기보다 산업 이야기가 더 길 때가 많다.", S["cell"])],
    [Paragraph("② 자사 행위 확인", S["cellb"]),
     Paragraph("낱말과 ‘생산·제조·개발·공급·영위·수주·납품’ 같은 말이 같은 문장에 있어야 센다.", S["cell"])],
    [Paragraph("③ 문맥 조건", S["cellb"]),
     Paragraph("뜻이 여러 분야에 걸치는 낱말은 같은 문장에 분야 말이 있어야 인정한다. "
               "CDMO 는 바이오에도 로봇에도 쓰이고, 패키징은 반도체에도 포장에도 쓰인다.", S["cell"])],
    [Paragraph("④ 표기 정규화", S["cellb"]),
     Paragraph("‘이차전지’ 와 ‘2차전지’ 를 하나로 맞추고, 가운뎃점을 지우고, 낱말을 견줄 때는 "
               "띄어쓰기를 없앤다. 회사마다 표기가 달라 그대로 두면 걸리지 않는다.", S["cell"])],
    [Paragraph("⑤ 배제 조건", S["cellb"]),
     Paragraph("소재를 ‘만드는’ 회사와 그 소재의 ‘제조설비를 대는’ 회사를 가른다. "
               "설비·장비·엔지니어링이 같은 문장에 있으면 소재 테마에서 뺀다.", S["cell"])],
], [38 * mm, W - 38 * mm])]

story += [
    Spacer(1, 4 * mm),
    Paragraph(
        "고쳐 온 함정들 — 전‘방산’업 안의 ‘방산’, ‘게임 산업은 성장하고’(시황), "
        "‘제강회사의 후판을 구매하여야’(원재료), ‘반도체·로봇·자동차 등에 적용’(적용 분야 나열), "
        "‘점포를 운영하지 않음으로써’(부정문), 소주(蘇州)는 중국 도시, 투자‘은행업’은 은행업이 아님.",
        S["note"],
    ),
]

# ── 대분류 개요 ───────────────────────────────────────────
story += [PageBreak(), Paragraph("3. 대분류 한눈에", S["h1"])]
rows = [[Paragraph(x, S["cellb"]) for x in ["대분류", "테마", "편입", "속한 테마"]]]
for g in DATA["대분류"]:
    rows.append([
        Paragraph(esc(g["name"]), S["cellb"]),
        Paragraph(str(len(g["themes"])), S["cell"]),
        Paragraph(f"{g['count']:,}", S["cell"]),
        Paragraph(" · ".join(esc(t["name"]) for t in g["themes"]), S["cellm"]),
    ])
t = Table(rows, colWidths=[26 * mm, 12 * mm, 14 * mm, W - 52 * mm], hAlign="LEFT", repeatRows=1)
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("BACKGROUND", (0, 0), (-1, 0), SURF),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
]))
story.append(t)

# ── 테마 60개 ─────────────────────────────────────────────
story += [PageBreak(), Paragraph("4. 테마별 기준", S["h1"]),
          Paragraph("빈칸은 채워 넣을 자리다. 고칠 부분은 그대로 적어 주면 된다.", S["note"]),
          Spacer(1, 3 * mm)]

for g in DATA["대분류"]:
    story.append(Paragraph(f"{g['name']} — 테마 {len(g['themes'])} · 편입 {g['count']:,}", S["h2"]))
    for t0 in g["themes"]:
        coh = f"{t0['cohesion']:.3f}" if t0["cohesion"] is not None else "—"
        head = Paragraph(
            f"{esc(t0['name'])} &nbsp;<font size=8 color='#5A5E73'>"
            f"편입 {t0['count']}종목 · 응집도 {coh} · id {t0['id']}</font>",
            S["theme"],
        )
        body = [
            [Paragraph("무엇을 묶었나", S["cellb"]), Paragraph(esc(t0["hint"]), S["cell"])],
            [Paragraph("들어가는 것", S["cellb"]), Paragraph(esc(t0["must"]), S["cell"])],
            [Paragraph("빠지는 것", S["cellb"]), Paragraph(esc(t0["none"]), S["cell"])],
            [Paragraph("판정 낱말", S["cellb"]),
             Paragraph(esc(" · ".join(t0["core"])), S["cellm"])],
        ]
        if t0["sub"]:
            body.append([Paragraph("거드는 낱말", S["cellb"]),
                         Paragraph(esc(" · ".join(t0["sub"])), S["cellm"])])
        if t0["ctx"]:
            body.append([Paragraph("문맥 조건", S["cellb"]),
                         Paragraph(esc(rx(t0["ctx"])), S["cellm"])])
        if t0["notWith"]:
            body.append([Paragraph("있으면 뺀다", S["cellb"]),
                         Paragraph(esc(rx(t0["notWith"])), S["cellm"])])
        if t0["veto"]:
            body.append([Paragraph("금지어", S["cellb"]),
                         Paragraph(esc(" · ".join(t0["veto"])), S["cellm"])])
        body.append([Paragraph("편입 예", S["cellb"]),
                     Paragraph(esc(", ".join(t0["sample"])), S["cellm"])])
        body.append([Paragraph("검토 의견", S["cellb"]), Paragraph("&nbsp;", S["cell"])])

        tb = Table(body, colWidths=[26 * mm, W - 26 * mm], hAlign="LEFT")
        tb.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("BACKGROUND", (0, 0), (0, -1), SURF),
            ("BACKGROUND", (1, len(body) - 1), (1, len(body) - 1), colors.HexColor("#FFFBF0")),
            ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ]))
        story.append(KeepTogether([head, Spacer(1, 1.5 * mm), tb, Spacer(1, 5 * mm)]))

# ── 넣지 않은 것 ──────────────────────────────────────────
story += [PageBreak(), Paragraph("5. 일부러 넣지 않은 것", S["h1"]),
          Paragraph("못 하는 것을 못 한다고 적어 둔다. 나중에 방법이 생기면 여기부터 본다.", S["body"]),
          Spacer(1, 3 * mm)]
rows = [[Paragraph(x, S["cellb"]) for x in ["넣지 않은 테마", "왜"]]]
for e in DATA["제외"]:
    rows.append([Paragraph(esc(e["name"]), S["cellb"]), Paragraph(esc(e["why"]), S["cell"])])
t = Table(rows, colWidths=[46 * mm, W - 46 * mm], hAlign="LEFT")
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("BACKGROUND", (0, 0), (-1, 0), SURF),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
]))
story.append(t)

story += [
    Paragraph("6. 갱신", S["h1"]),
    Paragraph(
        "사업보고서는 해마다 3월쯤 새로 나온다. 분기 실적 시즌(3·5·8·11월)에 아래를 차례로 돌리면 된다.",
        S["body"],
    ),
    Spacer(1, 2 * mm),
]
story += [kv_table([
    [Paragraph("1", S["cellb"]), Paragraph("scripts/theme/collect.mjs — DART 사업의 개요 수집", S["cell"])],
    [Paragraph("2", S["cellb"]), Paragraph("scripts/theme/classify.mjs — 종목 배정", S["cell"])],
    [Paragraph("3", S["cellb"]), Paragraph("scripts/theme/collect-fin.mjs — 매출성장·영업이익률", S["cell"])],
    [Paragraph("4", S["cellb"]), Paragraph("scripts/theme/build-data.mjs — 화면이 쓰는 데이터로", S["cell"])],
    [Paragraph("확인", S["cellb"]),
     Paragraph("test-classify.mjs (규칙을 고쳤을 때) · evaluate.mjs (응집도)", S["cell"])],
], [16 * mm, W - 16 * mm])]


# ── 머리말·꼬리말 ─────────────────────────────────────────
def deco(canvas, doc):
    canvas.saveState()
    canvas.setFont("KR", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 12 * mm, f"SIGNO 테마 분류 기준서 · {DATA['만든날']}")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"{doc.page}")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.4)
    canvas.line(20 * mm, 15 * mm, A4[0] - 20 * mm, 15 * mm)
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=18 * mm, bottomMargin=20 * mm,
                      title="SIGNO 테마 분류 기준서", author="SIGNO")
doc.addPageTemplates([PageTemplate(
    id="main",
    frames=[Frame(20 * mm, 20 * mm, W, A4[1] - 38 * mm, id="f")],
    onPage=deco,
)])
doc.build(story)
print("made:", OUT, round(os.path.getsize(OUT)/1024), "KB")
