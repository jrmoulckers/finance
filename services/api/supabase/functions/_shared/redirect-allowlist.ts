// SPDX-License-Identifier: BUSL-1.1

/**
 * Allowlist of valid `redirect_to` targets passed through the OAuth
 * start endpoint and read back during the callback (#1886).
 *
 * The redirect target is reflected into a top-level browser navigation,
 * so unbounded values would create an open-redirect vulnerability. We
 * accept only relative paths matching a known-safe list.
 *
 * Absolute URLs, protocol-relative URLs (`//evil.com`), and paths not
 * on the allowlist are rejected by callers.
 *
 * @module
 */

/** Relative paths the OAuth callback may redirect the browser to. */
const ALLOWED_RELATIVE_PATHS: readonly string[] = ['/dashboard', '/', '/onboarding'];

/** Default destination when no `redirect_to` query parameter is present. */
export const DEFAULT_POST_LOGIN_PATH = '/dashboard';

/**
 * Validate a candidate redirect path.
 *
 * @returns The path itself when it is on the allowlist, or null when the
 *          input is missing, malformed, or not allowed. Never throws.
 */
export function validateRedirectTo(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  // Reject any value that looks like an absolute or protocol-relative URL,
  // including encoded variants.
  if (candidate.length === 0 || candidate.length > 256) return null;
  if (candidate.startsWith('//')) return null;
  if (candidate.startsWith('/\\') || candidate.includes('://')) return null;
  if (!candidate.startsWith('/')) return null;
  return ALLOWED_RELATIVE_PATHS.includes(candidate) ? candidate : null;
}
