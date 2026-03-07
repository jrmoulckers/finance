/**
 * CORS headers helper for Supabase Edge Functions (#98).
 *
 * Provides consistent CORS configuration across all Edge Functions.
 * In production, restrict origins to your actual domains.
 */

/**
 * Standard CORS headers allowing cross-origin requests.
 *
 * NOTE: In production, replace the wildcard origin with specific
 * allowed origins (e.g. "https://app.finance.example.com").
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/**
 * Handle CORS preflight (OPTIONS) requests.
 *
 * Call this at the top of every Edge Function handler:
 * ```ts
 * if (req.method === "OPTIONS") return handleCorsPreflightRequest();
 * ```
 */
export function handleCorsPreflightRequest(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
