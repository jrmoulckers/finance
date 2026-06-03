// SPDX-License-Identifier: BUSL-1.1

/**
 * Display-name and invite-URL helpers for the Household feature.
 *
 * Resolves a household member to a human-readable label using the
 * fallback chain agreed on in issue #1931:
 *
 *   member.displayName  →  fallback profile name  →  fallback email
 *                       →  truncated user id  →  generic placeholder
 *
 * The raw UUID should *never* be shown to the user; it is a fail-safe
 * only used when we have literally no other identifier.
 *
 * References: issues #1931, #1932, #1933
 */

/** Minimal shape of an identifiable household participant. */
export interface MemberLike {
  /** Stored display name, if previously captured (e.g. from OAuth). */
  readonly displayName?: string | null;
  /** Raw user id (UUID). Last-resort identifier. */
  readonly userId?: string | null;
}

/** Optional auth-derived profile used as a secondary fallback. */
export interface ProfileFallback {
  /** OAuth name (Google `name`, etc.) or user-set full name. */
  readonly name?: string | null;
  /** Email address — always preferred over a raw UUID. */
  readonly email?: string | null;
}

/** A trimmed-and-normalised string, or `null` if not usable. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Truncate a UUID for last-resort display.
 *
 * Returns the first `length` characters followed by an ellipsis.
 * Returns `null` if the input is empty.
 */
export function truncateUserId(userId: string | null | undefined, length = 8): string | null {
  const cleaned = clean(userId);
  if (!cleaned) return null;
  if (cleaned.length <= length) return cleaned;
  return `${cleaned.slice(0, length)}…`;
}

/**
 * Resolve the best human-readable label for a household member.
 *
 * Priority order (issue #1931):
 *   1. `member.displayName` (already stored)
 *   2. `profile.name`       (OAuth full name)
 *   3. `profile.email`      (always-available identifier)
 *   4. truncated `userId`   (fail-safe, should rarely appear)
 *   5. `placeholder`        (final fallback, default "Unknown member")
 *
 * Whitespace-only values are treated as missing so we never render
 * an empty span.
 */
export function getMemberDisplayName(
  member: MemberLike,
  profile?: ProfileFallback | null,
  placeholder = 'Unknown member',
): string {
  return (
    clean(member.displayName) ??
    clean(profile?.name) ??
    clean(profile?.email) ??
    truncateUserId(member.userId) ??
    placeholder
  );
}

/**
 * Build the full shareable invite URL for an invitation code.
 *
 * The visible UI continues to render the bare code; this URL is what
 * gets copied to the clipboard so the recipient can click straight
 * through to the accept-invite page (issue #1933).
 *
 * @param code   Invitation code (bare token).
 * @param origin Origin to use (defaults to `window.location.origin`
 *               when available, else an empty string).
 */
export function buildInviteUrl(code: string, origin?: string): string {
  const safeCode = clean(code) ?? '';
  const safeOrigin =
    clean(origin) ??
    (typeof window !== 'undefined' && typeof window.location?.origin === 'string'
      ? window.location.origin
      : '');
  // Strip trailing slash from the origin so we don't end up with `//invite/...`.
  const normalisedOrigin = safeOrigin.replace(/\/+$/, '');
  return `${normalisedOrigin}/invite/${safeCode}`;
}
