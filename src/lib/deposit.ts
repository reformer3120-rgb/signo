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
  const out: DepositTrend[] = [];

  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tr = m[1];
    if (!/\d{2}\.\d{2}\.\d{2}/.test(tr)) continue;
    // 표에는 부호가 없고 증감 방향이 CSS 클래스(rate_up / rate_down)로만 표시된다.
    const cells = [...tr.matchAll(/<td[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)].map((c) => ({
      down: c[1].includes("rate_down"),
      text: c[2].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim(),
    }));
    if (cells.length < 11) continue;
    const date = cells[0].text;
    if (!/^\d{2}\.\d{2}\.\d{2}$/.test(date)) continue;
    const row = cells.slice(1, 11);
    out.push({
      date,
      items: LABELS.map((label, k) => {
        const chg = row[k * 2 + 1];
        return {
          label,
          value: n(row[k * 2].text),
          change: chg.down ? -n(chg.text) : n(chg.text),
        };
      }),
    });
    if (out.length >= 20) break;
  }
  return out;
}
