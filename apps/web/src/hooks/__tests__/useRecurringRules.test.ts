// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CreateRecurringRuleInput,
  RecurringRule,
} from '../../db/repositories/recurring-rules';
import { useRecurringRules } from '../useRecurringRules';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'recurring-rules';

function makeInput(overrides: Partial<CreateRecurringRuleInput> = {}): CreateRecurringRuleInput {
  return {
    householdId: 'hh-1',
    accountId: 'acct-1',
    description: 'Monthly Rent',
    amount: { amount: 150000 },
    type: 'EXPENSE',
    frequency: 'MONTHLY',
    startDate: '2025-01-01',
    ...overrides,
  };
}

describe('useRecurringRules', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  // -----------------------------------------------------------------------
  // Loading / empty state
  // -----------------------------------------------------------------------

  it('returns empty rules list when no rules exist', () => {
    const { result } = renderHook(() => useRecurringRules());

    expect(result.current.loading).toBe(false);
    expect(result.current.rules).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  // -----------------------------------------------------------------------
  // CRUD — createRule
  // -----------------------------------------------------------------------

  it('creates a rule and retrieves it', () => {
    const { result } = renderHook(() => useRecurringRules());

    let created: RecurringRule | null = null;
    act(() => {
      created = result.current.createRule(makeInput());
    });

    expect(created).not.toBeNull();
    expect(created!.description).toBe('Monthly Rent');
    expect(created!.amount.amount).toBe(150000);
    expect(created!.frequency).toBe('MONTHLY');
    expect(created!.isActive).toBe(true);

    // After refresh the rule should be in the list
    expect(result.current.rules.length).toBeGreaterThanOrEqual(1);
    expect(result.current.rules.some((r) => r.id === created!.id)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // CRUD — updateRule
  // -----------------------------------------------------------------------

  it('updates a rule', () => {
    const { result } = renderHook(() => useRecurringRules());

    let created: RecurringRule | null = null;
    act(() => {
      created = result.current.createRule(makeInput());
    });

    let updated: RecurringRule | null = null;
    act(() => {
      updated = result.current.updateRule(created!.id, { description: 'Updated Rent' });
    });

    expect(updated).not.toBeNull();
    expect(updated!.description).toBe('Updated Rent');
  });

  it('returns null when updating nonexistent rule', () => {
    const { result } = renderHook(() => useRecurringRules());

    let updated: RecurringRule | null = null;
    act(() => {
      updated = result.current.updateRule('nonexistent', { description: 'Nope' });
    });

    expect(updated).toBeNull();
  });

  // -----------------------------------------------------------------------
  // CRUD — deleteRule (removes from storage)
  // -----------------------------------------------------------------------

  it('deletes a rule and removes it from the list', () => {
    const { result } = renderHook(() => useRecurringRules());

    let created: RecurringRule | null = null;
    act(() => {
      created = result.current.createRule(makeInput());
    });

    let deleted = false;
    act(() => {
      deleted = result.current.deleteRule(created!.id);
    });

    expect(deleted).toBe(true);
    expect(result.current.rules.some((r) => r.id === created!.id)).toBe(false);
  });

  it('returns false when deleting nonexistent rule', () => {
    const { result } = renderHook(() => useRecurringRules());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteRule('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Upcoming — monthly
  // -----------------------------------------------------------------------

  it('generates correct upcoming dates for monthly frequency', () => {
    const { result } = renderHook(() => useRecurringRules());

    let created: RecurringRule | null = null;
    act(() => {
      created = result.current.createRule(
        makeInput({
          frequency: 'MONTHLY',
          startDate: '2099-01-15',
        }),
      );
    });

    const upcoming = result.current.getUpcoming(created!.id, 3);

    expect(upcoming).toHaveLength(3);
    expect(upcoming[0]!.date).toBe('2099-01-15');
    expect(upcoming[1]!.date).toBe('2099-02-15');
    expect(upcoming[2]!.date).toBe('2099-03-15');
    expect(upcoming[0]!.description).toBe('Monthly Rent');
    expect(upcoming[0]!.amount.amount).toBe(150000);
  });

  // -----------------------------------------------------------------------
  // Upcoming — weekly
  // -----------------------------------------------------------------------

  it('generates correct upcoming dates for weekly frequency', () => {
    const { result } = renderHook(() => useRecurringRules());

    let created: RecurringRule | null = null;
    act(() => {
      created = result.current.createRule(
        makeInput({
          description: 'Weekly Groceries',
          frequency: 'WEEKLY',
          startDate: '2099-06-01',
        }),
      );
    });

    const upcoming = result.current.getUpcoming(created!.id, 4);

    expect(upcoming).toHaveLength(4);
    expect(upcoming[0]!.date).toBe('2099-06-01');
    expect(upcoming[1]!.date).toBe('2099-06-08');
    expect(upcoming[2]!.date).toBe('2099-06-15');
    expect(upcoming[3]!.date).toBe('2099-06-22');
  });

  // -----------------------------------------------------------------------
  // Upcoming — daily
  // -----------------------------------------------------------------------

  it('generates correct upcoming dates for daily frequency', () => {
    const { result } = renderHook(() => useRecurringRules());

    let created: RecurringRule | null = null;
    act(() => {
      created = result.current.createRule(
        makeInput({
          description: 'Daily Coffee',
          frequency: 'DAILY',
          startDate: '2099-03-01',
        }),
      );
    });

    const upcoming = result.current.getUpcoming(created!.id, 3);

    expect(upcoming).toHaveLength(3);
    expect(upcoming[0]!.date).toBe('2099-03-01');
    expect(upcoming[1]!.date).toBe('2099-03-02');
    expect(upcoming[2]!.date).toBe('2099-03-03');
  });

  // -----------------------------------------------------------------------
  // End date handling
  // -----------------------------------------------------------------------

  it('handles end date correctly — stops generating past end date', () => {
    const { result } = renderHook(() => useRecurringRules());

    let created: RecurringRule | null = null;
    act(() => {
      created = result.current.createRule(
        makeInput({
          frequency: 'MONTHLY',
          startDate: '2099-10-01',
          endDate: '2099-12-01',
        }),
      );
    });

    // Requesting 5 but should only get 3 (Oct, Nov, Dec)
    const upcoming = result.current.getUpcoming(created!.id, 5);

    expect(upcoming).toHaveLength(3);
    expect(upcoming[0]!.date).toBe('2099-10-01');
    expect(upcoming[1]!.date).toBe('2099-11-01');
    expect(upcoming[2]!.date).toBe('2099-12-01');
  });

  // -----------------------------------------------------------------------
  // Toggle active/paused
  // -----------------------------------------------------------------------

  it('soft delete marks rule inactive via toggle', () => {
    const { result } = renderHook(() => useRecurringRules());

    let created: RecurringRule | null = null;
    act(() => {
      created = result.current.createRule(makeInput());
    });

    expect(created!.isActive).toBe(true);

    let updated: RecurringRule | null = null;
    act(() => {
      updated = result.current.updateRule(created!.id, { isActive: false });
    });

    expect(updated!.isActive).toBe(false);

    // Inactive rule returns no upcoming occurrences
    const upcoming = result.current.getUpcoming(updated!.id, 3);
    expect(upcoming).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Refresh
  // -----------------------------------------------------------------------

  it('re-fetches data when refresh is called', () => {
    const { result } = renderHook(() => useRecurringRules());

    act(() => {
      result.current.createRule(makeInput());
    });

    const countBefore = result.current.rules.length;

    // Manually add a rule to localStorage behind the hook's back
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    parsed.push({
      id: 'manual-rule',
      householdId: 'hh-1',
      accountId: 'acct-1',
      categoryId: null,
      description: 'Manually Added',
      amount: { amount: 5000 },
      type: 'EXPENSE',
      frequency: 'WEEKLY',
      startDate: '2099-01-01',
      endDate: null,
      lastGeneratedDate: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));

    act(() => {
      result.current.refresh();
    });

    expect(result.current.rules.length).toBeGreaterThan(countBefore);
  });
});
