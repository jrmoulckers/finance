// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../kmp/bridge';
import { analyzeMoodSpendingCorrelation } from './moodCorrelation';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    householdId: 'household-1',
    accountId: 'checking',
    categoryId: 'shopping',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -5_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Store',
    note: null,
    date: '2025-01-20',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    moodTag: '😐',
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    ...syncMetadata,
    ...overrides,
  };
}

describe('analyzeMoodSpendingCorrelation', () => {
  it('returns an empty summary when nothing is mood-tagged', () => {
    const result = analyzeMoodSpendingCorrelation({
      transactions: [makeTransaction({ moodTag: null })],
    });

    expect(result.hasEnoughData).toBe(false);
    expect(result.entriesTagged).toBe(0);
    expect(result.patterns).toEqual([]);
  });

  it('detects emotional spending spikes from higher-stress moods', () => {
    const result = analyzeMoodSpendingCorrelation({
      transactions: [
        makeTransaction({
          id: 'calm-1',
          moodTag: '😊',
          amount: { amount: -4_000 },
          date: '2025-01-02',
        }),
        makeTransaction({
          id: 'neutral-1',
          moodTag: '😐',
          amount: { amount: -5_000 },
          date: '2025-01-04',
        }),
        makeTransaction({
          id: 'stress-1',
          moodTag: '😟',
          amount: { amount: -11_000 },
          date: '2025-01-08',
        }),
        makeTransaction({
          id: 'stress-2',
          moodTag: '😡',
          amount: { amount: -15_000 },
          date: '2025-01-12',
        }),
        makeTransaction({
          id: 'stress-3',
          moodTag: '😡',
          amount: { amount: -13_000 },
          date: '2025-01-15',
        }),
      ],
    });

    expect(result.hasEnoughData).toBe(true);
    expect(result.correlation).toBeGreaterThan(0.3);
    expect(result.spikeCount).toBeGreaterThan(0);
    expect(result.patterns.some((pattern) => pattern.direction === 'spike')).toBe(true);
    expect(result.dominantMoodState).toBe('stressed');
  });
});
