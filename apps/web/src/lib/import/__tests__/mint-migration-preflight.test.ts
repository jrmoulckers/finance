// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { createMintMigrationPreflightPanel, isMintMigrationCandidate } from '../mint-migration-preflight';

describe('mint migration preflight panel', () => {
  it('detects Mint CSV and preserves source-specific fields', () => {
    const csv = `Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes
01/15/2024,Whole Foods,WHOLE FOODS #123,45.67,debit,Groceries,Amex Gold,"food, reimbursable",Paper receipt
01/16/2024,Payroll,ACME PAYROLL,2500.00,credit,Income,Checking,,`;

    expect(isMintMigrationCandidate('transactions.csv', csv)).toBe(true);

    const panel = createMintMigrationPreflightPanel('transactions.csv', csv);

    expect(panel.detected).toBe(true);
    expect(panel.accounts).toEqual(['Amex Gold', 'Checking']);
    expect(panel.categories).toEqual(['Groceries', 'Income']);
    expect(panel.labels).toEqual(['food', 'reimbursable']);
    expect(panel.rows[0]).toMatchObject({
      debitCredit: 'debit',
      originalDescription: 'WHOLE FOODS #123',
      note: 'Paper receipt',
    });
    expect(panel.rows[1].note).toBeNull();
  });

  it('surfaces malformed date parser errors', () => {
    const csv = `Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes
not-a-date,Coffee,COFFEE,4.50,debit,Food,Checking,,`;

    const panel = createMintMigrationPreflightPanel('mint.csv', csv);

    expect(panel.rows).toHaveLength(0);
    expect(panel.issues[0]).toContain('Invalid date');
  });
});
