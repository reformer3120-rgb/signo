// 캐시: Upstash Redis(설정 시) 또는 인메모리 폴백.
import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const mem = new Map<string, { v: unknown; exp: number }>();

/** key로 캐시된 값을 반환하거나, fn()을 실행해 ttlSec 동안 캐시 */
export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  if (redis) {
    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
    const v = await fn();
    await redis.set(key, v, { ex: ttlSec });
    return v;
  }
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && hit.exp > now) return hit.v as T;
  const v = await fn();
  mem.set(key, { v, exp: now + ttlSec * 1000 });
  return v;
}

export const cacheBackend = redis ? "upstash" : "memory";
