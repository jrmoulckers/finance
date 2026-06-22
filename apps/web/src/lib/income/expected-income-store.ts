// SPDX-License-Identifier: BUSL-1.1

/**
 * Local persistence for expected-income items.
 *
 * Mirrors the mileage-tracker pattern: items live in `localStorage` and a DOM
 * event is dispatched on change so any mounted view can refresh. This keeps the
 * expected-income surface self-contained and offline-first without touching the
 * primary SQLite data path.
 *
 * Refs #2193
 */

import {
  CONFIDENCE_LEVELS,
  type ConfidenceLevel,
  type ExpectedIncomeItem,
} from './expected-income';

const STORAGE_KEY = 'finance:expected-income';
export const EXPECTED_INCOME_CHANGED_EVENT = 'finance:expected-income-changed';

/** Fields a caller supplies when adding or editing an item. */
export interface ExpectedIncomeDraft {
  label: string;
  amountCents: number;
  expectedDate: string;
  confidence: ConfidenceLevel;
  cleared?: boolean;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `expected-income-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return typeof value === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

function notifyChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(EXPECTED_INCOME_CHANGED_EVENT));
}

function sanitizeDraft(
  draft: ExpectedIncomeDraft,
  existing?: ExpectedIncomeItem,
): ExpectedIncomeItem {
  const label = draft.label.trim();
  if (!label) {
    throw new Error('A label is required.');
  }

  const expectedDate = draft.expectedDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) {
    throw new Error('A valid expected date (YYYY-MM-DD) is required.');
  }

  if (!Number.isFinite(draft.amountCents) || draft.amountCents < 0) {
    throw new Error('Amount must be a non-negative number of cents.');
  }

  return {
    id: existing?.id ?? generateId(),
    label,
    amountCents: Math.round(draft.amountCents),
    expectedDate,
    confidence: isConfidenceLevel(draft.confidence) ? draft.confidence : 'medium',
    cleared: draft.cleared ?? existing?.cleared ?? false,
  };
}

function writeItems(items: ExpectedIncomeItem[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    notifyChanged();
  } catch {
    // Ignore storage failures in constrained / private-mode browsers.
  }
}

/** Read all persisted expected-income items, ignoring malformed entries. */
export function loadExpectedIncomeItems(): ExpectedIncomeItem[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is ExpectedIncomeItem => {
      return (
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ExpectedIncomeItem).id === 'string' &&
        typeof (entry as ExpectedIncomeItem).label === 'string' &&
        typeof (entry as ExpectedIncomeItem).amountCents === 'number' &&
        typeof (entry as ExpectedIncomeItem).expectedDate === 'string' &&
        isConfidenceLevel((entry as ExpectedIncomeItem).confidence) &&
        typeof (entry as ExpectedIncomeItem).cleared === 'boolean'
      );
    });
  } catch {
    return [];
  }
}

/** Add a new expected-income item and return it. */
export function createExpectedIncomeItem(draft: ExpectedIncomeDraft): ExpectedIncomeItem {
  const created = sanitizeDraft(draft);
  writeItems([created, ...loadExpectedIncomeItems()]);
  return created;
}

/** Toggle (or set) whether an item has cleared/been received. */
export function setExpectedIncomeCleared(id: string, cleared: boolean): boolean {
  const items = loadExpectedIncomeItems();
  let changed = false;
  const next = items.map((entry) => {
    if (entry.id === id) {
      changed = true;
      return { ...entry, cleared };
    }
    return entry;
  });
  if (changed) {
    writeItems(next);
  }
  return changed;
}

/** Delete an item by id. Returns `true` if an item was removed. */
export function deleteExpectedIncomeItem(id: string): boolean {
  const items = loadExpectedIncomeItems();
  const remaining = items.filter((entry) => entry.id !== id);
  if (remaining.length === items.length) {
    return false;
  }
  writeItems(remaining);
  return true;
}
