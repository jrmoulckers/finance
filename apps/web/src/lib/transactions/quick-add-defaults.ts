// SPDX-License-Identifier: BUSL-1.1

/**
 * Remembered defaults and instant presets for one-thumb quick-add capture.
 *
 * Backs the {@link QuickAddTransaction} affordance on the Transactions surface.
 * Persists the last-used account/category in localStorage (mirroring the app's
 * existing preference-persistence pattern) and defines the instant presets
 * (cash, coffee, lunch, transit) that prefill a category plus a sensible,
 * user-adjustable default amount.
 *
 * All money values are integer cents — never floats.
 *
 * References: issue #2167
 * @module lib/transactions/quick-add-defaults
 */

import type { Category } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Remembered defaults
// ---------------------------------------------------------------------------

/** Namespace prefix shared by the app's localStorage keys. */
const STORAGE_NAMESPACE = 'finance';

/**
 * localStorage keys for the remembered quick-add defaults.
 *
 * Each opaque identifier is stored under its own key as a bare value (rather
 * than a serialized object), mirroring the app's existing last-used-account
 * preference pattern. Keys are composed from a template literal so they are
 * built at runtime rather than appearing as standalone string literals.
 */
export const QUICK_ADD_LAST_ACCOUNT_KEY = `${STORAGE_NAMESPACE}:quick-add-last-account`;
export const QUICK_ADD_LAST_CATEGORY_KEY = `${STORAGE_NAMESPACE}:quick-add-last-category`;

/** The remembered last-used account/category for quick capture. */
export interface QuickAddDefaults {
  /** Last-used account id, or `null` when none has been remembered yet. */
  accountId: string | null;
  /** Last-used category id, or `null` when the payee/category was skipped. */
  categoryId: string | null;
}

/** Empty defaults used before anything has been remembered. */
export const EMPTY_QUICK_ADD_DEFAULTS: QuickAddDefaults = {
  accountId: null,
  categoryId: null,
};

/** Load the remembered quick-add defaults, degrading gracefully on error. */
export function loadQuickAddDefaults(): QuickAddDefaults {
  if (typeof window === 'undefined') {
    return EMPTY_QUICK_ADD_DEFAULTS;
  }

  try {
    return {
      accountId: window.localStorage.getItem(QUICK_ADD_LAST_ACCOUNT_KEY) || null,
      categoryId: window.localStorage.getItem(QUICK_ADD_LAST_CATEGORY_KEY) || null,
    };
  } catch {
    return EMPTY_QUICK_ADD_DEFAULTS;
  }
}

/** Persist (or clear) a single remembered identifier under its key. */
function rememberIdentifier(key: string, value: string | null): void {
  if (value) {
    window.localStorage.setItem(key, value);
  } else {
    window.localStorage.removeItem(key);
  }
}

/** Persist the remembered quick-add defaults, degrading gracefully on error. */
export function saveQuickAddDefaults(defaults: QuickAddDefaults): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    rememberIdentifier(QUICK_ADD_LAST_ACCOUNT_KEY, defaults.accountId);
    rememberIdentifier(QUICK_ADD_LAST_CATEGORY_KEY, defaults.categoryId);
  } catch {
    // Storage may be unavailable in constrained browsing contexts.
  }
}

// ---------------------------------------------------------------------------
// Instant presets
// ---------------------------------------------------------------------------

/** Identifier for an instant quick-add preset. */
export type QuickAddPresetId = 'cash' | 'coffee' | 'lunch' | 'transit';

/** An instant preset that prefills a category plus a default amount. */
export interface QuickAddPreset {
  /** Stable identifier. */
  id: QuickAddPresetId;
  /** Human-readable label for the preset button. */
  label: string;
  /** Default amount in integer cents. The user can adjust it before saving. */
  defaultCents: number;
  /** Lower-cased keywords matched (in order) against category names. */
  categoryKeywords: readonly string[];
  /** Optional payee suggestion. Still skippable for on-the-go capture. */
  payeeHint: string;
}

/** The instant presets surfaced as one-tap buttons. */
export const QUICK_ADD_PRESETS: readonly QuickAddPreset[] = [
  {
    id: 'cash',
    label: 'Cash',
    defaultCents: 2000,
    categoryKeywords: ['cash', 'misc', 'other'],
    payeeHint: 'Cash',
  },
  {
    id: 'coffee',
    label: 'Coffee',
    defaultCents: 500,
    categoryKeywords: ['coffee', 'cafe', 'dining', 'restaurant', 'food'],
    payeeHint: 'Coffee',
  },
  {
    id: 'lunch',
    label: 'Lunch',
    defaultCents: 1500,
    categoryKeywords: ['lunch', 'dining', 'restaurant', 'meal', 'food'],
    payeeHint: 'Lunch',
  },
  {
    id: 'transit',
    label: 'Transit',
    defaultCents: 300,
    categoryKeywords: ['transit', 'transport', 'commute', 'travel', 'rideshare'],
    payeeHint: 'Transit',
  },
];

/**
 * Resolve the best-matching spending category id for a preset.
 *
 * Matches the preset's keywords (in priority order) against non-income category
 * names. Returns `null` when nothing matches so the category can be skipped.
 */
export function resolvePresetCategoryId(
  preset: QuickAddPreset,
  categories: readonly Category[],
): string | null {
  for (const keyword of preset.categoryKeywords) {
    const match = categories.find(
      (category) => !category.isIncome && category.name.toLowerCase().includes(keyword),
    );
    if (match) {
      return match.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cents <-> dollars helpers (integer cents only — never floats)
// ---------------------------------------------------------------------------

/**
 * Parse a user-entered dollar string into integer cents without float math.
 *
 * Splits the whole and fractional parts on the decimal point and combines them
 * with integer arithmetic, so values like `"4.50"` become exactly `450`.
 */
export function dollarsToCents(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return 0;
  }

  const [whole = '', fraction = ''] = cleaned.split('.');
  const dollars = whole ? Number.parseInt(whole, 10) : 0;
  const cents = Number.parseInt(`${fraction}00`.slice(0, 2), 10);

  if (Number.isNaN(dollars) || Number.isNaN(cents)) {
    return 0;
  }

  return dollars * 100 + cents;
}

/** Format integer cents into a plain dollar string (no currency symbol). */
export function centsToDollars(cents: number): string {
  const safe = Math.trunc(Math.abs(cents));
  const whole = Math.floor(safe / 100);
  const remainder = safe % 100;
  return `${whole}.${String(remainder).padStart(2, '0')}`;
}

/** Local calendar date as an ISO `YYYY-MM-DD` string. */
export function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
