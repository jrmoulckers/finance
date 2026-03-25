// SPDX-License-Identifier: BUSL-1.1

/**
 * User-learned categorisation rules persisted in `localStorage`.
 *
 * When a user manually overrides a suggested category, the correction is
 * stored so that future transactions from the same merchant are categorised
 * correctly without further user action.
 *
 * Storage key: `finance-user-categorization-rules`
 *
 * @module lib/categorization/user-rules
 */

import { normaliseDescription } from './patterns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single user-learned rule persisted in localStorage. */
export interface UserRule {
  /** Normalised merchant description that triggered the learning. */
  readonly merchant: string;
  /** Category ID the user assigned. */
  readonly categoryId: string;
  /** ISO-8601 instant when the rule was learned / last updated. */
  readonly learnedAt: string;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finance-user-categorization-rules';

// ---------------------------------------------------------------------------
// Read / write helpers
// ---------------------------------------------------------------------------

/** Load all user rules from localStorage. Returns an empty array on error. */
export function loadUserRules(): UserRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Basic shape validation — skip malformed entries.
    return parsed.filter(
      (entry): entry is UserRule =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as UserRule).merchant === 'string' &&
        typeof (entry as UserRule).categoryId === 'string' &&
        typeof (entry as UserRule).learnedAt === 'string',
    );
  } catch {
    return [];
  }
}

/** Persist the full list of user rules to localStorage. */
export function saveUserRules(rules: UserRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Find a user rule for the given merchant description.
 *
 * Matching is done against the normalised form so that "Walmart" and
 * "  WALMART  " both resolve to the same rule.
 */
export function findUserRule(description: string): UserRule | null {
  const normalised = normaliseDescription(description);
  const rules = loadUserRules();
  return (
    rules.find((r) => normalised.includes(r.merchant) || r.merchant.includes(normalised)) ?? null
  );
}

// ---------------------------------------------------------------------------
// Learn / forget
// ---------------------------------------------------------------------------

/**
 * Record a user correction: the given merchant maps to `categoryId`.
 *
 * If a rule already exists for the normalised merchant, it is updated in
 * place (preserving array order). Otherwise a new rule is appended.
 */
export function learnFromCorrection(merchantName: string, categoryId: string): void {
  const normalised = normaliseDescription(merchantName);
  if (!normalised) return;

  const rules = loadUserRules();
  const existingIndex = rules.findIndex((r) => r.merchant === normalised);

  const newRule: UserRule = {
    merchant: normalised,
    categoryId,
    learnedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    rules[existingIndex] = newRule;
  } else {
    rules.push(newRule);
  }

  saveUserRules(rules);
}

/** Remove all user-learned rules from localStorage. */
export function clearLearnedRules(): void {
  localStorage.removeItem(STORAGE_KEY);
}
