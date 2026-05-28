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
 * On any failure the existing cookie is cleared and a 401 is returned;
 * the web client treats 401 as session-expired.
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
import { refreshGrant } from '../_shared/supabase-auth.ts';

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

Deno.serve(async (req) => {
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

  const tokens = await refreshGrant(refreshToken);
  if (!tokens) {
    return unauthorized(req);
  }

  const headers = new Headers(NO_STORE_HEADERS);
  headers.append(
    'Set-Cookie',
    buildSetCookie(req, COOKIE_REFRESH, tokens.refresh_token, {
      maxAgeSeconds: 60 * 60 * 24 * 60,
    }),
  );
  return new Response(
    JSON.stringify({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    }),
    { status: 200, headers },
  );
});

function unauthorized(req: Request): Response {
  const headers = new Headers(NO_STORE_HEADERS);
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_REFRESH));
  return new Response(JSON.stringify({ error: 'Session expired' }), {
    status: 401,
    headers,
  });
}
