// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  archiveTripBudgetScope,
  buildTripBudgetRollup,
  transactionMatchesTripBudgetScope,
  type TripBudgetTransaction,
  type TripCountryBudgetScope,
} from '../trip-country-budget-scope';

const scope: TripCountryBudgetScope = {
  id: 'trip-thailand',
  name: 'Thailand Jan-Mar',
  countries: ['TH'],
  startDate: '2025-01-01',
  endDate: '2025-03-31',
  localCurrency: 'THB',
  displayCurrency: 'USD',
  tags: ['trip'],
  linkedAccountIds: ['card-1'],
};

function tx(overrides: Partial<TripBudgetTransaction>): TripBudgetTransaction {
  return {
    id: 'tx',
    amountCents: -1_000_00,
    currency: 'THB',
    date: '2025-02-01',
    merchantCountry: 'TH',
    tags: ['trip'],
    accountId: 'card-1',
    kind: 'expense',
    ...overrides,
  };
}

describe('trip country budget scope', () => {
  it('filters transactions by country date tags and linked accounts', () => {
    expect(transactionMatchesTripBudgetScope(scope, tx({ id: 'included' }))).toBe(true);
    expect(transactionMatchesTripBudgetScope(scope, tx({ id: 'wrong-country', merchantCountry: 'US' }))).toBe(false);
    expect(transactionMatchesTripBudgetScope(scope, tx({ id: 'wrong-date', date: '2025-04-01' }))).toBe(false);
    expect(transactionMatchesTripBudgetScope(scope, tx({ id: 'wrong-tag', tags: ['work'] }))).toBe(false);
    expect(transactionMatchesTripBudgetScope(scope, tx({ id: 'wrong-account', accountId: 'card-2' }))).toBe(false);
  });

  it('rolls up local and display currency spend', () => {
    const rollup = buildTripBudgetRollup(
      scope,
      [tx({ id: 'thai' }), tx({ id: 'usd', amountCents: -20_00, currency: 'USD' })],
      '2025-02-15',
      (amount, from, to) => {
        if (from === to) return amount;
        if (from === 'THB' && to === 'USD') return amount * 0.03;
        if (from === 'USD' && to === 'THB') return amount / 0.03;
        return amount;
      },
    );

    expect(rollup.includedTransactionIds).toEqual(['thai', 'usd']);
    expect(rollup.localSpendCents).toBe(166_667);
    expect(rollup.displaySpendCents).toBe(5_000);
    expect(rollup.appearsInActiveAlerts).toBe(true);
  });

  it('archives trips while keeping them reportable', () => {
    const archived = archiveTripBudgetScope(scope);
    const rollup = buildTripBudgetRollup(archived, [tx({ id: 'thai' })], '2025-02-15');

    expect(rollup.includedTransactionIds).toEqual(['thai']);
    expect(rollup.isArchived).toBe(true);
    expect(rollup.appearsInActiveAlerts).toBe(false);
  });
});
