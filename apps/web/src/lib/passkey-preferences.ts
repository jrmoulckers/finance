// SPDX-License-Identifier: BUSL-1.1

/**
 * Passkey Preference Tracking (#1445)
 *
 * Manages localStorage-based state for the passkey setup prompt:
 *   - Whether to show, remind later, or skip the prompt
 *   - Login count tracking for "remind me later" logic
 *   - Whether the user has a registered passkey
 *
 * All data is stored in localStorage — no server round-trips needed.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_PROMPT_STATE = 'finance:passkey-prompt-state';
const STORAGE_KEY_LOGIN_COUNT = 'finance:passkey-login-count';
const STORAGE_KEY_HAS_PASSKEY = 'finance:has-registered-passkey';

/** Number of logins before re-prompting after "Remind Me Later". */
const REMIND_AFTER_LOGINS = 3;

// ---------------------------------------------------------------------------
// Prompt State
// ---------------------------------------------------------------------------

/** Possible states for the passkey setup prompt. */
export type PasskeyPromptState = 'show' | 'remind' | 'skipped';

/**
 * Get the current passkey prompt state.
 *
 * - `'show'` — prompt should be displayed (default for new users)
 * - `'remind'` — user chose "Remind Me Later"; re-prompt after 3 logins
 * - `'skipped'` — user chose "Skip"; never prompt again
 *
 * @returns The current prompt state.
 */
export function getPasskeyPromptState(): PasskeyPromptState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PROMPT_STATE);
    if (stored === 'remind' || stored === 'skipped') {
      return stored;
    }
  } catch {
    // localStorage unavailable — default to show
  }
  return 'show';
}

/**
 * Set the passkey prompt state.
 *
 * When set to `'remind'`, the login counter is reset so the prompt
 * re-appears after {@link REMIND_AFTER_LOGINS} additional logins.
 *
 * @param state - The new prompt state.
 */
export function setPasskeyPromptState(state: 'remind' | 'skipped'): void {
  try {
    localStorage.setItem(STORAGE_KEY_PROMPT_STATE, state);
    if (state === 'remind') {
      // Reset login counter when user chooses "Remind Me Later"
      localStorage.setItem(STORAGE_KEY_LOGIN_COUNT, '0');
    }
  } catch {
    // localStorage unavailable — silently fail
  }
}

// ---------------------------------------------------------------------------
// Login Count
// ---------------------------------------------------------------------------

/**
 * Increment the login count and return the new value.
 *
 * Used to track how many logins have occurred since the user chose
 * "Remind Me Later". When the count reaches {@link REMIND_AFTER_LOGINS},
 * the prompt state should be checked again.
 *
 * @returns The updated login count.
 */
export function incrementLoginCount(): number {
  try {
    const current = parseInt(localStorage.getItem(STORAGE_KEY_LOGIN_COUNT) ?? '0', 10);
    const next = (isNaN(current) ? 0 : current) + 1;
    localStorage.setItem(STORAGE_KEY_LOGIN_COUNT, String(next));
    return next;
  } catch {
    return 0;
  }
}

/**
 * Get the current login count without incrementing.
 *
 * @returns The current login count.
 */
export function getLoginCount(): number {
  try {
    const value = parseInt(localStorage.getItem(STORAGE_KEY_LOGIN_COUNT) ?? '0', 10);
    return isNaN(value) ? 0 : value;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Passkey Registration Flag
// ---------------------------------------------------------------------------

/**
 * Check whether the user has a registered passkey (localStorage flag).
 *
 * This is a client-side cache — the server is the source of truth, but
 * this avoids a network call on every page load.
 *
 * @returns `true` if the user has previously registered a passkey.
 */
export function hasRegisteredPasskey(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_HAS_PASSKEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark that the user has successfully registered a passkey.
 */
export function setHasRegisteredPasskey(): void {
  try {
    localStorage.setItem(STORAGE_KEY_HAS_PASSKEY, 'true');
  } catch {
    // localStorage unavailable — silently fail
  }
}

// ---------------------------------------------------------------------------
// Derived Logic
// ---------------------------------------------------------------------------

/**
 * Determine whether the passkey setup prompt should be shown right now.
 *
 * The prompt is shown when:
 *   1. The user hasn't already registered a passkey.
 *   2. The prompt state is `'show'`, OR the state is `'remind'` and
 *      the login count has reached the threshold.
 *   3. The prompt state is NOT `'skipped'`.
 *
 * @returns `true` if the prompt should be displayed.
 */
export function shouldShowPasskeyPrompt(): boolean {
  if (hasRegisteredPasskey()) {
    return false;
  }

  const state = getPasskeyPromptState();

  if (state === 'skipped') {
    return false;
  }

  if (state === 'remind') {
    return getLoginCount() >= REMIND_AFTER_LOGINS;
  }

  // state === 'show'
  return true;
}

/**
 * Clear all passkey preference data from localStorage.
 * Useful for logout / account deletion.
 */
export function clearPasskeyPreferences(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_PROMPT_STATE);
    localStorage.removeItem(STORAGE_KEY_LOGIN_COUNT);
    localStorage.removeItem(STORAGE_KEY_HAS_PASSKEY);
  } catch {
    // localStorage unavailable — silently fail
  }
}
