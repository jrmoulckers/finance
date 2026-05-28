// SPDX-License-Identifier: BUSL-1.1

/**
 * GET /api/auth/oauth-callback?code=...
 *
 * Step 2 of the PKCE OAuth flow (#1886).
 *
 * Reads the PKCE verifier from the HttpOnly cookie set by
 * {@link auth-oauth-start}, exchanges the authorization code + verifier
 * for a Supabase session, sets the HttpOnly `finance_refresh` cookie,
 * clears the PKCE / post-login cookies, and redirects the browser to
 * the previously validated post-login path.
 *
 * CSRF protection comes from the PKCE verifier itself: only the browser
 * that initiated the flow has the verifier cookie, so only that browser
 * can complete the token exchange. We do not validate `state` because
 * Supabase Cloud owns the state value end-to-end (passing our own state
 * causes Supabase to reject the flow as `bad_oauth_state`).
 *
 * On any failure the user is redirected back to `/login?error=oauth_*`
 * so the UI can show a generic message.
 */

import { requireEnv, validateEnv } from '../_shared/env.ts';
import {
  COOKIE_PKCE,
  COOKIE_POST_LOGIN,
  COOKIE_REFRESH,
  buildClearCookie,
  buildSetCookie,
  parseCookies,
} from '../_shared/cookie.ts';
import { pkceGrant } from '../_shared/supabase-auth.ts';
import { DEFAULT_POST_LOGIN_PATH, validateRedirectTo } from '../_shared/redirect-allowlist.ts';

const NO_STORE: HeadersInit = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

export const handler = async (req: Request): Promise<Response> => {
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
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return redirectToError(req, 'oauth_provider_error');
  }
  if (!code) {
    return redirectToError(req, 'oauth_invalid_response');
  }

  const cookies = parseCookies(req);
  const verifier = cookies[COOKIE_PKCE];
  if (!verifier) {
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
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_POST_LOGIN));
  return new Response(null, { status: 302, headers });
};

if (import.meta.main) Deno.serve(handler);

function redirectToError(req: Request, reason: string): Response {
  const base = Deno.env.get('OAUTH_REDIRECT_BASE') ?? '';
  const target = `${base}/login?error=${encodeURIComponent(reason)}`;
  const headers = new Headers({ ...NO_STORE, Location: target });
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_PKCE));
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_POST_LOGIN));
  return new Response(null, { status: 302, headers });
}
