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
/**
 * 같은 키로 이미 계산이 돌고 있으면 그 결과를 같이 기다린다.
 *
 * 이게 없으면 캐시가 비었을 때 동시에 들어온 사람 수만큼 같은 계산이
 * 따로 돈다. 섹터 강약처럼 2,800종목 일봉을 받는 작업은 그 차이가 크다.
 * 실패한 것은 남기지 않는다 — 남기면 다음 사람도 같은 실패를 받는다.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * 배포와 무관한 값은 BUILD 를 붙이지 않는다.
 *
 * 상장주식수처럼 코드가 바뀌어도 그대로인 값까지 배포마다 갈리면, 새로 올릴
 * 때마다 종목 수천 개를 다시 받아야 한다. 실제로 테마 상세 첫 로딩이 18초
 * 걸린 이유가 이것이었다. 응답 형태가 바뀌는 값에만 BUILD 를 붙인다.
 */
export async function cached<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
  opts: { global?: boolean } = {},
): Promise<T> {
  const k = opts.global ? `g:${key}` : `${BUILD}:${key}`;

  if (redis) {
    const hit = await redis.get<T>(k);
    if (hit !== null && hit !== undefined) return hit;
  } else {
    const hit = mem.get(k);
    if (hit && hit.exp > Date.now()) return hit.v as T;
  }

  const running = inFlight.get(k);
  if (running) return running as Promise<T>;

  const p = (async () => {
    const v = await fn();
    if (redis) await redis.set(k, v, { ex: ttlSec });
    else mem.set(k, { v, exp: Date.now() + ttlSec * 1000 });
    return v;
  })();
  inFlight.set(k, p);
  try {
    return await p;
  } finally {
    inFlight.delete(k);
  }
}

export const cacheBackend = redis ? "upstash" : "memory";
