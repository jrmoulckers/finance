// SPDX-License-Identifier: BUSL-1.1

/**
 * Rate limiting module for Supabase Edge Functions (#614).
 *
 * Provides a shared, database-backed sliding-window rate limiter that
 * all Edge Functions use for consistent request throttling. The actual
 * counter logic lives in the `check_rate_limit` PostgreSQL RPC (see
 * migration 20260323000003_rate_limits.sql) which performs an atomic
 * UPSERT — no race conditions, no double-counting.
 *
 * Design:
 *   - Each function defines a {@link RateLimitConfig} (max requests,
 *     window duration, key prefix).
 *   - The identifier is either a user ID (for authenticated endpoints)
 *     or a client IP (for public/pre-auth endpoints).
 *   - On failure (DB down, RPC error), the limiter's behaviour depends
 *     on `failMode` (#1311):
 *       - `'open'`   (default) — request is allowed through.
 *       - `'closed'` — an in-memory fallback counter is checked; if
 *         that also exceeds the limit the request is denied (429).
 *     Auth-sensitive endpoints default to `failMode: 'closed'`.
 *
 * Security:
 *   NEVER log or return the rate-limit key — it may contain user IDs
 *   or IP addresses.
 */

import { getCorsHeaders } from './cors.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Failure behaviour when the database-backed rate-limit check is
 * unavailable (e.g. DB connection lost, RPC error).
 *
 * - `'open'`   — Allow the request through (default, backward-compatible).
 * - `'closed'` — Deny the request with 429. A lightweight in-memory
 *                fallback counter is consulted first so that legitimate
 *                traffic is not immediately blocked; only when the
 *                in-memory limit is also exceeded does the request fail.
 *
 * **Guideline:** Use `'closed'` on security-sensitive endpoints
 * (authentication, account deletion) where an attacker could
 * intentionally degrade the DB to bypass rate limits (#1311).
 */
export type RateLimitFailMode = 'open' | 'closed';

/** Configuration for a single rate-limited endpoint. */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window. */
  maxRequests: number;
  /** Window duration in seconds. */
  windowSeconds: number;
  /** Key prefix for namespacing (typically the function name). */
  keyPrefix: string;
  /**
   * Behaviour when the DB rate-limit check fails.
   *
   * - `'open'`   — Allow through (default for backward compatibility).
   * - `'closed'` — Deny with 429 if in-memory fallback also exceeded.
   *
   * @default 'open'
   */
  failMode?: RateLimitFailMode;
}

/** Result of a rate limit check. */
export interface RateLimitResult {
  /** Whether the request is allowed (within the limit). */
  allowed: boolean;
  /** Number of requests remaining in the current window. */
  remaining: number;
  /** When the current window expires. */
  resetAt: Date;
  /** Seconds until the window resets (only set when rate-limited). */
  retryAfterSeconds?: number;
}

/**
 * Minimal interface for a client that supports Supabase-style RPC calls.
 *
 * Using a structural interface (rather than importing SupabaseClient)
 * keeps this module loosely coupled and easy to test with mocks.
 */
export interface RpcClient {
  rpc(
    fn: string,
    params?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

// ---------------------------------------------------------------------------
// In-memory fallback counter (#1311)
// ---------------------------------------------------------------------------

/**
 * Lightweight, per-key in-memory rate-limit counter that activates when
 * the database RPC is unavailable.
 *
 * Each entry has a short TTL (default 60 s) to prevent unbounded memory
 * growth. The counter is intentionally conservative — it uses the same
 * `maxRequests` ceiling so legitimate users are rarely affected, but an
 * attacker who causes DB failures cannot send unlimited requests.
 *
 * This map lives for the lifetime of the Deno Deploy isolate. Because
 * Edge Functions scale horizontally, the effective per-IP limit during a
 * DB outage is `maxRequests × number_of_isolates` — still much better
 * than no limit at all.
 */
interface FallbackEntry {
  count: number;
  expiresAt: number; // Date.now()-based epoch millis
}

/** Default TTL for fallback entries: 60 seconds. */
const FALLBACK_TTL_MS = 60_000;

/**
 * Global in-memory fallback store, keyed by the full rate-limit key
 * (`prefix:identifier`). Periodically pruned on access.
 */
const fallbackStore = new Map<string, FallbackEntry>();

/**
 * Maximum number of entries before a forced full prune.
 *
 * Edge Functions on Deno Deploy have limited memory; this cap prevents
 * a flood of unique IPs from exhausting the isolate's heap.
 */
const FALLBACK_MAX_ENTRIES = 10_000;

/**
 * Prune expired entries from the fallback store.
 *
 * Called lazily before every fallback check. A full prune is forced
 * when the store exceeds {@link FALLBACK_MAX_ENTRIES}.
 */
function pruneFallbackStore(): void {
  const now = Date.now();
  if (fallbackStore.size <= FALLBACK_MAX_ENTRIES) {
    // Quick-path: only prune when the store is moderately sized by
    // relying on per-key expiry checks in checkFallback.
    return;
  }
  for (const [key, entry] of fallbackStore) {
    if (entry.expiresAt <= now) {
      fallbackStore.delete(key);
    }
  }
}

/**
 * Check the in-memory fallback counter for a given key.
 *
 * Increments the counter and returns whether the request is within
 * the allowed limit. Expired entries are lazily recycled.
 *
 * @param key         The full rate-limit key (`prefix:identifier`).
 * @param maxRequests Maximum allowed requests within the TTL window.
 * @returns `true` if the request is allowed, `false` if rate-limited.
 */
function checkFallback(key: string, maxRequests: number): boolean {
  pruneFallbackStore();

  const now = Date.now();
  const existing = fallbackStore.get(key);

  if (!existing || existing.expiresAt <= now) {
    // First request or expired window — start fresh.
    fallbackStore.set(key, { count: 1, expiresAt: now + FALLBACK_TTL_MS });
    return true;
  }

  existing.count += 1;
  return existing.count <= maxRequests;
}

// ---------------------------------------------------------------------------
// Pre-defined rate limit configurations per Edge Function
// ---------------------------------------------------------------------------

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'health-check': { maxRequests: 60, windowSeconds: 60, keyPrefix: 'health-check' },
  'auth-webhook': {
    maxRequests: 30,
    windowSeconds: 60,
    keyPrefix: 'auth-webhook',
    failMode: 'closed',
  },
  'passkey-register': {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: 'passkey-register',
    failMode: 'closed',
  },
  'passkey-authenticate': {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: 'passkey-authenticate',
    failMode: 'closed',
  },
  'household-invite': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'household-invite' },
  'data-export': { maxRequests: 10, windowSeconds: 3600, keyPrefix: 'data-export' },
  'account-deletion': {
    maxRequests: 3,
    windowSeconds: 3600,
    keyPrefix: 'account-deletion',
    failMode: 'closed',
  },
  'sync-health-report': { maxRequests: 60, windowSeconds: 3600, keyPrefix: 'sync-health-report' },
  'process-recurring': { maxRequests: 10, windowSeconds: 60, keyPrefix: 'process-recurring' },
  'manage-webhooks': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'manage-webhooks' },
  'admin-dashboard': { maxRequests: 60, windowSeconds: 60, keyPrefix: 'admin-dashboard' },
  'send-notification': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'send-notification' },
  'launch-readiness': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'launch-readiness' },
  'family-plan': { maxRequests: 20, windowSeconds: 60, keyPrefix: 'family-plan' },
  referral: { maxRequests: 20, windowSeconds: 60, keyPrefix: 'referral' },
  'generate-report': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'generate-report' },
  'exchange-rates': { maxRequests: 60, windowSeconds: 60, keyPrefix: 'exchange-rates' },
  'detect-bills': { maxRequests: 10, windowSeconds: 60, keyPrefix: 'detect-bills' },
  'import-data': { maxRequests: 5, windowSeconds: 60, keyPrefix: 'import-data' },
  'spending-forecast': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'spending-forecast' },
  'bank-connection': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'bank-connection' },
  'bank-webhook': { maxRequests: 120, windowSeconds: 60, keyPrefix: 'bank-webhook' },
  'anomaly-detection': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'anomaly-detection' },
  'consent-management': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'consent-management' },
  'investment-sync': { maxRequests: 20, windowSeconds: 60, keyPrefix: 'investment-sync' },
};

// ---------------------------------------------------------------------------
// Core rate-limit check
// ---------------------------------------------------------------------------

/**
 * Check and increment the rate limit for a given identifier.
 *
 * Calls the `check_rate_limit` PostgreSQL RPC which performs an atomic
 * UPSERT (INSERT ... ON CONFLICT DO UPDATE). The counter resets
 * automatically when the window expires.
 *
 * **Failure behaviour** (configurable via `config.failMode`, #1311):
 *   - `'open'`   (default) — if the RPC call fails, the request is
 *     **allowed** so legitimate traffic is never blocked.
 *   - `'closed'` — if the RPC call fails, an **in-memory fallback
 *     counter** is consulted. The request is denied (429) only when the
 *     fallback limit is also exceeded, preventing both false positives
 *     for legitimate users and unlimited bypass for attackers.
 *
 * Infrastructure failures are always logged as warnings (#1311).
 *
 * @param supabase  A Supabase client (service_role) or compatible mock.
 * @param identifier  The rate-limit subject — user ID or client IP.
 * @param config  The rate limit configuration for this endpoint.
 * @returns The rate limit check result.
 */
export async function checkRateLimit(
  supabase: RpcClient,
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const key = `${config.keyPrefix}:${identifier}`;
  const failMode = config.failMode ?? 'open';

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    });

    if (error || !data) {
      // Log infrastructure failure as a warning (#1311)
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Rate-limit DB check failed',
          keyPrefix: config.keyPrefix,
          failMode,
          errorMessage: error?.message ?? 'RPC returned null data',
        }),
      );

      return handleDbFailure(key, config, failMode);
    }

    const result = data as {
      allowed: boolean;
      remaining: number;
      reset_at: string;
      current_count: number;
    };

    const resetAt = new Date(result.reset_at);
    const retryAfterSeconds = result.allowed
      ? undefined
      : Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000));

    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetAt,
      retryAfterSeconds,
    };
  } catch (err: unknown) {
    // Log infrastructure failure as a warning (#1311)
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'Rate-limit DB check threw exception',
        keyPrefix: config.keyPrefix,
        failMode,
        errorMessage: err instanceof Error ? err.message : 'unknown',
      }),
    );

    return handleDbFailure(key, config, failMode);
  }
}

/**
 * Handle a DB-level rate-limit failure according to the configured
 * fail mode (#1311).
 *
 * - `'open'`   — Allow unconditionally (legacy behaviour).
 * - `'closed'` — Consult the in-memory fallback counter; deny if the
 *                per-key limit is exceeded.
 */
function handleDbFailure(
  key: string,
  config: RateLimitConfig,
  failMode: RateLimitFailMode,
): RateLimitResult {
  if (failMode === 'closed') {
    const fallbackAllowed = checkFallback(key, config.maxRequests);
    if (!fallbackAllowed) {
      const resetAt = new Date(Date.now() + FALLBACK_TTL_MS);
      const retryAfterSeconds = Math.ceil(FALLBACK_TTL_MS / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfterSeconds,
      };
    }
    // Fallback allows — report remaining as unknown (0) but let through.
    return { allowed: true, remaining: 0, resetAt: new Date() };
  }

  // Fail open: allow request unconditionally
  return { allowed: true, remaining: 0, resetAt: new Date() };
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

/**
 * Build a standardised 429 Too Many Requests response.
 *
 * Includes:
 *   - CORS headers (origin-validated via getCorsHeaders)
 *   - `Retry-After` header (seconds until window reset)
 *   - `X-RateLimit-*` headers for client introspection
 *
 * @param request  The incoming request (for CORS origin validation).
 * @param result   The rate limit check result.
 * @param config   The rate limit configuration (for X-RateLimit-Limit).
 */
export function rateLimitResponse(
  request: Request,
  result: RateLimitResult,
  config: RateLimitConfig,
): Response {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfterSeconds ?? 0),
      'X-RateLimit-Limit': String(config.maxRequests),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': result.resetAt.toISOString(),
    },
  });
}

// ---------------------------------------------------------------------------
// Success response headers
// ---------------------------------------------------------------------------

/**
 * Build `X-RateLimit-*` headers for **successful** (non-429) responses.
 *
 * Best-practice: include rate-limit metadata on every response so clients
 * can proactively back off before hitting the limit. This avoids surprise
 * 429s and enables client-side adaptive polling.
 *
 * Returns a plain object suitable for spreading into a Response's headers:
 * ```ts
 * return new Response(body, {
 *   headers: { ...otherHeaders, ...rateLimitHeaders(result, config) },
 * });
 * ```
 *
 * @param result  The rate limit check result from {@link checkRateLimit}.
 * @param config  The rate limit configuration for this endpoint.
 */
export function rateLimitHeaders(
  result: RateLimitResult,
  config: RateLimitConfig,
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(config.maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': result.resetAt.toISOString(),
  };
}

/**
 * Append rate-limit headers to an existing Response without mutating it.
 *
 * Creates a new Response with the same body and status, merging in
 * `X-RateLimit-*` headers. Use this to annotate any response after a
 * successful rate-limit check:
 *
 * ```ts
 * const rl = await checkRateLimit(client, id, RATE_LIMITS['my-fn']);
 * if (!rl.allowed) return rateLimitResponse(req, rl, RATE_LIMITS['my-fn']);
 * const response = jsonResponse(req, data);
 * return appendRateLimitHeaders(response, rl, RATE_LIMITS['my-fn']);
 * ```
 *
 * @param response  The original response to augment.
 * @param result    The rate limit check result.
 * @param config    The rate limit configuration for this endpoint.
 * @returns A new Response with rate-limit headers appended.
 */
export function appendRateLimitHeaders(
  response: Response,
  result: RateLimitResult,
  config: RateLimitConfig,
): Response {
  const headers = new Headers(response.headers);
  const rlHeaders = rateLimitHeaders(result, config);
  for (const [key, value] of Object.entries(rlHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Enhanced rate-limit check with burst detection (#1103)
// ---------------------------------------------------------------------------

export async function checkRateLimitEnhanced(
  supabase: RpcClient,
  identifier: string,
  config: RateLimitConfig,
  burstLimit?: number,
  blockSeconds: number = 300,
): Promise<RateLimitResult & { blocked?: boolean; blockReason?: string }> {
  const key = `${config.keyPrefix}:${identifier}`;
  const failMode = config.failMode ?? 'open';
  try {
    const { data, error } = await supabase.rpc('check_rate_limit_enhanced', {
      p_key: key,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
      p_burst_limit: burstLimit ?? null,
      p_block_seconds: blockSeconds,
    });
    if (error || !data) {
      // Log and fall back to standard check which handles failMode (#1311)
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Enhanced rate-limit DB check failed, falling back',
          keyPrefix: config.keyPrefix,
          failMode,
          errorMessage: error?.message ?? 'RPC returned null data',
        }),
      );
      return checkRateLimit(supabase, identifier, config);
    }
    const r = data as {
      allowed: boolean;
      remaining: number;
      reset_at: string;
      current_count: number;
      blocked: boolean;
      block_reason: string | null;
    };
    const resetAt = new Date(r.reset_at);
    return {
      allowed: r.allowed,
      remaining: r.remaining,
      resetAt,
      retryAfterSeconds: r.allowed
        ? undefined
        : Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
      blocked: r.blocked,
      blockReason: r.block_reason ?? undefined,
    };
  } catch (err: unknown) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'Enhanced rate-limit DB check threw exception, falling back',
        keyPrefix: config.keyPrefix,
        failMode,
        errorMessage: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return checkRateLimit(supabase, identifier, config);
  }
}

// ---------------------------------------------------------------------------
// IP extraction helper
// ---------------------------------------------------------------------------

/**
 * IPv4 pattern — matches `0.0.0.0` through `255.255.255.255`.
 *
 * Does NOT validate octets are <=255; the goal is to reject obviously
 * malicious payloads (e.g. script injections, multi-line values),
 * not to be a full RFC 5321 validator.
 */
const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Simplified IPv6 pattern — matches colon-hex notation including
 * `::` shorthand and IPv4-mapped addresses (e.g. `::ffff:192.0.2.1`).
 */
const IPV6_RE = /^[0-9a-fA-F:]+(%[a-zA-Z0-9]+)?$/;

/**
 * Validate that a string looks like a plausible IP address.
 *
 * This is a defence-in-depth measure to prevent log injection,
 * header injection, or abuse-key pollution — not a strict IP parser.
 *
 * @param ip Candidate IP string.
 * @returns true if the string matches IPv4 or IPv6 syntax.
 */
export function isPlausibleIp(ip: string): boolean {
  if (ip.length === 0 || ip.length > 45) return false;
  return IPV4_RE.test(ip) || IPV6_RE.test(ip);
}

/**
 * Extract the client IP address from request headers.
 *
 * **Security fix (#783):** Uses the **rightmost** entry in
 * `X-Forwarded-For` instead of the leftmost. In a typical
 * reverse-proxy chain (Client → CDN → LB → Edge Function), each
 * proxy *appends* the connecting IP. The leftmost entry is whatever
 * the original client sent and is trivially spoofable. The
 * rightmost entry is the IP set by the last trusted proxy (the one
 * closest to us) and represents the actual connecting client.
 *
 * Trust model:
 *   Supabase Edge Functions run on Deno Deploy behind Supabase's
 *   own load balancer. The LB appends the real connecting IP as the
 *   last entry in X-Forwarded-For. We take that last entry.
 *
 * Defence-in-depth:
 *   - IP format validation rejects non-IP payloads (script injection,
 *     header smuggling).
 *   - Falls back to `X-Real-IP` if `X-Forwarded-For` is absent.
 *   - Returns `null` if no valid IP can be determined (callers
 *     must handle this — e.g. by denying unauthenticated requests).
 *
 * @param req The incoming request.
 * @returns The client IP string, or null if unavailable / invalid.
 */
export function getClientIp(req: Request): string | null {
  // 1. X-Forwarded-For — take the RIGHTMOST (last) entry.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',');
    // Walk from the right to find the first valid IP.
    for (let i = parts.length - 1; i >= 0; i--) {
      const candidate = parts[i].trim();
      if (candidate && isPlausibleIp(candidate)) {
        return candidate;
      }
    }
  }

  // 2. X-Real-IP — single value set by some proxies.
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp && isPlausibleIp(realIp)) {
    return realIp;
  }

  return null;
}
