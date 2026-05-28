// SPDX-License-Identifier: BUSL-1.1

/**
 * GET /api/auth/oauth-callback?code=...&state=...
 *
 * Step 2 of the PKCE OAuth flow (#1886).
 *
 * Validates the `state` parameter against the cookie set by
 * {@link auth-oauth-start}, exchanges the authorization code + PKCE
 * verifier for a Supabase session, sets the HttpOnly `finance_refresh`
 * cookie, clears the PKCE / state / post-login cookies, and redirects
 * the browser to the previously validated post-login path.
 *
 * On any failure the user is redirected back to `/login?error=oauth_*`
 * so the UI can show a generic message.
 */

import { requireEnv, validateEnv } from '../_shared/env.ts';
import {
  COOKIE_OAUTH_STATE,
  COOKIE_PKCE,
  COOKIE_POST_LOGIN,
  COOKIE_REFRESH,
  buildClearCookie,
  buildSetCookie,
  constantTimeEqual,
  parseCookies,
} from '../_shared/cookie.ts';
import { pkceGrant } from '../_shared/supabase-auth.ts';
import { DEFAULT_POST_LOGIN_PATH, validateRedirectTo } from '../_shared/redirect-allowlist.ts';

const NO_STORE: HeadersInit = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

Deno.serve(async (req) => {
  const envError = validateEnv('auth-oauth-callback', req);
  if (envError) return envError;

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...NO_STORE, 'Content-Type': 'application/json', Allow: 'GET' },
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return redirectToError(req, 'oauth_provider_error');
  }
  if (!code || !state) {
    return redirectToError(req, 'oauth_invalid_response');
  }

  const cookies = parseCookies(req);
  const verifier = cookies[COOKIE_PKCE];
  const expectedState = cookies[COOKIE_OAUTH_STATE];
  if (!verifier || !expectedState || !constantTimeEqual(state, expectedState)) {
    return redirectToError(req, 'oauth_state_mismatch');
  }

  const tokens = await pkceGrant(code, verifier);
  if (!tokens) {
    return redirectToError(req, 'oauth_exchange_failed');
  }

  const postLogin = validateRedirectTo(cookies[COOKIE_POST_LOGIN]) ?? DEFAULT_POST_LOGIN_PATH;
  const target = `${requireEnv('OAUTH_REDIRECT_BASE')}${postLogin}`;

  const headers = new Headers({ ...NO_STORE, Location: target });
  headers.append(
    'Set-Cookie',
    buildSetCookie(req, COOKIE_REFRESH, tokens.refresh_token, {
      maxAgeSeconds: 60 * 60 * 24 * 60,
    }),
  );
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_PKCE));
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_OAUTH_STATE));
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_POST_LOGIN));
  return new Response(null, { status: 302, headers });
});

function redirectToError(req: Request, reason: string): Response {
  const base = Deno.env.get('OAUTH_REDIRECT_BASE') ?? '';
  const target = `${base}/login?error=${encodeURIComponent(reason)}`;
  const headers = new Headers({ ...NO_STORE, Location: target });
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_PKCE));
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_OAUTH_STATE));
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_POST_LOGIN));
  return new Response(null, { status: 302, headers });
}
