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
// IP extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract the client IP address from request headers (best-effort).
 *
 * Checks `X-Forwarded-For` (first entry) and `X-Real-IP` in that order.
 * Returns `null` if neither header is present.
 *
 * @param req The incoming request.
 * @returns The client IP string, or null if unavailable.
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim() || null;
  }
  return req.headers.get('x-real-ip') || null;
}
