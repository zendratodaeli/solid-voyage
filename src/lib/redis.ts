/**
 * Redis Client — Upstash Serverless Redis
 *
 * Provides a singleton Redis client and caching utilities for the entire app.
 * Uses HTTP-based Upstash Redis which works perfectly with Vercel serverless.
 *
 * Cache key conventions:
 *   ais:search:{query}          — Ship search results (60s)
 *   ais:position:{mmsi}         — Single vessel position (30s)
 *   ais:fleet:{orgId}           — Org fleet positions (30s)
 *   ais:tracks:{mmsi}:{from}:{until} — Historical tracks (5min)
 *   ais:range:{hash}            — WithinRange results (60s)
 *   ais:dest:{hash}             — FindByDestination results (120s)
 *   rates:exchange              — Exchange rates (24h)
 */

import { Redis } from "@upstash/redis";

// ═══════════════════════════════════════════════════════════════════
// SINGLETON CLIENT
// ═══════════════════════════════════════════════════════════════════

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export const redis: Redis =
  globalForRedis.redis ??
  new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

// ═══════════════════════════════════════════════════════════════════
// DEFAULT TTLs (seconds)
// ═══════════════════════════════════════════════════════════════════

export const CACHE_TTL = {
  /** AIS ship search autocomplete */
  AIS_SEARCH: 60,
  /** Single vessel last position */
  AIS_POSITION: 30,
  /** Org fleet positions */
  AIS_FLEET: 30,
  /** Historical tracks (immutable data) */
  AIS_TRACKS: 300,
  /** Within Range query */
  AIS_RANGE: 60,
  /** Find By Destination query */
  AIS_DESTINATION: 120,
  /** Exchange rates */
  EXCHANGE_RATES: 86400, // 24 hours
} as const;

// ═══════════════════════════════════════════════════════════════════
// CACHE UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Get-or-set cache pattern.
 * Tries to read from Redis first; on miss, calls the fetcher,
 * stores the result with the given TTL, and returns it.
 *
 * @param key   - Redis key
 * @param ttl   - Time-to-live in seconds
 * @param fetcher - Async function to call on cache miss
 * @returns The cached or freshly-fetched data
 */
export async function cached<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    // Try cache first
    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) {
      return hit;
    }
  } catch (err) {
    // Redis down → fall through to fetcher
    console.warn(`[Redis] Cache read failed for "${key}":`, err);
  }

  // Cache miss → fetch fresh data
  const data = await fetcher();

  try {
    // Store in cache (fire-and-forget, don't block response)
    await redis.set(key, JSON.stringify(data), { ex: ttl });
  } catch (err) {
    console.warn(`[Redis] Cache write failed for "${key}":`, err);
  }

  return data;
}

/**
 * Invalidate (delete) a cache key.
 * Useful when data is mutated and the cache should be cleared.
 */
export async function invalidate(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.warn(`[Redis] Invalidate failed for "${key}":`, err);
  }
}

/**
 * Invalidate all keys matching a prefix pattern.
 * Uses SCAN to find keys — safe for production, no KEYS command.
 *
 * Example: invalidatePattern("ais:fleet:org_*") clears all fleet caches.
 */
export async function invalidatePattern(pattern: string): Promise<number> {
  try {
    let cursor = 0;
    let deleted = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = Number(nextCursor);

      if (keys.length > 0) {
        await redis.del(...(keys as string[]));
        deleted += keys.length;
      }
    } while (cursor !== 0);

    return deleted;
  } catch (err) {
    console.warn(`[Redis] Pattern invalidate failed for "${pattern}":`, err);
    return 0;
  }
}

/**
 * Simple hash for cache keys — creates a short, stable string
 * from arbitrary input (used for query params, coordinates, etc.)
 */
export function hashKey(...parts: (string | number | undefined)[]): string {
  const str = parts.filter((p) => p !== undefined).join(":");
  // Simple FNV-1a 32-bit hash for cache key shortening
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}
