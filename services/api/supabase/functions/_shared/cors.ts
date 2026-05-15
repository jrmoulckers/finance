// SPDX-License-Identifier: BUSL-1.1

/**
 * CORS headers helper for Supabase Edge Functions (#98, #353, #1325).
 *
 * Provides consistent, origin-validated CORS configuration across all
 * Edge Functions. Allowed origins are read from the ALLOWED_ORIGINS
 * environment variable (comma-separated).
 *
 * ## CORS Policy (Security Audit #1325)
 *
 * - **Origin validation**: Strict allowlist from `ALLOWED_ORIGINS` env var.
 *   Never uses wildcard `*`. Only explicitly listed origins receive a valid
 *   `Access-Control-Allow-Origin` header; all others get an empty value.
 *
 * - **Credentials**: `Access-Control-Allow-Credentials` is intentionally
 *   NOT set. This app uses Bearer tokens via the `Authorization` header
 *   (not cookies), so credential-mode CORS is unnecessary. This also
 *   prevents the browser from sending ambient credentials (cookies) to
 *   the API, reducing CSRF risk.
 *
 * - **Allowed headers**: `authorization`, `x-client-info`, `apikey`,
 *   `content-type`, `accept` — the minimum set needed by Supabase clients.
 *
 * - **Allowed methods**: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`.
 *
 * - **Preflight caching**: `Access-Control-Max-Age: 86400` (24 hours)
 *   reduces preflight round-trips for repeat requests.
 *
 * - **`Vary: Origin`**: Always included so CDNs and proxies do not serve
 *   a cached CORS response for origin A to a request from origin B.
 *
 * - **Exempt functions**: `auth-webhook` (server-to-server, no browser
 *   access) and `main` (internal edge-runtime health probe) intentionally
 *   do not use CORS headers.
 *
 * @module
 */

/** Parsed origin allowlist from environment. */
const ALLOWED_ORIGINS: string[] = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .filter(Boolean);

/**
 * Build CORS headers for a request, validating the Origin against the
 * allowlist.
 *
 * @param request The incoming request (used to read the Origin header).
 * @returns CORS headers — origin is only echoed back if it is in the allowlist.
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Handle CORS preflight (OPTIONS) requests.
 *
 * Call this at the top of every Edge Function handler:
 * ```ts
 * if (req.method === "OPTIONS") return handleCorsPreflightRequest(req);
 * ```
 */
export function handleCorsPreflightRequest(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}
