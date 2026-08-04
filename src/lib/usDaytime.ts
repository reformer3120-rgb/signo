// 미국 주간거래(국내 증권사 야간 세션) 시세 — 한국투자증권.
// 야후는 이 시간대(한국시간 10:00~18:00) 시세를 주지 않는다. 서버 전용.
import { kisGet, hasKIS } from "./kis";
import { cached } from "./cache";

/** 야후 거래소 코드 → KIS 주간거래 거래소 코드 */
function daytimeExchange(yahooExchange?: string): string {
  const e = (yahooExchange ?? "").toUpperCase();
  if (e.startsWith("NY")) return "BAY"; // NYQ · NYSE
  if (e === "PCX" || e === "ASE" || e === "AMX") return "BAA"; // NYSE Arca · 아멕스
  return "BAQ"; // NMS · NGM · NCM 등 나스닥
}

export interface DaytimeQuote {
  price: number;
  changePct: number;
  volume: number;
}

/** 종목 하나의 주간거래 시세. 체결이 없으면 null */
export async function daytimeQuote(
  symbol: string,
  yahooExchange?: string,
): Promise<DaytimeQuote | null> {
  if (!hasKIS()) return null;
  const excd = daytimeExchange(yahooExchange);
  return cached(`us:day:${excd}:${symbol}`, 60, async () => {
    try {
      const j = await kisGet("/uapi/overseas-price/v1/quotations/price", "HHDFS00000300", {
        AUTH: "",
        EXCD: excd,
        SYMB: symbol,
      });
      const o = (j.output ?? {}) as Record<string, string>;
      const price = Number(o.last) || 0;
      const volume = Number(o.tvol) || 0;
      // 주간장이 열려 있어도 체결이 한 건도 없으면 값이 비어 온다
      if (!price || !volume) return null;
      return { price, changePct: Number(o.rate) || 0, volume };
    } catch {
      return null;
    }
  });
}

/**
 * 여러 종목의 주간거래 시세.
 * KIS는 초당 호출 수 제한이 있어 조금씩 끊어 보낸다.
 */
export async function daytimeQuotes(
  items: { symbol: string; exchange?: string }[],
): Promise<Map<string, DaytimeQuote>> {
  const out = new Map<string, DaytimeQuote>();
  if (!hasKIS()) return out;
  for (let i = 0; i < items.length; i += 4) {
    const chunk = items.slice(i, i + 4);
    const res = await Promise.all(chunk.map((x) => daytimeQuote(x.symbol, x.exchange)));
    chunk.forEach((x, k) => {
      const v = res[k];
      if (v) out.set(x.symbol, v);
    });
    if (i + 4 < items.length) await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}
