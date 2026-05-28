// SPDX-License-Identifier: BUSL-1.1

/**
 * POST /api/auth/logout — end the session (#1886).
 *
 * Reads the `finance_refresh` cookie, asks Supabase to revoke it (best
 * effort — failures are swallowed), and writes a `Max-Age=0` cookie so
 * the browser drops its copy immediately. Always returns 204 so the
 * client always proceeds to its post-logout UI.
 */

import { validateEnv } from '../_shared/env.ts';
import {
  COOKIE_PKCE,
  COOKIE_POST_LOGIN,
  COOKIE_REFRESH,
  buildClearCookie,
  parseCookies,
} from '../_shared/cookie.ts';
import { refreshGrant, revokeRefreshToken } from '../_shared/supabase-auth.ts';

export const handler = async (req: Request): Promise<Response> => {
  const envError = validateEnv('auth-logout', req);
  if (envError) return envError;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  const cookies = parseCookies(req);
  const refreshToken = cookies[COOKIE_REFRESH];

  if (refreshToken) {
    const tokens = await refreshGrant(refreshToken);
    if (tokens) await revokeRefreshToken(tokens.access_token);
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_REFRESH));
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_PKCE));
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_POST_LOGIN));
  return new Response(null, { status: 204, headers });
};

if (import.meta.main) Deno.serve(handler);
