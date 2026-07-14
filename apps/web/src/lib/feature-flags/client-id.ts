// SPDX-License-Identifier: BUSL-1.1

/**
 * Stable per-install client identifier for rollout bucketing (#3875).
 *
 * Rollout percentages are evaluated deterministically against a stable id (see
 * {@link ../feature-flags/rollout}). The web runtime evaluates flags both before
 * authentication (at bootstrap, to gate the live aggregator layer) and inside
 * authenticated components, so it standardizes on a persisted per-install id
 * rather than the auth user id. This keeps a single install's flag results
 * consistent across the session and avoids a user flipping buckets when they log
 * in. When server-synced, per-user flag evaluation lands, bucketing moves
 * server-side keyed on the user id.
 *
 * @module lib/feature-flags/client-id
 */

/** localStorage key holding the persisted install id. */
export const CLIENT_ID_STORAGE_KEY = 'finance.feature-flags.client-id';

/** Fallback id used when `localStorage`/`crypto` are unavailable. */
const FALLBACK_CLIENT_ID = 'anonymous';

function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the non-crypto path */
  }
  // Non-cryptographic fallback — bucketing only needs stability, not secrecy.
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Return a stable per-install client id, creating and persisting one on first
 * use. Degrades to a constant when storage is unavailable (e.g. SSR/tests with
 * no DOM), which still yields deterministic — if shared — bucketing.
 *
 * @returns The persisted (or fallback) client id.
 */
export function getStableClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = generateId();
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return FALLBACK_CLIENT_ID;
  }
}
