// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildWidgetSnapshot } from './widget-narration-engine';

describe('widget narration engine', () => {
  it('masks amounts for privacy while keeping confidence and deeplink contract', () => {
    const snapshot = buildWidgetSnapshot({
      asOfDate: '2026-07-10',
      lastUpdatedAt: '2026-07-10T00:00:00Z',
      offline: false,
      privacyMode: 'masked',
      accounts: [{ accountId: 'checking', accountName: 'Checking', balanceCents: 120_000 }],
      transactions: [{ id: 'tx-1', date: '2026-07-10', amountCents: 2_500, type: 'EXPENSE' }],
      recurringBills: [{ id: 'bill-1', label: 'Rent', dueDate: '2026-07-15', amountCents: 80_000 }],
      deeplinkTarget: '/dashboard?widget=today-spend',
    });

    expect(snapshot.amountMasked).toBe(true);
    expect(snapshot.todaySpendCents).toBeNull();
    expect(snapshot.narration[0]).toContain('hidden');
    expect(snapshot.deeplinkTarget).toBe('/dashboard?widget=today-spend');
  });

  it('handles offline and missing balances with low confidence', () => {
    const offline = buildWidgetSnapshot({
      asOfDate: '2026-07-10',
      offline: true,
      privacyMode: 'visible',
      accounts: [{ accountId: 'checking', accountName: 'Checking', balanceCents: 120_000 }],
      transactions: [],
      recurringBills: [],
      deeplinkTarget: '/dashboard',
    });
    const missing = buildWidgetSnapshot({
      asOfDate: '2026-07-10',
      offline: false,
      privacyMode: 'visible',
      accounts: [{ accountId: 'checking', accountName: 'Checking' }],
      transactions: [],
      recurringBills: [],
      deeplinkTarget: '/dashboard',
    });

    expect(offline.lastUpdatedState).toBe('offline');
    expect(offline.confidence).toBe('low');
    expect(missing.predictedBalanceCents).toBeNull();
    expect(missing.staleReason).toContain('missing balances');
  });

  it('predicts balance from local transactions and recurring bills', () => {
    const snapshot = buildWidgetSnapshot({
      asOfDate: '2026-07-10',
      lastUpdatedAt: '2026-07-10T00:00:00Z',
      offline: false,
      privacyMode: 'visible',
      accounts: [{ accountId: 'checking', accountName: 'Checking', balanceCents: 120_000 }],
      transactions: [
        { id: 'tx-1', date: '2026-07-10', amountCents: 2_500, type: 'EXPENSE' },
        { id: 'tx-2', date: '2026-07-12', amountCents: 50_000, type: 'INCOME' },
      ],
      recurringBills: [{ id: 'bill-1', label: 'Rent', dueDate: '2026-07-15', amountCents: 80_000 }],
      deeplinkTarget: '/dashboard',
    });

    expect(snapshot.todaySpendCents).toBe(2_500);
    expect(snapshot.predictedBalanceCents).toBe(90_000);
    expect(snapshot.confidence).toBe('high');
  });
});
