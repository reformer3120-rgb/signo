import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { redis } from "@/lib/cache";

export const revalidate = 0;

/**
 * 관심종목 서버 저장.
 *
 * 열쇠를 두 개 쓴다.
 *   1) 쿠키(signo_uid) — 주 열쇠. 앱을 껐다 켜도 남는다.
 *   2) 접속 IP        — 쿠키가 사라졌을 때(재설치·캐시 삭제) 되찾는 보조 열쇠.
 *
 * IP만 쓰면 통신사 IP가 바뀔 때 목록이 사라지고, 같은 공유기를 쓰는 사람끼리
 * 목록이 섞인다. 그래서 쿠키를 앞에 두고 IP는 복구용으로만 쓴다.
 * IP는 그대로 두지 않고 해시로 바꿔 보관한다.
 */

interface WatchItem {
  code: string;
  name: string;
  market: "KR" | "US";
}

const TTL = 400 * 24 * 3600; // 400일. 쓸 때마다 갱신된다
const uidKey = (uid: string) => `wl:u:${uid}`;
const ipKey = (h: string) => `wl:ip:${h}`;

/** 접속 IP를 해시로 — 원본 주소는 저장하지 않는다 */
function ipHash(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = (fwd.split(",")[0] || req.headers.get("x-real-ip") || "").trim();
  if (!ip) return "";
  return createHash("sha256").update(`signo:${ip}`).digest("hex").slice(0, 24);
}

function readCookie(req: Request, name: string): string {
  const raw = req.headers.get("cookie") ?? "";
  const hit = raw.split(";").find((c) => c.trim().startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=").trim()) : "";
}

function withCookie(res: NextResponse, uid: string) {
  res.cookies.set("signo_uid", uid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL,
    path: "/",
  });
  return res;
}

/** 이 요청의 주인을 찾는다. 없으면 새로 만든다. */
async function identify(req: Request): Promise<{ uid: string; fresh: boolean }> {
  const fromCookie = readCookie(req, "signo_uid");
  if (fromCookie) return { uid: fromCookie, fresh: false };
  // 쿠키가 없으면 같은 IP로 쓰던 목록이 있는지 찾아본다
  const h = ipHash(req);
  if (redis && h) {
    const found = await redis.get<string>(ipKey(h)).catch(() => null);
    if (found) return { uid: found, fresh: true };
  }
  return { uid: randomUUID(), fresh: true };
}

export async function GET(req: Request) {
  const { uid } = await identify(req);
  if (!redis) return withCookie(NextResponse.json({ data: [], stored: false }), uid);
  const data = (await redis.get<WatchItem[]>(uidKey(uid)).catch(() => null)) ?? [];
  return withCookie(NextResponse.json({ data, stored: true }), uid);
}

export async function PUT(req: Request) {
  const { uid } = await identify(req);
  let items: WatchItem[] = [];
  try {
    const body = (await req.json()) as { items?: unknown };
    if (Array.isArray(body.items)) {
      items = body.items
        .filter((x): x is WatchItem => !!x && typeof x === "object")
        .map((x) => ({
          code: String(x.code ?? "").slice(0, 20),
          name: String(x.name ?? "").slice(0, 60),
          market: (x.market === "US" ? "US" : "KR") as WatchItem["market"],
        }))
        .filter((x) => x.code)
        .slice(0, 200); // 상한 — 무한정 쌓이지 않게
    }
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!redis) return withCookie(NextResponse.json({ ok: true, stored: false }), uid);
  await redis.set(uidKey(uid), items, { ex: TTL });
  const h = ipHash(req);
  if (h) await redis.set(ipKey(h), uid, { ex: TTL }); // IP → 주인 연결도 갱신
  return withCookie(NextResponse.json({ ok: true, stored: true }), uid);
}
