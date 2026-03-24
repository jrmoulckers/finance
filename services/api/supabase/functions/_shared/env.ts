// SPDX-License-Identifier: BUSL-1.1

/**
 * Environment variable validation for Edge Functions (#616).
 *
 * Validates that all required env vars are present at function
 * startup. Returns a structured 503 response if any are missing,
 * WITHOUT revealing which variables are absent.
 */

/** Standard env vars required by all authenticated Edge Functions. */
const BASE_ENV_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

/** Per-function additional required env vars. */
const FUNCTION_ENV_VARS: Record<string, readonly string[]> = {
  'auth-webhook': ['AUTH_WEBHOOK_SECRET'],
  'passkey-register': ['WEBAUTHN_RP_NAME', 'WEBAUTHN_RP_ID', 'WEBAUTHN_ORIGIN'],
  'passkey-authenticate': ['WEBAUTHN_RP_ID', 'WEBAUTHN_ORIGIN'],
  'health-check': [],
  'household-invite': [],
  'data-export': ['ALLOWED_ORIGINS'],
  'account-deletion': [],
  'sync-health-report': ['ALLOWED_ORIGINS'],
  'process-recurring': ['CRON_SECRET'],
  'manage-webhooks': ['ALLOWED_ORIGINS'],
  'admin-dashboard': ['ADMIN_EMAILS'],
  'send-notification': ['ALLOWED_ORIGINS'],
};

/**
 * Validate that all required environment variables are set.
 * Returns null if valid, or a 503 Response if any are missing.
 */
export function validateEnv(functionName: string, _request: Request): Response | null {
  const required = [...BASE_ENV_VARS, ...(FUNCTION_ENV_VARS[functionName] ?? [])];
  const missing = required.filter((v) => !Deno.env.get(v));

  if (missing.length > 0) {
    // Log internally (for operators) but never reveal to client
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Missing required environment variables',
        function: functionName,
        missing_count: missing.length,
      }),
    );

    return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
      },
    });
  }

  return null;
}

/**
 * Get a required env var. Throws if missing (use after validateEnv()).
 */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
