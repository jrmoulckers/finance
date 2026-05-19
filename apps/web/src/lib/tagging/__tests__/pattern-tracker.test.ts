// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the pattern tracker (Phase 2: pattern learning).
 *
 * References: issue #1473
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction } from '../../../kmp/bridge';
import {
  clearPatterns,
  getPatternForCounterparty,
  getSuggestedTags,
  loadPatterns,
  normaliseCounterparty,
  recordTagging,
  savePatterns,
} from '../pattern-tracker';

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
    payee: 'Starbucks',
    note: null,
    date: '2024-06-15',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    createdAt: '2024-06-15T08:00:00Z',
    updatedAt: '2024-06-15T08:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
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

describe('normaliseCounterparty', () => {
  it('lowercases and trims', () => {
    expect(normaliseCounterparty('  Starbucks  ')).toBe('starbucks');
  });

  it('collapses whitespace', () => {
    expect(normaliseCounterparty('Trader   Joe')).toBe('trader joe');
  });
});

describe('recordTagging', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('creates a new pattern for unknown counterparty', () => {
    recordTagging('Starbucks', ['Coffee']);
    const patterns = loadPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0].counterpartyName).toBe('starbucks');
    expect(patterns[0].tags).toEqual([{ name: 'Coffee', count: 1 }]);
    expect(patterns[0].totalTagged).toBe(1);
  });

  it('increments existing tag counts for known counterparty', () => {
    recordTagging('Starbucks', ['Coffee']);
    recordTagging('Starbucks', ['Coffee', 'Daily']);
    const patterns = loadPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0].totalTagged).toBe(2);
    const coffeeTag = patterns[0].tags.find((t) => t.name === 'Coffee');
    expect(coffeeTag?.count).toBe(2);
    const dailyTag = patterns[0].tags.find((t) => t.name === 'Daily');
    expect(dailyTag?.count).toBe(1);
  });

  it('ignores empty counterparty name', () => {
    recordTagging('', ['Coffee']);
    expect(loadPatterns()).toHaveLength(0);
  });

  it('ignores empty tags array', () => {
    recordTagging('Starbucks', []);
    expect(loadPatterns()).toHaveLength(0);
  });

  it('handles case-insensitive tag matching', () => {
    recordTagging('Starbucks', ['coffee']);
    recordTagging('Starbucks', ['Coffee']);
    const patterns = loadPatterns();
    const coffeeTag = patterns[0].tags.find((t) => t.name.toLowerCase() === 'coffee');
    expect(coffeeTag?.count).toBe(2);
  });
});

describe('getSuggestedTags', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns suggestions based on counterparty history', () => {
    // Build up history
    for (let i = 0; i < 10; i++) {
      recordTagging('Starbucks', ['Coffee']);
    }
    for (let i = 0; i < 5; i++) {
      recordTagging('Starbucks', ['Daily']);
    }

    const txn = makeTransaction({ payee: 'Starbucks' });
    const suggestions = getSuggestedTags(txn);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].tag).toBe('Coffee');
    // Coffee: 10 out of 15 total tagging events = ~0.67
    expect(suggestions[0].confidence).toBeGreaterThan(0.5);
    expect(suggestions[0].reason).toContain('Starbucks');
  });

  it('returns empty array when no payee', () => {
    const txn = makeTransaction({ payee: null });
    expect(getSuggestedTags(txn)).toEqual([]);
  });

  it('returns empty array when no history exists', () => {
    const txn = makeTransaction({ payee: 'Unknown Store' });
    expect(getSuggestedTags(txn)).toEqual([]);
  });

  it('filters out low-confidence suggestions', () => {
    // 1 Coffee tag out of 20 total = 5% confidence, below threshold
    recordTagging('Store', ['Coffee']);
    for (let i = 0; i < 19; i++) {
      recordTagging('Store', ['Other']);
    }

    const txn = makeTransaction({ payee: 'Store' });
    const suggestions = getSuggestedTags(txn);
    const coffeeTag = suggestions.find((s) => s.tag === 'Coffee');
    expect(coffeeTag).toBeUndefined();
  });

  it('sorts by confidence descending', () => {
    for (let i = 0; i < 10; i++) recordTagging('Store', ['Daily']);
    for (let i = 0; i < 5; i++) recordTagging('Store', ['Weekly']);
    for (let i = 0; i < 3; i++) recordTagging('Store', ['Monthly']);

    const txn = makeTransaction({ payee: 'Store' });
    const suggestions = getSuggestedTags(txn);

    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
    }
  });
});

describe('getPatternForCounterparty', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns pattern for known counterparty', () => {
    recordTagging('Starbucks', ['Coffee']);
    const pattern = getPatternForCounterparty('Starbucks');
    expect(pattern).not.toBeNull();
    expect(pattern?.counterpartyName).toBe('starbucks');
  });

  it('returns null for unknown counterparty', () => {
    expect(getPatternForCounterparty('Unknown')).toBeNull();
  });

  it('returns null for empty name', () => {
    expect(getPatternForCounterparty('')).toBeNull();
  });
});

describe('clearPatterns', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('removes all patterns', () => {
    recordTagging('Starbucks', ['Coffee']);
    clearPatterns();
    expect(loadPatterns()).toEqual([]);
  });
});

describe('savePatterns / loadPatterns', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns empty array on invalid JSON', () => {
    localStorageMock.setItem('finance-tagging-patterns', 'bad json');
    expect(loadPatterns()).toEqual([]);
  });

  it('round-trips patterns', () => {
    const patterns = [
      {
        counterpartyName: 'test',
        tags: [{ name: 'tag1', count: 5 }],
        totalTagged: 5,
        lastUpdated: '2024-01-01T00:00:00Z',
      },
    ];
    savePatterns(patterns);
    expect(loadPatterns()).toEqual(patterns);
  });
});
