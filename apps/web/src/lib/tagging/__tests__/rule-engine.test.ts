// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the tagging rule engine.
 *
 * References: issue #1473
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction } from '../../../kmp/bridge';
import type { TagCondition, TaggingRule } from '../tagging-types';
import {
  createRule,
  deleteRule,
  evaluateRules,
  evaluateRulesWithIds,
  loadRules,
  matchCondition,
  saveRules,
  updateRule,
} from '../rule-engine';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    householdId: 'hh-1',
    accountId: 'acc-1',
    categoryId: 'cat-1',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 500 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Starbucks Coffee',
    note: 'Morning latte',
    date: '2024-06-15',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: ['coffee'],
    createdAt: '2024-06-15T08:00:00Z',
    updatedAt: '2024-06-15T08:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

function makeRule(overrides: Partial<TaggingRule> = {}): TaggingRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    enabled: true,
    conditions: [{ field: 'counterpartyName', operator: 'contains', value: 'starbucks' }],
    actions: [{ type: 'addTag', value: 'coffee' }],
    priority: 50,
    createdAt: '2024-01-01T00:00:00Z',
    matchCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((_index: number) => null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchCondition', () => {
  const txn = makeTransaction();

  beforeEach(() => {
    localStorageMock.clear();
  });

  it('matches "contains" operator case-insensitively', () => {
    const condition: TagCondition = {
      field: 'counterpartyName',
      operator: 'contains',
      value: 'starbucks',
    };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('rejects "contains" when substring is absent', () => {
    const condition: TagCondition = {
      field: 'counterpartyName',
      operator: 'contains',
      value: 'walmart',
    };
    expect(matchCondition(txn, condition)).toBe(false);
  });

  it('matches "equals" operator case-insensitively', () => {
    const condition: TagCondition = { field: 'type', operator: 'equals', value: 'expense' };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('matches "startsWith" operator', () => {
    const condition: TagCondition = {
      field: 'counterpartyName',
      operator: 'startsWith',
      value: 'star',
    };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('matches "endsWith" operator', () => {
    const condition: TagCondition = {
      field: 'counterpartyName',
      operator: 'endsWith',
      value: 'coffee',
    };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('matches "greaterThan" for amount', () => {
    const condition: TagCondition = { field: 'amount', operator: 'greaterThan', value: '400' };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('rejects "greaterThan" when amount is less', () => {
    const condition: TagCondition = { field: 'amount', operator: 'greaterThan', value: '600' };
    expect(matchCondition(txn, condition)).toBe(false);
  });

  it('matches "lessThan" for amount', () => {
    const condition: TagCondition = { field: 'amount', operator: 'lessThan', value: '600' };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('matches "between" for amount (inclusive)', () => {
    const condition: TagCondition = {
      field: 'amount',
      operator: 'between',
      value: '400',
      value2: '600',
    };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('rejects "between" when outside range', () => {
    const condition: TagCondition = {
      field: 'amount',
      operator: 'between',
      value: '600',
      value2: '800',
    };
    expect(matchCondition(txn, condition)).toBe(false);
  });

  it('matches "matches" (regex) operator', () => {
    const condition: TagCondition = {
      field: 'counterpartyName',
      operator: 'matches',
      value: 'star.*coffee',
    };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('handles invalid regex gracefully', () => {
    const condition: TagCondition = {
      field: 'counterpartyName',
      operator: 'matches',
      value: '[invalid',
    };
    expect(matchCondition(txn, condition)).toBe(false);
  });

  it('handles null field (payee absent)', () => {
    const txnNoPayee = makeTransaction({ payee: null });
    const condition: TagCondition = {
      field: 'counterpartyName',
      operator: 'contains',
      value: 'test',
    };
    expect(matchCondition(txnNoPayee, condition)).toBe(false);
  });

  it('matches "equals" with empty value against null field', () => {
    const txnNoPayee = makeTransaction({ payee: null });
    const condition: TagCondition = { field: 'counterpartyName', operator: 'equals', value: '' };
    expect(matchCondition(txnNoPayee, condition)).toBe(true);
  });

  it('matches description field', () => {
    const condition: TagCondition = { field: 'description', operator: 'contains', value: 'latte' };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('matches account field', () => {
    const condition: TagCondition = { field: 'account', operator: 'equals', value: 'acc-1' };
    expect(matchCondition(txn, condition)).toBe(true);
  });

  it('matches category field', () => {
    const condition: TagCondition = { field: 'category', operator: 'equals', value: 'cat-1' };
    expect(matchCondition(txn, condition)).toBe(true);
  });
});

describe('evaluateRules', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  const txn = makeTransaction();

  it('returns empty array when no rules match', () => {
    const rule = makeRule({
      conditions: [{ field: 'counterpartyName', operator: 'contains', value: 'walmart' }],
    });
    expect(evaluateRules(txn, [rule])).toEqual([]);
  });

  it('returns actions from matching rule', () => {
    const rule = makeRule();
    const actions = evaluateRules(txn, [rule]);
    expect(actions).toEqual([{ type: 'addTag', value: 'coffee' }]);
  });

  it('skips disabled rules', () => {
    const rule = makeRule({ enabled: false });
    expect(evaluateRules(txn, [rule])).toEqual([]);
  });

  it('requires ALL conditions to match (AND logic)', () => {
    const rule = makeRule({
      conditions: [
        { field: 'counterpartyName', operator: 'contains', value: 'starbucks' },
        { field: 'type', operator: 'equals', value: 'INCOME' }, // won't match
      ],
    });
    expect(evaluateRules(txn, [rule])).toEqual([]);
  });

  it('deduplicates addTag actions by name', () => {
    const rules = [
      makeRule({ id: 'r1', actions: [{ type: 'addTag', value: 'Coffee' }] }),
      makeRule({ id: 'r2', actions: [{ type: 'addTag', value: 'coffee' }] }),
    ];
    const actions = evaluateRules(txn, rules);
    expect(actions).toHaveLength(1);
  });

  it('keeps only first setCategory action', () => {
    const rules = [
      makeRule({
        id: 'r1',
        priority: 100,
        actions: [{ type: 'setCategory', value: 'Dining' }],
      }),
      makeRule({
        id: 'r2',
        priority: 50,
        actions: [{ type: 'setCategory', value: 'Food' }],
      }),
    ];
    const actions = evaluateRules(txn, rules);
    const setCategoryActions = actions.filter((a) => a.type === 'setCategory');
    expect(setCategoryActions).toHaveLength(1);
    expect(setCategoryActions[0].value).toBe('Dining');
  });

  it('evaluates higher priority rules first', () => {
    const rules = [
      makeRule({
        id: 'r1',
        priority: 10,
        actions: [{ type: 'setCategory', value: 'Low Priority' }],
      }),
      makeRule({
        id: 'r2',
        priority: 90,
        actions: [{ type: 'setCategory', value: 'High Priority' }],
      }),
    ];
    const actions = evaluateRules(txn, rules);
    const setCategoryAction = actions.find((a) => a.type === 'setCategory');
    expect(setCategoryAction?.value).toBe('High Priority');
  });

  it('combines actions from multiple matching rules', () => {
    const rules = [
      makeRule({
        id: 'r1',
        actions: [{ type: 'addTag', value: 'coffee' }],
      }),
      makeRule({
        id: 'r2',
        actions: [{ type: 'addTag', value: 'daily' }],
      }),
    ];
    const actions = evaluateRules(txn, rules);
    const tagNames = actions.filter((a) => a.type === 'addTag').map((a) => a.value);
    expect(tagNames).toContain('coffee');
    expect(tagNames).toContain('daily');
  });

  it('rejects rules with empty conditions array', () => {
    const rule = makeRule({ conditions: [] });
    expect(evaluateRules(txn, [rule])).toEqual([]);
  });
});

describe('evaluateRulesWithIds', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns matched rule IDs alongside actions', () => {
    const txn = makeTransaction();
    const rules = [
      makeRule({ id: 'r1' }),
      makeRule({
        id: 'r2',
        conditions: [{ field: 'counterpartyName', operator: 'contains', value: 'walmart' }],
      }),
    ];
    const result = evaluateRulesWithIds(txn, rules);
    expect(result.matchedRuleIds).toEqual(['r1']);
    expect(result.actions).toHaveLength(1);
  });
});

describe('CRUD operations', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('creates and loads rules', () => {
    const rule = createRule({
      name: 'Coffee shops',
      enabled: true,
      conditions: [{ field: 'counterpartyName', operator: 'contains', value: 'coffee' }],
      actions: [{ type: 'addTag', value: 'coffee' }],
      priority: 50,
    });

    expect(rule.id).toBeTruthy();
    expect(rule.matchCount).toBe(0);

    const loaded = loadRules();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Coffee shops');
  });

  it('updates a rule', () => {
    const rule = createRule({
      name: 'Test',
      enabled: true,
      conditions: [],
      actions: [],
      priority: 50,
    });

    const updated = updateRule(rule.id, { name: 'Updated', priority: 100 });
    expect(updated?.name).toBe('Updated');
    expect(updated?.priority).toBe(100);
  });

  it('returns null when updating non-existent rule', () => {
    expect(updateRule('non-existent', { name: 'X' })).toBeNull();
  });

  it('deletes a rule', () => {
    const rule = createRule({
      name: 'Delete Me',
      enabled: true,
      conditions: [],
      actions: [],
      priority: 50,
    });

    expect(deleteRule(rule.id)).toBe(true);
    expect(loadRules()).toHaveLength(0);
  });

  it('returns false when deleting non-existent rule', () => {
    expect(deleteRule('non-existent')).toBe(false);
  });
});

describe('saveRules / loadRules', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('round-trips rules through localStorage', () => {
    const rules = [makeRule()];
    saveRules(rules);
    const loaded = loadRules();
    expect(loaded).toEqual(rules);
  });

  it('returns empty array when localStorage is empty', () => {
    expect(loadRules()).toEqual([]);
  });

  it('returns empty array on invalid JSON', () => {
    localStorageMock.setItem('finance-tagging-rules', 'not json');
    expect(loadRules()).toEqual([]);
  });
});
