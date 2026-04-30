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
 *   - On failure (DB down, RPC error), the limiter **fails open** so
 *     legitimate requests are never blocked by infrastructure issues.
 *
 * Security:
 *   NEVER log or return the rate-limit key — it may contain user IDs
 *   or IP addresses.
 */

import { getCorsHeaders } from './cors.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for a single rate-limited endpoint. */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window. */
  maxRequests: number;
  /** Window duration in seconds. */
  windowSeconds: number;
  /** Key prefix for namespacing (typically the function name). */
  keyPrefix: string;
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
// Pre-defined rate limit configurations per Edge Function
// ---------------------------------------------------------------------------

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'health-check': { maxRequests: 60, windowSeconds: 60, keyPrefix: 'health-check' },
  'auth-webhook': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'auth-webhook' },
  'passkey-register': { maxRequests: 10, windowSeconds: 60, keyPrefix: 'passkey-register' },
  'passkey-authenticate': { maxRequests: 20, windowSeconds: 60, keyPrefix: 'passkey-authenticate' },
  'household-invite': { maxRequests: 30, windowSeconds: 60, keyPrefix: 'household-invite' },
  'data-export': { maxRequests: 10, windowSeconds: 3600, keyPrefix: 'data-export' },
  'account-deletion': { maxRequests: 3, windowSeconds: 3600, keyPrefix: 'account-deletion' },
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
 * **Fail-open**: if the RPC call fails for any reason (DB down, network
 * error, missing function), the request is **allowed** so legitimate
 * traffic is never blocked by rate-limiting infrastructure issues.
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

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    });

    if (error || !data) {
      // Fail open: allow request if rate-limit check itself fails
      return { allowed: true, remaining: 0, resetAt: new Date() };
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
  } catch {
    // Fail open: infrastructure failure must not block requests
    return { allowed: true, remaining: 0, resetAt: new Date() };
  }
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

/**
 * Enhanced rate limit check with burst detection and auto-blocking.
 *
 * Uses the `check_rate_limit_enhanced` PostgreSQL RPC which:
 *   - Performs the standard sliding-window check
 *   - Detects burst patterns (>2x limit in window)
 *   - Auto-blocks abusive identifiers for a cooling-off period
 *
 * Falls back to the standard `checkRateLimit` if the enhanced RPC
 * is unavailable (graceful degradation).
 *
 * @param supabase   A Supabase client (service_role) or compatible mock.
 * @param identifier The rate-limit subject — user ID or client IP.
 * @param config     The rate limit configuration for this endpoint.
 * @param burstLimit Optional burst threshold (default: 2x maxRequests).
 * @param blockSeconds How long to block on burst detection (default: 300s).
 * @returns The rate limit check result.
 */
export async function checkRateLimitEnhanced(
  supabase: RpcClient,
  identifier: string,
  config: RateLimitConfig,
  burstLimit?: number,
  blockSeconds: number = 300,
): Promise<RateLimitResult & { blocked?: boolean; blockReason?: string }> {
  const key = `${config.keyPrefix}:${identifier}`;

  try {
    const { data, error } = await supabase.rpc('check_rate_limit_enhanced', {
      p_key: key,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
      p_burst_limit: burstLimit ?? null,
      p_block_seconds: blockSeconds,
    });

    if (error || !data) {
      // Fall back to standard rate limiting
      return checkRateLimit(supabase, identifier, config);
    }

    const result = data as {
      allowed: boolean;
      remaining: number;
      reset_at: string;
      current_count: number;
      blocked: boolean;
      block_reason: string | null;
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
      blocked: result.blocked,
      blockReason: result.block_reason ?? undefined,
    };
  } catch {
    // Fall back to standard rate limiting
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
