// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Transaction } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import {
  buildClientProfitabilityReport,
  exportClientProfitabilityCsv,
  extractClientProjectLabels,
} from './client-profitability';

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-default',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: null,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 0 },
    currency: Currencies.USD,
    payee: null,
    note: null,
    date: '2025-01-01',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    moodTag: null,
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
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
    ...overrides,
  };
}

describe('extractClientProjectLabels', () => {
  it('extracts client and project labels from existing transaction tags', () => {
    expect(extractClientProjectLabels(['client:Acme', 'project:Website', 'tax'])).toEqual([
      'Acme',
      'Website',
    ]);
  });

  it('ignores empty and unrelated tags', () => {
    expect(extractClientProjectLabels(['client:', 'project:   ', 'food'])).toEqual([]);
  });
});

describe('buildClientProfitabilityReport', () => {
  it('aggregates revenue, costs, net profit, and margins per client', () => {
    const report = buildClientProfitabilityReport([
      transaction({
        id: 'income-acme',
        type: 'INCOME',
        amount: { amount: 10_000 },
        tags: ['client:Acme'],
      }),
      transaction({
        id: 'cost-acme',
        type: 'EXPENSE',
        amount: { amount: 2_500 },
        tags: ['client:Acme'],
      }),
      transaction({
        id: 'income-beta',
        type: 'INCOME',
        amount: { amount: 7_500 },
        tags: ['client:Beta'],
      }),
      transaction({
        id: 'cost-beta',
        type: 'EXPENSE',
        amount: { amount: 8_000 },
        tags: ['client:Beta'],
      }),
      transaction({
        id: 'ignored-transfer',
        type: 'TRANSFER',
        amount: { amount: 20_000 },
        tags: ['client:Acme'],
      }),
      transaction({
        id: 'ignored-untagged',
        type: 'INCOME',
        amount: { amount: 99_999 },
        tags: ['misc'],
      }),
    ]);

    expect(report.rows.map((row) => row.client)).toEqual(['Acme', 'Beta']);
    expect(report.rows[0]).toMatchObject({
      client: 'Acme',
      revenue: 10_000,
      expenses: 2_500,
      netProfit: 7_500,
      transactionCount: 2,
      revenueTransactionCount: 1,
      expenseTransactionCount: 1,
    });
    expect(report.rows[0]?.profitMargin).toBe(75);
    expect(report.rows[1]).toMatchObject({
      client: 'Beta',
      revenue: 7_500,
      expenses: 8_000,
      netProfit: -500,
    });
    expect(report.totalRevenue).toBe(17_500);
    expect(report.totalExpenses).toBe(10_500);
    expect(report.netProfit).toBe(7_000);
    expect(report.mostProfitable?.client).toBe('Acme');
    expect(report.leastProfitable?.client).toBe('Beta');
  });

  it('filters transactions by inclusive date range', () => {
    const report = buildClientProfitabilityReport(
      [
        transaction({
          id: 'before',
          date: '2025-01-31',
          type: 'INCOME',
          amount: { amount: 10_000 },
          tags: ['client:Acme'],
        }),
        transaction({
          id: 'inside',
          date: '2025-02-01',
          type: 'INCOME',
          amount: { amount: 12_000 },
          tags: ['client:Acme'],
        }),
        transaction({
          id: 'after',
          date: '2025-03-01',
          type: 'EXPENSE',
          amount: { amount: 3_000 },
          tags: ['client:Acme'],
        }),
      ],
      { startDate: '2025-02-01', endDate: '2025-02-28' },
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ revenue: 12_000, expenses: 0, netProfit: 12_000 });
  });

  it('splits multi-client transactions to avoid double-counting totals', () => {
    const report = buildClientProfitabilityReport([
      transaction({
        id: 'shared-income',
        type: 'INCOME',
        amount: { amount: 10_001 },
        tags: ['client:Acme', 'client:Beta'],
      }),
    ]);

    expect(report.rows).toHaveLength(2);
    expect(report.rows.map((row) => row.revenue).sort((a, b) => b - a)).toEqual([5_001, 5_000]);
    expect(report.totalRevenue).toBe(10_001);
  });
});

describe('exportClientProfitabilityCsv', () => {
  it('emits a header, one row per client, and a dollar-denominated totals row', () => {
    const csv = exportClientProfitabilityCsv(
      buildClientProfitabilityReport([
        transaction({
          id: 'acme-income',
          type: 'INCOME',
          amount: { amount: 10_000 },
          tags: ['client:Acme'],
        }),
        transaction({
          id: 'acme-cost',
          type: 'EXPENSE',
          amount: { amount: 2_500 },
          tags: ['client:Acme'],
        }),
        transaction({
          id: 'beta-income',
          type: 'INCOME',
          amount: { amount: 5_000 },
          tags: ['client:Beta'],
        }),
      ]),
    );
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Client / project,Revenue,Cost,Net profit,Margin %,Transactions');
    expect(lines).toContain('Acme,100.00,25.00,75.00,75.0,2');
    expect(lines).toContain('Beta,50.00,0.00,50.00,100.0,1');
    // Totals land on the last row; the transaction column is blank because a
    // split transaction must not be double counted across clients.
    expect(lines[lines.length - 1]).toBe('All clients,150.00,25.00,125.00,83.3,');
  });

  it('quotes client/project names that contain commas or quotes', () => {
    const csv = exportClientProfitabilityCsv(
      buildClientProfitabilityReport([
        transaction({
          id: 'comma',
          type: 'INCOME',
          amount: { amount: 4_000 },
          tags: ['client:Beta, LLC'],
        }),
        transaction({
          id: 'quote',
          type: 'INCOME',
          amount: { amount: 2_000 },
          tags: ['client:Say "Hi"'],
        }),
      ]),
    );

    expect(csv).toContain('"Beta, LLC",40.00,0.00,40.00,100.0,1');
    expect(csv).toContain('"Say ""Hi""",20.00,0.00,20.00,100.0,1');
  });

  it('leaves the margin blank when a client has no revenue', () => {
    const csv = exportClientProfitabilityCsv(
      buildClientProfitabilityReport([
        transaction({
          id: 'cost-only',
          type: 'EXPENSE',
          amount: { amount: 3_000 },
          tags: ['client:Gamma'],
        }),
      ]),
    );

    expect(csv).toContain('Gamma,0.00,30.00,-30.00,,1');
  });

  it('returns the header and an empty totals row for a report with no clients', () => {
    const csv = exportClientProfitabilityCsv(buildClientProfitabilityReport([]));

    expect(csv.split('\n')).toEqual([
      'Client / project,Revenue,Cost,Net profit,Margin %,Transactions',
      'All clients,0.00,0.00,0.00,,',
    ]);
  });
});
