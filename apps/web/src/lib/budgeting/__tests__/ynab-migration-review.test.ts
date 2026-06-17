// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { reviewYnabMigrationRows } from '../ynab-migration-review';

describe('reviewYnabMigrationRows', () => {
  it('preserves nYNAB metadata and cleared state', () => {
    const review = reviewYnabMigrationRows([
      {
        Account: 'Checking',
        'Category Group/Category': 'Everyday: Groceries',
        Memo: 'weekly shop',
        Flag: 'Blue',
        Cleared: 'Cleared',
        Inflow: '',
        Outflow: '42.15',
      },
    ]);

    expect(review.records[0]).toMatchObject({
      accountName: 'Checking',
      categoryGroupName: 'Everyday',
      categoryName: 'Groceries',
      memo: 'weekly shop',
      flag: 'Blue',
      clearedState: 'cleared',
      amountCents: -4_215,
    });
  });

  it('preserves YNAB4 signed amounts and warns on inflow/outflow mismatch', () => {
    const review = reviewYnabMigrationRows([
      {
        'Account Name': 'Visa',
        'Category Group': 'Bills',
        Category: 'Utilities',
        Cleared: 'R',
        Amount: '-50.00',
        Inflow: '10.00',
        Outflow: '20.00',
      },
    ]);

    expect(review.records[0].amountCents).toBe(-5_000);
    expect(review.records[0].clearedState).toBe('reconciled');
    expect(review.warnings[0]).toContain('Signed amount differs');
  });
});
