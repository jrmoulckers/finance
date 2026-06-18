// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { matchP2PTransactions } from './p2p-matching';

describe('matchP2PTransactions', () => {
  it('matches meal reimbursements without distorting budget totals', () => {
    const matches = matchP2PTransactions({
      transactions: [
        {
          id: 'card',
          kind: 'bank',
          date: '2026-01-02',
          amountCents: -8000,
          currency: 'USD',
          counterparty: 'Cafe',
          memo: 'Dinner with Sam',
          category: 'Restaurants',
        },
        {
          id: 'venmo',
          kind: 'p2p-payment',
          date: '2026-01-03',
          amountCents: 4000,
          currency: 'USD',
          counterparty: 'Cafe',
          memo: 'dinner split',
        },
      ],
    });

    expect(matches[0]).toMatchObject({ type: 'meal-split', netAmountCents: -4000 });
  });

  it('classifies roommate rent and pass-through transfers', () => {
    const matches = matchP2PTransactions({
      transactions: [
        {
          id: 'rent-out',
          kind: 'bank',
          date: '2026-01-01',
          amountCents: -120000,
          currency: 'USD',
          memo: 'January rent',
        },
        {
          id: 'rent-in',
          kind: 'p2p-payment',
          date: '2026-01-02',
          amountCents: 60000,
          currency: 'USD',
          memo: 'roommate rent',
        },
        {
          id: 'self-out',
          kind: 'bank',
          date: '2026-01-05',
          amountCents: -25000,
          currency: 'USD',
          memo: 'self transfer',
        },
        {
          id: 'self-in',
          kind: 'p2p-payment',
          date: '2026-01-05',
          amountCents: 25000,
          currency: 'USD',
          memo: 'move money transfer',
        },
      ],
    });

    expect(matches.map((match) => match.type)).toEqual(['roommate-rent', 'pass-through-transfer']);
  });

  it('applies user override audit trail for ambiguous cases', () => {
    const matches = matchP2PTransactions({
      transactions: [
        { id: 'a', kind: 'bank', date: '2026-01-01', amountCents: -1000, currency: 'USD' },
        { id: 'b', kind: 'p2p-payment', date: '2026-01-02', amountCents: 1000, currency: 'USD' },
      ],
      overrides: [
        {
          transactionIds: ['a', 'b'],
          state: 'rejected',
          reason: 'Not related',
          updatedAt: '2026-01-03T00:00:00.000Z',
        },
      ],
    });

    expect(matches[0]).toMatchObject({ type: 'ambiguous', overrideState: 'rejected' });
    expect(matches[0]?.auditTrail.join(' ')).toContain('Not related');
  });
});
