// SPDX-License-Identifier: BUSL-1.1

/**
 * Repository for recurring transaction rules.
 *
 * Stores rules as JSON in localStorage under the `recurring-rules` key.
 * This is a v1 approach — a future iteration will migrate storage to
 * SQLite-WASM with OPFS for consistency with other repositories.
 *
 * @module db/repositories/recurring-rules
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported recurrence frequencies. */
export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

/** Transaction type for recurring rules. */
export type RecurringTransactionType = 'EXPENSE' | 'INCOME';

/** A persisted recurring transaction rule. */
export interface RecurringRule {
  id: string;
  householdId: string;
  accountId: string;
  categoryId: string | null;
  description: string;
  amount: { amount: number }; // cents
  type: RecurringTransactionType;
  frequency: RecurringFrequency;
  startDate: string; // ISO local date YYYY-MM-DD
  endDate: string | null;
  lastGeneratedDate: string | null;
  isActive: boolean;
  createdAt: string; // ISO instant
  updatedAt: string; // ISO instant
}

/** Input for creating a new recurring rule. */
export interface CreateRecurringRuleInput {
  householdId: string;
  accountId: string;
  categoryId?: string | null;
  description: string;
  amount: { amount: number };
  type: RecurringTransactionType;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string | null;
}

/** A preview occurrence generated from a recurring rule. */
export interface UpcomingOccurrence {
  date: string;
  amount: { amount: number };
  description: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'recurring-rules';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random UUID v4 string. */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Read all rules from localStorage. */
function readRules(): RecurringRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecurringRule[];
  } catch {
    return [];
  }
}

/** Write all rules to localStorage. */
function writeRules(rules: RecurringRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

/** Return the current instant as an ISO string. */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Advance a date by the given frequency.
 *
 * Uses UTC date arithmetic to avoid timezone issues with local-date strings.
 */
function advanceDate(dateStr: string, frequency: RecurringFrequency): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];

  let newYear = year;
  let newMonth: number;
  let newDay: number;

  switch (frequency) {
    case 'DAILY':
      return formatDate(new Date(Date.UTC(year, month - 1, day + 1)));
    case 'WEEKLY':
      return formatDate(new Date(Date.UTC(year, month - 1, day + 7)));
    case 'BIWEEKLY':
      return formatDate(new Date(Date.UTC(year, month - 1, day + 14)));
    case 'MONTHLY':
      newMonth = month + 1;
      if (newMonth > 12) {
        newMonth = 1;
        newYear = year + 1;
      }
      // Clamp to last day of month
      newDay = Math.min(day, daysInMonth(newYear, newMonth));
      return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
    case 'YEARLY':
      newYear = year + 1;
      newDay = Math.min(day, daysInMonth(newYear, month));
      return `${newYear}-${String(month).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
  }
}

/** Return the number of days in a given month (1-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Format a Date to YYYY-MM-DD using UTC values. */
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Return all non-deleted (active and paused) recurring rules. */
export function getAllRecurringRules(): RecurringRule[] {
  return readRules();
}

/** Find a single rule by ID, or `null` if not found. */
export function getRecurringRuleById(id: string): RecurringRule | null {
  const rules = readRules();
  return rules.find((r) => r.id === id) ?? null;
}

/**
 * Create a new recurring rule.
 *
 * @returns The newly created rule.
 */
export function createRecurringRule(input: CreateRecurringRuleInput): RecurringRule {
  const now = nowISO();
  const rule: RecurringRule = {
    id: generateId(),
    householdId: input.householdId,
    accountId: input.accountId,
    categoryId: input.categoryId ?? null,
    description: input.description,
    amount: { amount: input.amount.amount },
    type: input.type,
    frequency: input.frequency,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    lastGeneratedDate: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const rules = readRules();
  rules.push(rule);
  writeRules(rules);

  return rule;
}

/**
 * Update an existing recurring rule.
 *
 * @returns The updated rule, or `null` if not found.
 */
export function updateRecurringRule(
  id: string,
  updates: Partial<CreateRecurringRuleInput> & { isActive?: boolean },
): RecurringRule | null {
  const rules = readRules();
  const index = rules.findIndex((r) => r.id === id);
  if (index === -1) return null;

  const existing = rules[index]!;
  const updated: RecurringRule = {
    ...existing,
    ...(updates.householdId !== undefined && { householdId: updates.householdId }),
    ...(updates.accountId !== undefined && { accountId: updates.accountId }),
    ...(updates.categoryId !== undefined && { categoryId: updates.categoryId ?? null }),
    ...(updates.description !== undefined && { description: updates.description }),
    ...(updates.amount !== undefined && { amount: { amount: updates.amount.amount } }),
    ...(updates.type !== undefined && { type: updates.type }),
    ...(updates.frequency !== undefined && { frequency: updates.frequency }),
    ...(updates.startDate !== undefined && { startDate: updates.startDate }),
    ...(updates.endDate !== undefined && { endDate: updates.endDate ?? null }),
    ...(updates.isActive !== undefined && { isActive: updates.isActive }),
    updatedAt: nowISO(),
  };

  rules[index] = updated;
  writeRules(rules);

  return updated;
}

/**
 * Soft-delete a recurring rule by marking it inactive.
 *
 * @returns `true` if the rule was found and deactivated, `false` otherwise.
 */
export function deleteRecurringRule(id: string): boolean {
  const rules = readRules();
  const index = rules.findIndex((r) => r.id === id);
  if (index === -1) return false;

  rules.splice(index, 1);
  writeRules(rules);

  return true;
}

// ---------------------------------------------------------------------------
// Upcoming occurrences
// ---------------------------------------------------------------------------

/**
 * Generate a preview of the next `count` occurrences for a rule.
 *
 * Starts from today (or the rule's startDate, whichever is later) and
 * generates up to `count` future dates that respect the rule's endDate.
 */
export function getUpcomingTransactions(
  rule: RecurringRule,
  count: number = 5,
): UpcomingOccurrence[] {
  if (!rule.isActive) return [];

  const today = formatDate(new Date());
  const occurrences: UpcomingOccurrence[] = [];

  // Start from the rule's start date
  let currentDate = rule.startDate;

  // Fast-forward to today or later
  while (currentDate < today) {
    currentDate = advanceDate(currentDate, rule.frequency);
  }

  while (occurrences.length < count) {
    // Respect end date
    if (rule.endDate && currentDate > rule.endDate) {
      break;
    }

    occurrences.push({
      date: currentDate,
      amount: { amount: rule.amount.amount },
      description: rule.description,
    });

    currentDate = advanceDate(currentDate, rule.frequency);
  }

  return occurrences;
}

/**
 * Get upcoming transactions across all active rules within the next N days.
 *
 * @param days Number of days to look ahead (default 7).
 * @returns Sorted array of upcoming occurrences.
 */
export function getUpcomingTransactionsInRange(days: number = 7): UpcomingOccurrence[] {
  const rules = readRules().filter((r) => r.isActive);
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + days);
  const endDateStr = formatDate(endDate);
  const todayStr = formatDate(today);

  const allOccurrences: UpcomingOccurrence[] = [];

  for (const rule of rules) {
    let currentDate = rule.startDate;

    // Fast-forward to today
    while (currentDate < todayStr) {
      currentDate = advanceDate(currentDate, rule.frequency);
    }

    // Collect occurrences within range
    while (currentDate <= endDateStr) {
      if (rule.endDate && currentDate > rule.endDate) {
        break;
      }

      allOccurrences.push({
        date: currentDate,
        amount: { amount: rule.amount.amount },
        description: rule.description,
      });

      currentDate = advanceDate(currentDate, rule.frequency);
    }
  }

  // Sort by date ascending
  allOccurrences.sort((a, b) => a.date.localeCompare(b.date));

  return allOccurrences;
}
