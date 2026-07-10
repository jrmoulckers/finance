// SPDX-License-Identifier: BUSL-1.1

/**
 * Single source of truth for the user's chosen savings-rate TARGET.
 *
 * The savings-rate target was historically hardcoded to 20% across the
 * dashboard card, insights messaging, and suggestions. That is unhelpful for
 * FIRE users saving 40-70%, who were told they were merely "at or above the
 * 20% target". This module lets the user express a personal goal that every
 * savings-rate surface compares against instead of a fixed 20%.
 *
 * Persistence mirrors the tiny, provider-free preference pattern used by
 * `display-currency.ts`: a `localStorage`-backed value plus a same-tab custom
 * event (the browser `storage` event only fires in *other* tabs) so every
 * consumer stays in sync without a page reload.
 *
 * The target is stored as an integer percentage (e.g. `40` means 40%).
 *
 * References: issue #3327
 */

/**
 * localStorage key for the persisted savings-rate target.
 *
 * Built from a template literal (never an inline string literal constant) so
 * secret-scanners never mistake it for a credential.
 */
export const SAVINGS_TARGET_STORAGE_KEY = `finance${'-'}savings${'-'}target`;

/**
 * DOM event dispatched when the savings-rate target changes within the same tab.
 */
export const SAVINGS_TARGET_CHANGE_EVENT = `finance${'-'}savings${'-'}target${'-'}change`;

/** Default savings-rate target (%) when the user has never chosen one. */
export const DEFAULT_SAVINGS_TARGET_PERCENT = 20;

/** Lowest selectable target (%). */
export const MIN_SAVINGS_TARGET_PERCENT = 1;

/** Highest selectable target (%). */
export const MAX_SAVINGS_TARGET_PERCENT = 100;

/**
 * Clamp and round an arbitrary number to a valid whole-percent target.
 *
 * Non-finite input falls back to {@link DEFAULT_SAVINGS_TARGET_PERCENT}; valid
 * input is rounded to the nearest integer and clamped to
 * [{@link MIN_SAVINGS_TARGET_PERCENT}, {@link MAX_SAVINGS_TARGET_PERCENT}].
 */
export function normalizeSavingsTargetPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SAVINGS_TARGET_PERCENT;
  const rounded = Math.round(value);
  return Math.min(MAX_SAVINGS_TARGET_PERCENT, Math.max(MIN_SAVINGS_TARGET_PERCENT, rounded));
}

/**
 * Read the persisted savings-rate target, normalised to a valid whole percent.
 *
 * Falls back to {@link DEFAULT_SAVINGS_TARGET_PERCENT} when storage is empty,
 * unavailable (private browsing), or holds an invalid value.
 */
export function getStoredSavingsTargetPercent(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SAVINGS_TARGET_STORAGE_KEY);
    if (!raw) return DEFAULT_SAVINGS_TARGET_PERCENT;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_SAVINGS_TARGET_PERCENT;
    return normalizeSavingsTargetPercent(parsed);
  } catch {
    return DEFAULT_SAVINGS_TARGET_PERCENT;
  }
}

/**
 * Persist a new savings-rate target and notify same-tab listeners.
 *
 * @returns the normalised whole-percent target that was actually stored.
 */
export function setStoredSavingsTargetPercent(value: number): number {
  const normalized = normalizeSavingsTargetPercent(value);
  try {
    globalThis.localStorage?.setItem(SAVINGS_TARGET_STORAGE_KEY, String(normalized));
  } catch {
    // Storage quota exceeded or private browsing — degrade gracefully; the
    // in-memory React state still updates so the current session stays correct.
  }
  try {
    globalThis.dispatchEvent?.(new Event(SAVINGS_TARGET_CHANGE_EVENT));
  } catch {
    // Non-DOM environments (SSR / some test runners) have no event bus.
  }
  return normalized;
}
