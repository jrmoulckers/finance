// SPDX-License-Identifier: BUSL-1.1

/**
 * CORS headers helper for Supabase Edge Functions (#98, #353).
 *
 * Provides consistent, origin-validated CORS configuration across all
 * Edge Functions. Allowed origins are read from the ALLOWED_ORIGINS
 * environment variable (comma-separated).
 *
 * Security (P-1 fix): Never uses wildcard '*'. Only explicitly allowed
 * origins receive a valid Access-Control-Allow-Origin header.
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
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
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
