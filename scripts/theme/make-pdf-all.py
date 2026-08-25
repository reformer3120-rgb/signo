# 전 종목 테마 분류 작업지 PDF.
#
# 코스피·코스닥 상장 전 종목을 테마별로 늘어놓고, 종목마다 설명을 적을 칸을 둔다.
# 아직 어느 테마에도 못 붙인 종목은 뒤에 따로 모아 테마를 적을 칸까지 둔다.
#
# 실행
#   node scripts/theme/doc-all.mjs && python scripts/theme/make-pdf-all.py
# 결과 → SIGNO-전종목-테마작업지.pdf
import json
import os

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

D = json.load(open(".cache/theme/doc-all.json", encoding="utf-8"))
OUT = "SIGNO-전종목-테마작업지.pdf"

FONTS = r"C:\Windows\Fonts"
pdfmetrics.registerFont(TTFont("KR", os.path.join(FONTS, "malgun.ttf")))
pdfmetrics.registerFont(TTFont("KR-B", os.path.join(FONTS, "malgunbd.ttf")))
pdfmetrics.registerFontFamily("KR", normal="KR", bold="KR-B")

BRAND = colors.HexColor("#3844BE")
FG = colors.HexColor("#15162A")
MUTED = colors.HexColor("#5A5E73")
LINE = colors.HexColor("#E4E5EF")
SURF = colors.HexColor("#F5F6FA")
BLANK = colors.HexColor("#FFFCF3")

ss = getSampleStyleSheet()


def st(n, size, lead, color=FG, font="KR", sb=0, sa=0):
    return ParagraphStyle(n, parent=ss["Normal"], fontName=font, fontSize=size,
                          leading=lead, textColor=color, spaceBefore=sb,
                          spaceAfter=sa, alignment=TA_LEFT)


S = {
    "title": st("t", 23, 29, FG, "KR-B", 0, 4),
    "sub": st("s", 10.5, 16, MUTED),
    "h1": st("h1", 15, 21, BRAND, "KR-B", 14, 6),
    "h2": st("h2", 11.5, 16, FG, "KR-B", 10, 4),
    "th": st("th", 11, 15, FG, "KR-B", 0, 2),
    "body": st("b", 9.5, 15),
    "note": st("n", 8.6, 13, MUTED),
    "cell": st("c", 8.2, 11.5),
    "cellm": st("cm", 7.6, 10.5, MUTED),
    "cellb": st("cb", 8.2, 11.5, FG, "KR-B"),
    "num": st("nu", 8.2, 11.5, MUTED),
}


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def cap(v):
    if v is None:
        return "—"
    return f"{v/10000:.1f}조" if v >= 10000 else f"{v:,}억"


W = 170 * mm
story = []

# ── 표지 ──────────────────────────────────────────────────
story += [
    Spacer(1, 26 * mm),
    Paragraph("SIGNO 전 종목 테마 작업지", S["title"]),
    Paragraph(
        f"코스피·코스닥 {D['상장종목']:,}종목 &nbsp;|&nbsp; 테마 편입 {D['편입종목']:,} · "
        f"미분류 {D['미분류']:,} &nbsp;|&nbsp; {D['만든날']} 기준",
        S["sub"],
    ),
    Spacer(1, 7 * mm),
    Paragraph(
        "이 문서는 <b>채워 넣기 위한 것</b>이다. 종목마다 설명을 적을 칸을 두었고, "
        "아직 어느 테마에도 못 붙인 종목은 뒤에 따로 모아 테마를 적을 칸까지 두었다. "
        "적어 주시면 그대로 화면에 반영한다.",
        S["body"],
    ),
    Spacer(1, 5 * mm),
]

rows = [
    [Paragraph("상장 종목", S["cellb"]), Paragraph(f"{D['상장종목']:,}", S["cell"]),
     Paragraph("KIS 시세가 잡히는 종목 (상장폐지 제외)", S["cellm"])],
    [Paragraph("사업보고서 확보", S["cellb"]),
     Paragraph(f"{D['개요확보']:,} ({D['개요확보']/D['상장종목']*100:.0f}%)", S["cell"]),
     Paragraph("DART ‘사업의 내용 — 사업의 개요’", S["cellm"])],
    [Paragraph("테마 편입", S["cellb"]),
     Paragraph(f"{D['편입종목']:,} ({D['편입종목']/D['상장종목']*100:.0f}%)", S["cell"]),
     Paragraph("규칙이 근거를 찾은 종목", S["cellm"])],
    [Paragraph("미분류", S["cellb"]),
     Paragraph(f"{D['미분류']:,}", S["cell"]),
     Paragraph("설명은 있으나 규칙이 못 잡음 + 보고서 없음", S["cellm"])],
]
t = Table(rows, colWidths=[32 * mm, 30 * mm, W - 62 * mm], hAlign="LEFT")
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("BACKGROUND", (0, 0), (0, -1), SURF),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
]))
story += [t, PageBreak()]

# ── 가이드라인 ────────────────────────────────────────────
story += [Paragraph("어떻게 채우나", S["h1"])]

guide = [
    ("1. 시가총액 큰 것부터",
     "각 테마 안에서 시총 순으로 늘어놓았다. 큰 종목이 테마의 성격을 정하므로 "
     "위에서부터 채우면 적은 노력으로 많이 좋아진다. 아래쪽 소형주는 비워 둬도 된다."),
    ("2. 설명은 한 문장으로",
     "‘무엇을 만들어 어디에 파는가’ 한 문장이면 충분하다. 예: “스마트폰용 카메라 모듈을 "
     "삼성전자에 납품한다.” 실적이나 전망은 적지 않는다 — 그건 다른 화면이 맡는다."),
    ("3. 테마가 틀렸으면 그 줄에 적는다",
     "‘이건 A 테마가 아니라 B 테마’ 처럼 적어 주면 된다. 여러 테마에 걸치는 것도 "
     "그대로 적어 주면 된다 — 한 종목이 여러 테마에 드는 것은 정상이다."),
    ("4. 미분류는 뒤쪽에",
     "뒤에 미분류 종목을 시총 순으로 모아 두었다. 사업보고서에서 뽑은 첫머리를 함께 "
     "적어 두었으니 그것을 보고 테마를 정해 주면 된다. 마땅한 테마가 없으면 "
     "새 테마 이름을 적어도 된다."),
]
for h, b in guide:
    story += [Paragraph(h, S["h2"]), Paragraph(b, S["body"])]

story += [Paragraph("테마를 나눈 기준", S["h1"])]
crit = [
    ("밸류체인 단계로 쪼갠다",
     "‘2차전지’ 한 덩어리에는 셀 제조사와 장비사가 섞여 같이 움직이지 않는다. "
     "소재·셀·장비·재활용으로 나눈다."),
    ("사업보고서로 판정할 수 있어야 한다",
     "‘정치인 관련주’ 처럼 근거가 없는 것은 넣지 않는다."),
    ("한 종목이 여러 테마에 들어가도 된다",
     "솔브레인은 반도체 소재이면서 2차전지 소재다. 실제로 그렇다."),
    ("‘만드는 쪽’ 과 ‘설비를 대는 쪽’ 을 가른다",
     "양극재를 만드는 회사와, 양극재 제조설비를 납품하는 회사는 다른 테마다."),
    ("어디에 쓰이는지는 그 회사의 업종이 아니다",
     "“반도체·로봇·자동차 등에 적용됩니다” 는 적용 분야 나열이지 사업이 아니다."),
]
rows = [[Paragraph(esc(h), S["cellb"]), Paragraph(esc(b), S["cell"])] for h, b in crit]
t = Table(rows, colWidths=[52 * mm, W - 52 * mm], hAlign="LEFT")
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("BACKGROUND", (0, 0), (0, -1), SURF),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
]))
story += [t, Spacer(1, 4 * mm),
          Paragraph("테마 60개 각각의 자세한 기준은 별도 문서(SIGNO 테마 분류 기준서)에 있다.",
                    S["note"])]

# ── 테마별 종목 ───────────────────────────────────────────
story.append(PageBreak())
story.append(Paragraph("테마별 종목", S["h1"]))

HEAD = ["종목", "시총", "PER", "지금 붙은 근거", "설명 (적을 자리)"]
CW = [30 * mm, 15 * mm, 13 * mm, 52 * mm, W - 110 * mm]

for g in D["대분류"]:
    story.append(Paragraph(f"{g['name']} — 테마 {len(g['themes'])} · {g['stocks']:,}종목", S["h2"]))
    for th in g["themes"]:
        head = Paragraph(
            f"{esc(th['name'])} <font size=8 color='#5A5E73'>{len(th['rows'])}종목 · "
            f"{esc(th['hint'])}</font>", S["th"])
        rows = [[Paragraph(h, S["cellb"]) for h in HEAD]]
        for r in th["rows"]:
            rows.append([
                Paragraph(f"{esc(r['name'])}<br/><font size=7 color='#5A5E73'>{r['code']}</font>",
                          S["cell"]),
                Paragraph(cap(r["cap"]), S["num"]),
                Paragraph("—" if r["per"] is None else f"{r['per']:.1f}", S["num"]),
                Paragraph(esc((r["why"] or "")[:110]), S["cellm"]),
                Paragraph("&nbsp;", S["cell"]),
            ])
        tb = Table(rows, colWidths=CW, hAlign="LEFT", repeatRows=1)
        tb.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("BACKGROUND", (0, 0), (-1, 0), SURF),
            ("BACKGROUND", (4, 1), (4, -1), BLANK),
            ("LINEBELOW", (0, 0), (-1, -2), 0.3, LINE),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("ALIGN", (1, 1), (2, -1), "RIGHT"),
        ]))
        story.append(KeepTogether([head, Spacer(1, 1 * mm)]))
        story += [tb, Spacer(1, 5 * mm)]

# ── 미분류 ────────────────────────────────────────────────
story.append(PageBreak())
story += [
    Paragraph("미분류 종목", S["h1"]),
    Paragraph(
        f"{D['미분류']:,}종목. 시가총액 큰 것부터 늘어놓았다. 사업보고서에서 뽑은 첫머리를 "
        "함께 적어 두었으니 그것을 보고 테마를 정해 주면 된다. 마땅한 테마가 없으면 "
        "새 테마 이름을 적어도 된다.",
        S["body"]),
    Spacer(1, 3 * mm),
]

H2 = ["종목", "시총", "사업보고서 첫머리", "테마 (적을 자리)"]
CW2 = [30 * mm, 15 * mm, W - 105 * mm, 60 * mm]
rows = [[Paragraph(h, S["cellb"]) for h in H2]]
for r in D["미분류목록"]:
    gist = r["gist"] or f"<font color='#B0142E'>사업보고서 없음 ({esc(r['사유'] or '')})</font>"
    rows.append([
        Paragraph(f"{esc(r['name'])}<br/><font size=7 color='#5A5E73'>{r['code']}</font>", S["cell"]),
        Paragraph(cap(r["cap"]), S["num"]),
        Paragraph(esc(r["gist"]) if r["gist"] else gist, S["cellm"]),
        Paragraph("&nbsp;", S["cell"]),
    ])
tb = Table(rows, colWidths=CW2, hAlign="LEFT", repeatRows=1)
tb.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ("BACKGROUND", (0, 0), (-1, 0), SURF),
    ("BACKGROUND", (3, 1), (3, -1), BLANK),
    ("LINEBELOW", (0, 0), (-1, -2), 0.3, LINE),
    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
    ("ALIGN", (1, 1), (1, -1), "RIGHT"),
]))
story.append(tb)


def deco(canvas, doc):
    canvas.saveState()
    canvas.setFont("KR", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 12 * mm, f"SIGNO 전 종목 테마 작업지 · {D['만든날']}")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"{doc.page}")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.4)
    canvas.line(20 * mm, 15 * mm, A4[0] - 20 * mm, 15 * mm)
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=18 * mm, bottomMargin=20 * mm,
                      title="SIGNO 전 종목 테마 작업지", author="SIGNO")
doc.addPageTemplates([PageTemplate(
    id="main",
    frames=[Frame(20 * mm, 20 * mm, W, A4[1] - 38 * mm, id="f")],
    onPage=deco,
)])
doc.build(story)
print("made:", OUT, round(os.path.getsize(OUT) / 1024), "KB")
