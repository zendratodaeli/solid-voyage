/**
 * Server-side Rate Limiting (In-Memory Sliding Window)
 *
 * Protects API routes from abuse by limiting requests per IP/user.
 * Uses a sliding window counter stored in a Map (no external deps).
 *
 * For multi-instance deployments (e.g. Vercel), upgrade to:
 *   - @upstash/ratelimit (Redis-backed, serverless-friendly)
 *   - Vercel Edge Config rate limiting
 *
 * Usage:
 *   import { rateLimit, apiRateLimit } from "@/lib/rate-limit";
 *   const result = rateLimit(identifier);
 *   if (!result.success) return NextResponse.json(..., { status: 429 });
 */

// ─── Configuration ───────────────────────────────────────────────

interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  /** Requests remaining in current window */
  remaining: number;
  /** Unix timestamp (seconds) when the window resets */
  resetAt: number;
  /** Total limit for the window */
  limit: number;
}

// ─── Sliding Window Store ────────────────────────────────────────

interface WindowEntry {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

const store = new Map<string, WindowEntry>();

// Periodically clean expired entries to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60_000; // Every 60 seconds
let lastCleanup = Date.now();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}

// ─── Rate Limit Function ─────────────────────────────────────────

/**
 * Check and consume a rate limit token for the given identifier.
 *
 * @param identifier - Unique string to rate limit (e.g. IP, userId, orgId)
 * @param config - Rate limit configuration
 * @returns RateLimitResult with success status and metadata
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 30, windowMs: 60_000 }
): RateLimitResult {
  cleanupExpiredEntries();

  const now = Date.now();
  const entry = store.get(identifier);

  // Window expired or no entry — start fresh
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + config.windowMs;
    store.set(identifier, { count: 1, resetAt });
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetAt: Math.ceil(resetAt / 1000),
      limit: config.maxRequests,
    };
  }

  // Within window — check limit
  if (entry.count >= config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt: Math.ceil(entry.resetAt / 1000),
      limit: config.maxRequests,
    };
  }

  // Consume a token
  entry.count += 1;
  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetAt: Math.ceil(entry.resetAt / 1000),
    limit: config.maxRequests,
  };
}

// ─── Preset Configurations ───────────────────────────────────────

/** Standard API rate limit: 30 requests per 60 seconds per identifier */
export const API_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000,
};

/** Strict rate limit for write operations: 10 requests per 60 seconds */
export const WRITE_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60_000,
};

/** Auth-sensitive limit: 5 requests per 60 seconds (password resets, etc.) */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 5,
  windowMs: 60_000,
};

// ─── Helper: Extract identifier from request ─────────────────────

/**
 * Extract a rate-limit identifier from a Next.js request.
 * Uses Clerk userId (if authenticated) or falls back to IP.
 */
export function getRateLimitIdentifier(
  request: Request,
  userId?: string | null
): string {
  if (userId) return `user:${userId}`;

  // Try common headers for real IP behind proxies
  const headers = new Headers(request.headers);
  const forwarded = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";

  return `ip:${ip}`;
}

// ─── Helper: Build 429 Response ──────────────────────────────────

import { NextResponse } from "next/server";

/**
 * Build a standardized 429 Too Many Requests response.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: "Too many requests. Please try again later.",
      retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.resetAt - Math.floor(Date.now() / 1000)),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.resetAt),
      },
    }
  );
}

/**
 * One-liner: check rate limit and return 429 response if exceeded.
 * Returns null if the request is allowed.
 *
 * Usage in API routes:
 *   const blocked = apiRateLimit(request, user?.id);
 *   if (blocked) return blocked;
 */
export function apiRateLimit(
  request: Request,
  userId?: string | null,
  config: RateLimitConfig = WRITE_RATE_LIMIT
): NextResponse | null {
  const identifier = getRateLimitIdentifier(request, userId);
  const result = rateLimit(identifier, config);
  if (!result.success) return rateLimitResponse(result);
  return null;
}
