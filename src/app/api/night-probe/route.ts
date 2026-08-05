import { NextResponse } from "next/server";
import { kisGet, hasKIS } from "@/lib/kis";
export const revalidate = 0;
export const maxDuration = 60;

// 임시 진단: KIS 해외선물에 코스피200 야간(CME) 계약이 있는지
export async function GET() {
  if (!hasKIS()) return NextResponse.json({ error: "KIS 키 없음" });
  const out: Record<string, unknown> = {};
  const syms = ["KOS", "K2M", "KSM", "KM1", "KOSPI200", "1KOS", "KSPU26"];
  for (const s of syms) {
    try {
      const j = await kisGet("/uapi/overseas-futureoption/v1/quotations/inquire-price", "HHDFC55010100", {
        SRS_CD: s,
      });
      const o = (j.output1 ?? j.output ?? {}) as Record<string, string>;
      out[s] = Object.keys(o).length ? { name: o.stat_tp_cls_code ?? o.series_nm ?? "", last: o.last_price ?? o.p_last ?? "" } : "빈 응답";
    } catch (e) {
      out[s] = String(e).slice(0, 90);
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return NextResponse.json(out);
}
