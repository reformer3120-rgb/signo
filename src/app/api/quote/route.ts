import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { quote } from "@/lib/naver";

export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "005930").replace(/\D/g, "");
  const name = searchParams.get("name") || code;
  try {
    const data = await cached(`quote:${code}`, 60, () => quote(code, name));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
