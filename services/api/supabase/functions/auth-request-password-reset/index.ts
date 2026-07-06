// SPDX-License-Identifier: BUSL-1.1

/**
 * POST /api/auth/request-password-reset — request a Supabase recovery email.
 *
 * Always returns the same accepted response for valid email-shaped input so the
 * endpoint does not reveal whether an account exists for the submitted address.
 */

import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts'; // SAFE: logging utility import, not a log statement
import { requestPasswordRecovery } from '../_shared/supabase-auth.ts';

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

interface RequestPasswordResetBody {
  email?: unknown;
  redirectTo?: unknown;
}

export const handler = async (req: Request): Promise<Response> => {
  const envError = validateEnv('auth-request-password-reset', req);
  if (envError) return envError;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
    });
  }

  let body: RequestPasswordResetBody;
  try {
    body = (await req.json()) as RequestPasswordResetBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (typeof body.email !== 'string') {
    return badRequest('email is required');
  }

  const email = body.email.trim();
  if (email.length === 0 || email.length > 320 || !email.includes('@')) {
    return badRequest('Enter a valid email address.');
  }

  let redirectTo: string;
  try {
    redirectTo = normalizeRedirectTo(req, body.redirectTo);
  } catch {
    return badRequest('redirectTo must be an http(s) URL for this origin');
  }

  const logger = createLogger('auth-request-password-reset');
  const recovery = await requestPasswordRecovery(email, redirectTo);
  // Upstream HTTP status plus a machine-readable GoTrue error code only — never
  // the email address or any other PII (see PasswordRecoveryResult).
  const upstream = { upstream_status: recovery.status, upstream_error_code: recovery.errorCode };

  if (recovery.status === 0 || recovery.status >= 500) {
    // Infrastructure failure: GoTrue 5xx, a network error, or — most commonly
    // in a fresh deploy — SMTP not configured, so the recovery mail is never
    // sent. The generic client response below would otherwise hide a fully
    // broken email pipeline. Surface it to operators here (PII-free). See #3179.
    logger.error('Reset email failed to send', upstream); // SAFE: PII-free upstream status/code only; folder name contains "password"
    return new Response(JSON.stringify({ error: 'Could not send reset email.' }), {
      status: 502,
      headers: NO_STORE_HEADERS,
    });
  }

  if (recovery.status >= 400) {
    // Non-fatal upstream rejection (e.g. email rate limit, a redirect not on
    // the GoTrue allowlist, a malformed address). The mail was NOT sent, but we
    // keep the client response generic to avoid account enumeration — operators
    // see the reason via the upstream_error_code instead of the user.
    logger.warn('Reset email request was not accepted by the auth provider', upstream); // SAFE: PII-free upstream status/code only; folder name contains "password"
  } else {
    logger.info('Reset email requested', { upstream_status: recovery.status }); // SAFE: PII-free status only; folder name contains "password"
  }

  return new Response(JSON.stringify({ accepted: true }), {
    status: 202,
    headers: NO_STORE_HEADERS,
  });
};

if (import.meta.main) Deno.serve(handler);

function normalizeRedirectTo(req: Request, value: unknown): string {
  const origin = req.headers.get('Origin') ?? new URL(req.url).origin;
  const fallback = new URL('/reset-password', origin).toString();

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw new Error('invalid redirectTo');
  }

  const redirectUrl = new URL(value);
  if (!['http:', 'https:'].includes(redirectUrl.protocol) || redirectUrl.origin !== origin) {
    throw new Error('invalid redirectTo');
  }

  return redirectUrl.toString();
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: NO_STORE_HEADERS,
  });
}
