// SPDX-License-Identifier: BUSL-1.1

/**
 * POST /api/auth/refresh — exchange the HttpOnly refresh cookie for a
 * fresh access token (#1886).
 *
 * The function reads `finance_refresh` from the incoming `Cookie` header,
 * exchanges it with Supabase Cloud's `/auth/v1/token?grant_type=refresh_token`
 * endpoint, then writes the rotated refresh token back into a new
 * `finance_refresh` cookie and returns the access token in the body.
 *
 * Only refresh-token failures Supabase identifies as permanent clear the
 * cookie. Transient or ambiguous upstream failures preserve it for retry.
 *
 * Cache-Control: no-store is set on every response — bearer tokens must
 * never enter Cache Storage.
 */

import { validateEnv } from '../_shared/env.ts';
import {
  COOKIE_REFRESH,
  buildClearCookie,
  buildSetCookie,
  parseCookies,
} from '../_shared/cookie.ts';
import {
  refreshGrantWithClassification,
  type SupabaseAuthError,
} from '../_shared/supabase-auth.ts';

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

export const handler = async (req: Request): Promise<Response> => {
  const envError = validateEnv('auth-refresh', req);
  if (envError) return envError;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
    });
  }

  const cookies = parseCookies(req);
  const refreshToken = cookies[COOKIE_REFRESH];
  if (!refreshToken) {
    return unauthorized(req);
  }

  const result = await refreshGrantWithClassification(refreshToken);
  if (result.kind === 'invalid_refresh_token') {
    logRefreshFailure('warn', result.kind, result.error);
    return unauthorized(req);
  }
  if (result.kind === 'transient_error') {
    logRefreshFailure('warn', result.kind, result.error);
    return upstreamFailure(result.error);
  }
  if (result.kind === 'unknown_error') {
    logRefreshFailure('error', result.kind, result.error);
    return upstreamFailure(result.error);
  }

  const headers = new Headers(NO_STORE_HEADERS);
  headers.append(
    'Set-Cookie',
    buildSetCookie(req, COOKIE_REFRESH, result.tokens.refresh_token, {
      maxAgeSeconds: 60 * 60 * 24 * 60,
    }),
  );
  return new Response(
    JSON.stringify({
      access_token: result.tokens.access_token,
      expires_in: result.tokens.expires_in,
    }),
    { status: 200, headers },
  );
};

if (import.meta.main) Deno.serve(handler);

function unauthorized(req: Request): Response {
  const headers = new Headers(NO_STORE_HEADERS);
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_REFRESH));
  return new Response(JSON.stringify({ error: 'Session expired' }), {
    status: 401,
    headers,
  });
}

function upstreamFailure(error: SupabaseAuthError): Response {
  const status =
    error.status === 429 || error.status === 408 || error.status === undefined ? 503 : 502;
  const headers = new Headers(NO_STORE_HEADERS);
  if (status === 503) headers.set('Retry-After', '30');
  return new Response(JSON.stringify({ error: 'Authentication service temporarily unavailable' }), {
    status,
    headers,
  });
}

function logRefreshFailure(
  level: 'warn' | 'error',
  kind: 'invalid_refresh_token' | 'transient_error' | 'unknown_error',
  error: SupabaseAuthError,
): void {
  console[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message: 'Supabase refresh grant failed',
      function: 'auth-refresh',
      kind,
      upstream_status: error.status,
      upstream_code: error.code,
      upstream_error: error.error,
      upstream_message: error.message,
    }),
  );
}
