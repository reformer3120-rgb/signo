// 캐시: Upstash Redis(설정 시) 또는 인메모리 폴백.
import { Redis } from "@upstash/redis";

export const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const mem = new Map<string, { v: unknown; exp: number }>();

/**
 * 배포 식별자를 모든 캐시 키 앞에 붙인다.
 * 레디스는 배포 간에 유지되므로, 응답 형태를 바꾼 코드를 올려도 이전 형태가
 * 그대로 내려와 새 화면이 깨지는 일이 있었다. 배포가 바뀌면 캐시도 갈리게 한다.
 */
const BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";

/** key로 캐시된 값을 반환하거나, fn()을 실행해 ttlSec 동안 캐시 */
export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const k = `${BUILD}:${key}`;
  if (redis) {
    const hit = await redis.get<T>(k);
    if (hit !== null && hit !== undefined) return hit;
    const v = await fn();
    await redis.set(k, v, { ex: ttlSec });
    return v;
  }
  const now = Date.now();
  const hit = mem.get(k);
  if (hit && hit.exp > now) return hit.v as T;
  const v = await fn();
  mem.set(k, { v, exp: now + ttlSec * 1000 });
  return v;
}

export const cacheBackend = redis ? "upstash" : "memory";
