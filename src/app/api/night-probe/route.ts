import { NextResponse } from "next/server";
import { kisGet, hasKIS } from "@/lib/kis";
export const revalidate = 0;
export const maxDuration = 60;

// 임시 진단: 야간선물(EUREX 연계 / CME 야간) 조회 가능 여부
export async function GET() {
  if (!hasKIS()) return NextResponse.json({ error: "KIS 키 없음" });
  const out: Record<string, unknown> = {};
  const probes: [string, string, Record<string, string>][] = [
    ["주간 코스피200(101)", "FHMIF10000000", { FID_COND_MRKT_DIV_CODE: "F", FID_INPUT_ISCD: "10100000" }],
    ["야간 시장구분 JF/101", "FHMIF10000000", { FID_COND_MRKT_DIV_CODE: "JF", FID_INPUT_ISCD: "10100000" }],
    ["야간 시장구분 N/101", "FHMIF10000000", { FID_COND_MRKT_DIV_CODE: "N", FID_INPUT_ISCD: "10100000" }],
    ["EUREX 연계옵션 시세", "FHMIF10000000", { FID_COND_MRKT_DIV_CODE: "F", FID_INPUT_ISCD: "10500000" }],
  ];
  for (const [label, tr, params] of probes) {
    try {
      const j = await kisGet("/uapi/domestic-futureoption/v1/quotations/inquire-price", tr, params);
      const o1 = (j.output1 ?? {}) as Record<string, string>;
      const o2 = (j.output2 ?? {}) as Record<string, string>;
      out[label] = { name: o1.hts_kor_isnm ?? o2.hts_kor_isnm, price: o1.futs_prpr ?? o2.futs_prpr, prdy: o1.futs_prdy_clpr ?? o2.futs_prdy_clpr };
    } catch (e) {
      out[label] = String(e).slice(0, 130);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  // 야간선물 전용 엔드포인트가 따로 있는지
  for (const [label, path, tr, params] of [
    ["야간선물 시세(nightprice)", "/uapi/domestic-futureoption/v1/quotations/inquire-price", "FHMIF10000000", { FID_COND_MRKT_DIV_CODE: "F", FID_INPUT_ISCD: "10100001" }],
  ] as [string, string, string, Record<string, string>][]) {
    try {
      const j = await kisGet(path, tr, params);
      const o1 = (j.output1 ?? {}) as Record<string, string>;
      out[label] = { name: o1.hts_kor_isnm, price: o1.futs_prpr };
    } catch (e) {
      out[label] = String(e).slice(0, 130);
    }
  }
  return NextResponse.json(out);
}
