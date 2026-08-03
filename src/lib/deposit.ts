// 증시 주변자금 (네이버 금융 · 증시자금동향). 서버 전용.
// 표 구조: 날짜 | 고객예탁금 | 전일대비 | 신용잔고 | 전일대비 | 주식형 | 전일대비 | 혼합형 | 전일대비 | 채권형 | 전일대비
// 금액 단위는 억원.

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" };

export interface DepositItem {
  label: string;
  value: number; // 억원
  change: number; // 전일대비(억원)
}
export interface DepositTrend {
  date: string; // "26.07.30"
  items: DepositItem[];
}

const LABELS = ["고객예탁금", "신용잔고", "주식형 펀드", "혼합형 펀드", "채권형 펀드"];
const n = (s: string) => Number(s.replace(/,/g, "").replace(/[^\d.-]/g, "")) || 0;

export async function marketDeposit(): Promise<DepositTrend[]> {
  const res = await fetch("https://finance.naver.com/sise/sise_deposit.naver", {
    headers: UA,
    cache: "no-store",
  });
  const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer());
  const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim())
    .filter(Boolean);

  const out: DepositTrend[] = [];
  for (let i = 0; i + 10 < cells.length; i++) {
    // 날짜 셀(YY.MM.DD)로 행 시작을 찾는다
    if (!/^\d{2}\.\d{2}\.\d{2}$/.test(cells[i])) continue;
    const row = cells.slice(i + 1, i + 11);
    if (row.length < 10 || !row.every((c) => /[\d,]/.test(c))) continue;
    out.push({
      date: cells[i],
      items: LABELS.map((label, k) => ({
        label,
        value: n(row[k * 2]),
        change: n(row[k * 2 + 1]),
      })),
    });
    i += 10;
    if (out.length >= 20) break;
  }
  return out;
}
