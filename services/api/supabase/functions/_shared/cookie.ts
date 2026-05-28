// SPDX-License-Identifier: BUSL-1.1

/**
 * Cookie helpers for auth Edge Functions (#1886).
 *
 * Centralises cookie semantics so every auth endpoint uses the same
 * attributes. All auth cookies share:
 *
 *   - HttpOnly       — never readable from JS, defence-in-depth against XSS.
 *   - SameSite=Lax   — required so the OAuth redirect back from Supabase
 *                      Cloud to localhost can still send the PKCE / state
 *                      cookies. `Strict` blocks cross-site top-level
 *                      navigations and would silently break the OAuth flow.
 *   - Secure         — set when the request is HTTPS. Localhost dev runs
 *                      over HTTP, where browsers permit insecure cookies.
 *   - Path=/api/auth — confines cookies to the auth surface only.
 *
 * The cookie value never reflects raw user input — only secrets we
 * generated (PKCE verifier, state nonce, post-login redirect target)
 * or tokens issued by Supabase.
 *
 * @module
 */

/** Names of the auth cookies set by these functions. */
export const COOKIE_REFRESH = 'finance_refresh';
export const COOKIE_PKCE = 'finance_pkce';
export const COOKIE_POST_LOGIN = 'finance_post_login';

/** Shared cookie path. Must match the route prefix exposed to the browser. */
export const COOKIE_PATH = '/api/auth';

/** Options for setting a cookie. */
export interface SetCookieOptions {
  /** Lifetime in seconds. Defaults to a short PKCE/state window (300 s). */
  maxAgeSeconds?: number;
  /** When true, override SameSite=Lax with SameSite=None (rarely needed). */
  sameSiteNone?: boolean;
  /** Path attribute (defaults to {@link COOKIE_PATH}). */
  path?: string;
}

/**
 * Build a `Set-Cookie` header value for the given name/value, applying
 * the standard auth-cookie attributes.
 *
 * @param request - Used to decide whether to add the `Secure` flag.
 * @param name    - Cookie name.
 * @param value   - Cookie value (raw, NOT URL-encoded — caller's responsibility
 *                  to ensure value is base64url or similar without `;` / `,`).
 */
export function buildSetCookie(
  request: Request,
  name: string,
  value: string,
  options: SetCookieOptions = {},
): string {
  const secure = isHttps(request);
  const sameSite = options.sameSiteNone ? 'None' : 'Lax';
  const path = options.path ?? COOKIE_PATH;
  const maxAge = options.maxAgeSeconds ?? 300;

  const parts = [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    `SameSite=${sameSite}`,
  ];
  if (secure || options.sameSiteNone) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Build a `Set-Cookie` header value that immediately expires the named
 * cookie. Browsers require Path/Domain to match the original cookie for
 * deletion to take effect, so we reuse the same Path.
 */
export function buildClearCookie(request: Request, name: string, path?: string): string {
  const secure = isHttps(request);
  const parts = [
    `${name}=`,
    `Path=${path ?? COOKIE_PATH}`,
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Parse the `Cookie` request header into a name → value map.
 *
 * Values are returned verbatim (no URL decoding). Duplicate cookie names
 * are resolved by last-write-wins, matching browser behaviour.
 */
export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie');
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name) result[name] = value;
  }
  return result;
}

/**
 * Constant-time comparison of two strings. Returns true iff the inputs
 * are identical in both length and content. Used for `state` validation
 * to prevent timing oracle attacks.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Determine whether the request was made over HTTPS. Considers
 * `X-Forwarded-Proto: https` to support functions running behind a
 * reverse proxy / load balancer (typical Edge runtime topology).
 */
export function isHttps(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  const xfp = request.headers.get('x-forwarded-proto');
  return xfp?.toLowerCase().includes('https') ?? false;
}
