// SPDX-License-Identifier: BUSL-1.1

/**
 * GET /api/auth/oauth-start?provider=google&redirect_to=/dashboard
 *
 * Step 1 of the PKCE OAuth flow (#1886).
 *
 * Generates a fresh PKCE verifier + state nonce, stashes them in
 * short-lived HttpOnly cookies, then redirects the browser to Supabase
 * Cloud's `/auth/v1/authorize` with the matching `code_challenge` +
 * `state` query parameters. The user lands on the provider (Google,
 * GitHub, Apple) and is returned to {@link auth-oauth-callback}.
 *
 * The `redirect_to` query parameter is validated against a strict
 * allowlist to prevent open-redirect via the post-login navigation.
 */

import { requireEnv, validateEnv } from '../_shared/env.ts';
import { COOKIE_PKCE, COOKIE_POST_LOGIN, buildSetCookie } from '../_shared/cookie.ts';
import {
  buildAuthorizeUrl,
  fetchProviderEnabled,
  generatePkceMaterial,
  isSupportedProvider,
} from '../_shared/supabase-auth.ts';
import { DEFAULT_POST_LOGIN_PATH, validateRedirectTo } from '../_shared/redirect-allowlist.ts';

const NO_STORE: HeadersInit = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

export const handler = async (req: Request): Promise<Response> => {
  const envError = validateEnv('auth-oauth-start', req);
  if (envError) return envError;

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...NO_STORE, 'Content-Type': 'application/json', Allow: 'GET' },
    });
  }

  const url = new URL(req.url);
  const provider = url.searchParams.get('provider') ?? '';
  if (!isSupportedProvider(provider)) {
    return new Response(JSON.stringify({ error: 'Unsupported provider' }), {
      status: 400,
      headers: { ...NO_STORE, 'Content-Type': 'application/json' },
    });
  }

  // Statically supported ≠ actually enabled on GoTrue. Verify the provider is
  // enabled BEFORE issuing a 302 — otherwise the browser follows the redirect
  // to GoTrue's `/authorize` and lands on a raw "provider is not enabled" JSON
  // page (#3188). A disabled provider answers 400 (the SPA shows the graceful
  // in-app "that option is unavailable" message); an unreadable settings
  // document answers 503 (the SPA shows the "temporarily unavailable" message).
  // Neither ever hard-redirects the user onto a raw page.
  const providerEnabled = await fetchProviderEnabled(provider);
  if (providerEnabled === 'disabled') {
    return new Response(JSON.stringify({ error: 'Provider not enabled' }), {
      status: 400,
      headers: { ...NO_STORE, 'Content-Type': 'application/json' },
    });
  }
  if (providerEnabled === 'unknown') {
    return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
      status: 503,
      headers: { ...NO_STORE, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  const candidateRedirect = url.searchParams.get('redirect_to');
  const postLoginPath = validateRedirectTo(candidateRedirect) ?? DEFAULT_POST_LOGIN_PATH;

  const pkce = await generatePkceMaterial();

  const callbackUrl = `${requireEnv('OAUTH_REDIRECT_BASE')}/api/auth/oauth-callback`;
  const authorizeUrl = buildAuthorizeUrl(provider, pkce, callbackUrl);

  const headers = new Headers({ ...NO_STORE, Location: authorizeUrl });
  headers.append(
    'Set-Cookie',
    buildSetCookie(req, COOKIE_PKCE, pkce.codeVerifier, { maxAgeSeconds: 300 }),
  );
  headers.append(
    'Set-Cookie',
    buildSetCookie(req, COOKIE_POST_LOGIN, postLoginPath, { maxAgeSeconds: 300 }),
  );
  return new Response(null, { status: 302, headers });
};

if (import.meta.main) Deno.serve(handler);
