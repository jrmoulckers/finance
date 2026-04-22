// SPDX-License-Identifier: BUSL-1.1

/**
 * Environment variable validation for Edge Functions (#616).
 *
 * Validates that all required env vars are present and well-formed at
 * function startup. Returns a structured 503 response if any are
 * missing or malformed, WITHOUT revealing which variables failed.
 *
 * Type constraints:
 *   - 'url'    — must start with http:// or https://
 *   - 'csv'    — must contain at least one non-empty value
 *   - 'string' — must be a non-empty string (default)
 */

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** Supported env var type constraints. */
type EnvVarType = 'string' | 'url' | 'csv';

/** Declaration of a required env var with an optional type constraint. */
interface EnvVarSpec {
  name: string;
  type: EnvVarType;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Standard env vars required by all Edge Functions. */
const BASE_ENV_VARS: readonly EnvVarSpec[] = [
  { name: 'SUPABASE_URL', type: 'url' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', type: 'string' },
] as const;

/** Per-function additional required env vars. */
const FUNCTION_ENV_VARS: Record<string, readonly EnvVarSpec[]> = {
  'auth-webhook': [{ name: 'AUTH_WEBHOOK_SECRET', type: 'string' }],
  'passkey-register': [
    { name: 'WEBAUTHN_RP_NAME', type: 'string' },
    { name: 'WEBAUTHN_RP_ID', type: 'string' },
    { name: 'WEBAUTHN_ORIGIN', type: 'url' },
  ],
  'passkey-authenticate': [
    { name: 'WEBAUTHN_RP_ID', type: 'string' },
    { name: 'WEBAUTHN_ORIGIN', type: 'url' },
  ],
  'health-check': [],
  'household-invite': [],
  'data-export': [{ name: 'ALLOWED_ORIGINS', type: 'csv' }],
  'account-deletion': [],
  'sync-health-report': [{ name: 'ALLOWED_ORIGINS', type: 'csv' }],
  'process-recurring': [{ name: 'CRON_SECRET', type: 'string' }],
  'manage-webhooks': [{ name: 'ALLOWED_ORIGINS', type: 'csv' }],
  'admin-dashboard': [{ name: 'ADMIN_EMAILS', type: 'csv' }],
  'send-notification': [{ name: 'ALLOWED_ORIGINS', type: 'csv' }],
  'launch-readiness': [{ name: 'ADMIN_EMAILS', type: 'csv' }],
  'spending-forecast': [{ name: 'ALLOWED_ORIGINS', type: 'csv' }],
  'bank-connection': [
    { name: 'ALLOWED_ORIGINS', type: 'csv' },
    { name: 'BANK_ENCRYPTION_KEY', type: 'string' },
  ],
  'bank-webhook': [
    { name: 'PLAID_WEBHOOK_SECRET', type: 'string' },
    { name: 'MX_WEBHOOK_SECRET', type: 'string' },
  ],
};

// ---------------------------------------------------------------------------
// Type validators
// ---------------------------------------------------------------------------

/** URL pattern: must start with http:// or https:// */
const URL_PATTERN = /^https?:\/\/.+/;

/**
 * Check whether a value satisfies the given type constraint.
 *
 * @returns true if the value is valid for the type, false otherwise.
 */
function isValidType(value: string, type: EnvVarType): boolean {
  switch (type) {
    case 'url':
      return URL_PATTERN.test(value);
    case 'csv':
      return value.split(',').some((v) => v.trim().length > 0);
    case 'string':
    default:
      return value.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate that all required environment variables are set and well-formed.
 *
 * Returns null if valid, or a 503 Response if any are missing/malformed.
 * The response NEVER reveals which variables failed — only the count is
 * logged server-side for operators.
 */
export function validateEnv(functionName: string, _request: Request): Response | null {
  const specs = [...BASE_ENV_VARS, ...(FUNCTION_ENV_VARS[functionName] ?? [])];

  let invalidCount = 0;
  for (const spec of specs) {
    const value = Deno.env.get(spec.name);
    if (!value || !isValidType(value, spec.type)) {
      invalidCount++;
    }
  }

  if (invalidCount > 0) {
    // Log internally (for operators) but never reveal to client
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Missing or invalid environment variables',
        function: functionName,
        invalid_count: invalidCount,
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
