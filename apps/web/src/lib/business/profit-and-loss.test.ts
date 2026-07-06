// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Transaction, TransactionStatus, TransactionType } from '../../kmp/bridge';
import {
  DEFAULT_PNL_TAGS,
  buildProfitAndLoss,
  classifyTransaction,
  compilePnlTagSets,
  exportBusinessPnlCsv,
  formatMarginPercent,
  marginBasisPoints,
  periodKey,
  periodLabel,
  weekStartKey,
} from './profit-and-loss';

// ---------------------------------------------------------------------------
// Test factory
// ---------------------------------------------------------------------------

let nextId = 0;

function makeTransaction(options: {
  date: string;
  type: TransactionType;
  amountCents: number;
  tags?: readonly string[];
  status?: TransactionStatus;
}): Transaction {
  nextId += 1;
  return {
    id: `txn-${nextId}`,
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: null,
    type: options.type,
    status: options.status ?? 'CLEARED',
    amount: { amount: options.amountCents },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    date: options.date,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: options.tags ?? [],
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
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  };
}

// ---------------------------------------------------------------------------
// marginBasisPoints
// ---------------------------------------------------------------------------

describe('marginBasisPoints', () => {
  it('computes integer basis points from integer cents', () => {
    // 700_000 / 1_000_000 = 70% = 7000 bps
    expect(marginBasisPoints(700_000, 1_000_000)).toBe(7000);
  });

  it('rounds to the nearest integer basis point (no float drift)', () => {
    // 6667 / 10000 = 66.67% -> 6667 bps, exact integer
    expect(marginBasisPoints(6_667, 10_000)).toBe(6667);
  });

  it('supports negative margins', () => {
    expect(marginBasisPoints(-20_000, 100_000)).toBe(-2000);
  });

  it('returns null when revenue is zero', () => {
    expect(marginBasisPoints(5_000, 0)).toBeNull();
  });

  it('returns null when revenue is negative', () => {
    expect(marginBasisPoints(5_000, -100)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatMarginPercent
// ---------------------------------------------------------------------------

describe('formatMarginPercent', () => {
  it('formats positive basis points to one decimal percent', () => {
    expect(formatMarginPercent(7000)).toBe('70.0%');
    expect(formatMarginPercent(2537)).toBe('25.4%');
  });

  it('formats negative basis points with a leading minus (not color-only)', () => {
    expect(formatMarginPercent(-1200)).toBe('-12.0%');
  });

  it('formats null as N/A', () => {
    expect(formatMarginPercent(null)).toBe('N/A');
  });

  it('honours a custom fraction-digit count', () => {
    expect(formatMarginPercent(6667, 2)).toBe('66.67%');
  });
});

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

describe('weekStartKey', () => {
  it('snaps to the Monday of the ISO week', () => {
    expect(weekStartKey('2024-01-15')).toBe('2024-01-15'); // Monday
    expect(weekStartKey('2024-01-17')).toBe('2024-01-15'); // Wednesday
    expect(weekStartKey('2024-01-21')).toBe('2024-01-15'); // Sunday
    expect(weekStartKey('2024-01-22')).toBe('2024-01-22'); // next Monday
  });

  it('returns the input unchanged for an invalid date', () => {
    expect(weekStartKey('not-a-date')).toBe('not-a-date');
  });
});

describe('periodKey / periodLabel', () => {
  it('keys monthly periods as YYYY-MM', () => {
    expect(periodKey('2024-03-09', 'monthly')).toBe('2024-03');
    expect(periodLabel('2024-03', 'monthly')).toBe('Mar 2024');
  });

  it('keys weekly periods as the Monday week start', () => {
    expect(periodKey('2024-01-17', 'weekly')).toBe('2024-01-15');
    expect(periodLabel('2024-01-15', 'weekly')).toBe('Week of 2024-01-15');
  });
});

// ---------------------------------------------------------------------------
// classifyTransaction
// ---------------------------------------------------------------------------

describe('classifyTransaction', () => {
  const tagSets = compilePnlTagSets();

  it('treats untagged income as revenue and untagged expense as overhead', () => {
    expect(
      classifyTransaction(
        makeTransaction({ date: '2024-01-01', type: 'INCOME', amountCents: 1 }),
        tagSets,
      ),
    ).toBe('revenue');
    expect(
      classifyTransaction(
        makeTransaction({ date: '2024-01-01', type: 'EXPENSE', amountCents: 1 }),
        tagSets,
      ),
    ).toBe('overhead');
  });

  it('routes tagged transactions to their explicit bucket', () => {
    expect(
      classifyTransaction(
        makeTransaction({ date: '2024-01-01', type: 'EXPENSE', amountCents: 1, tags: ['cogs'] }),
        tagSets,
      ),
    ).toBe('cogs');
    expect(
      classifyTransaction(
        makeTransaction({
          date: '2024-01-01',
          type: 'EXPENSE',
          amountCents: 1,
          tags: ['pnl:labor'],
        }),
        tagSets,
      ),
    ).toBe('labor');
  });

  it('matches tags case-insensitively', () => {
    expect(
      classifyTransaction(
        makeTransaction({ date: '2024-01-01', type: 'EXPENSE', amountCents: 1, tags: ['COGS'] }),
        tagSets,
      ),
    ).toBe('cogs');
  });

  it('ignores transfers and voided transactions', () => {
    expect(
      classifyTransaction(
        makeTransaction({ date: '2024-01-01', type: 'TRANSFER', amountCents: 1 }),
        tagSets,
      ),
    ).toBeNull();
    expect(
      classifyTransaction(
        makeTransaction({ date: '2024-01-01', type: 'INCOME', amountCents: 1, status: 'VOID' }),
        tagSets,
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildProfitAndLoss
// ---------------------------------------------------------------------------

describe('buildProfitAndLoss', () => {
  it('computes gross/net profit and margins for a profitable month', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({ date: '2024-01-05', type: 'INCOME', amountCents: 1_000_000 }), // revenue $10,000
        makeTransaction({
          date: '2024-01-06',
          type: 'EXPENSE',
          amountCents: 300_000,
          tags: ['cogs'],
        }),
        makeTransaction({
          date: '2024-01-07',
          type: 'EXPENSE',
          amountCents: 200_000,
          tags: ['labor'],
        }),
        makeTransaction({
          date: '2024-01-08',
          type: 'EXPENSE',
          amountCents: 100_000,
          tags: ['overhead'],
        }),
      ],
      { granularity: 'monthly' },
    );

    const { totals } = statement;
    expect(totals.revenueCents).toBe(1_000_000);
    expect(totals.cogsCents).toBe(300_000);
    expect(totals.laborCents).toBe(200_000);
    expect(totals.overheadCents).toBe(100_000);
    expect(totals.grossProfitCents).toBe(700_000);
    expect(totals.operatingExpensesCents).toBe(300_000);
    expect(totals.netProfitCents).toBe(400_000);
    expect(totals.grossMarginBps).toBe(7000); // 70.0%
    expect(totals.netMarginBps).toBe(4000); // 40.0%
    expect(totals.transactionCount).toBe(4);
    expect(formatMarginPercent(totals.netMarginBps)).toBe('40.0%');
  });

  it('reports a negative net profit when operating expenses exceed gross profit', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({ date: '2024-02-01', type: 'INCOME', amountCents: 100_000 }), // $1,000
        makeTransaction({
          date: '2024-02-02',
          type: 'EXPENSE',
          amountCents: 40_000,
          tags: ['cogs'],
        }),
        makeTransaction({
          date: '2024-02-03',
          type: 'EXPENSE',
          amountCents: 50_000,
          tags: ['labor'],
        }),
        makeTransaction({
          date: '2024-02-04',
          type: 'EXPENSE',
          amountCents: 30_000,
          tags: ['overhead'],
        }),
      ],
      { granularity: 'monthly' },
    );

    const { totals } = statement;
    expect(totals.grossProfitCents).toBe(60_000);
    expect(totals.netProfitCents).toBe(-20_000);
    expect(totals.grossMarginBps).toBe(6000); // 60.0%
    expect(totals.netMarginBps).toBe(-2000); // -20.0%
    expect(formatMarginPercent(totals.netMarginBps)).toBe('-20.0%');
  });

  it('returns null margins (N/A) when there is no revenue', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({
          date: '2024-03-10',
          type: 'EXPENSE',
          amountCents: 5_000,
          tags: ['overhead'],
        }),
      ],
      { granularity: 'monthly' },
    );

    const { totals } = statement;
    expect(totals.revenueCents).toBe(0);
    expect(totals.netProfitCents).toBe(-5_000);
    expect(totals.grossMarginBps).toBeNull();
    expect(totals.netMarginBps).toBeNull();
    expect(formatMarginPercent(totals.grossMarginBps)).toBe('N/A');
  });

  it('treats negative expense amounts as positive cost magnitudes', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({ date: '2024-01-05', type: 'INCOME', amountCents: 100_000 }),
        makeTransaction({
          date: '2024-01-06',
          type: 'EXPENSE',
          amountCents: -40_000,
          tags: ['cogs'],
        }),
      ],
      { granularity: 'monthly' },
    );

    expect(statement.totals.cogsCents).toBe(40_000);
    expect(statement.totals.grossProfitCents).toBe(60_000);
  });

  it('groups transactions into monthly periods sorted chronologically', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({ date: '2024-02-15', type: 'INCOME', amountCents: 200_000 }),
        makeTransaction({ date: '2024-01-15', type: 'INCOME', amountCents: 100_000 }),
        makeTransaction({
          date: '2024-01-20',
          type: 'EXPENSE',
          amountCents: 50_000,
          tags: ['cogs'],
        }),
      ],
      { granularity: 'monthly' },
    );

    expect(statement.periods.map((p) => p.key)).toEqual(['2024-01', '2024-02']);
    expect(statement.periods[0].label).toBe('Jan 2024');
    expect(statement.periods[0].revenueCents).toBe(100_000);
    expect(statement.periods[0].cogsCents).toBe(50_000);
    expect(statement.periods[1].revenueCents).toBe(200_000);
    // Combined totals span both periods.
    expect(statement.totals.revenueCents).toBe(300_000);
  });

  it('groups transactions into Monday-based weekly periods', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({ date: '2024-01-15', type: 'INCOME', amountCents: 100_000 }), // week of 01-15
        makeTransaction({
          date: '2024-01-18',
          type: 'EXPENSE',
          amountCents: 20_000,
          tags: ['cogs'],
        }), // same week
        makeTransaction({ date: '2024-01-23', type: 'INCOME', amountCents: 50_000 }), // week of 01-22
      ],
      { granularity: 'weekly' },
    );

    expect(statement.periods.map((p) => p.key)).toEqual(['2024-01-15', '2024-01-22']);
    expect(statement.periods[0].label).toBe('Week of 2024-01-15');
    expect(statement.periods[0].revenueCents).toBe(100_000);
    expect(statement.periods[0].cogsCents).toBe(20_000);
    expect(statement.periods[1].revenueCents).toBe(50_000);
  });

  it('excludes transactions outside the date range', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({ date: '2023-12-31', type: 'INCOME', amountCents: 999_999 }), // before range
        makeTransaction({ date: '2024-01-10', type: 'INCOME', amountCents: 100_000 }), // in range
        makeTransaction({ date: '2024-02-01', type: 'INCOME', amountCents: 999_999 }), // after range
      ],
      { granularity: 'monthly', startDate: '2024-01-01', endDate: '2024-01-31' },
    );

    expect(statement.totals.revenueCents).toBe(100_000);
    expect(statement.periods).toHaveLength(1);
  });

  it('ignores transfers and voided transactions', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({ date: '2024-01-05', type: 'INCOME', amountCents: 100_000 }),
        makeTransaction({ date: '2024-01-06', type: 'TRANSFER', amountCents: 500_000 }),
        makeTransaction({
          date: '2024-01-07',
          type: 'EXPENSE',
          amountCents: 999_999,
          status: 'VOID',
        }),
      ],
      { granularity: 'monthly' },
    );

    expect(statement.totals.revenueCents).toBe(100_000);
    expect(statement.totals.overheadCents).toBe(0);
    expect(statement.totals.transactionCount).toBe(1);
  });

  it('produces exact integer basis points for repeating ratios', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({ date: '2024-01-05', type: 'INCOME', amountCents: 10_000 }), // $100
        makeTransaction({
          date: '2024-01-06',
          type: 'EXPENSE',
          amountCents: 3_333,
          tags: ['cogs'],
        }),
      ],
      { granularity: 'monthly' },
    );

    expect(statement.totals.grossProfitCents).toBe(6_667);
    expect(statement.totals.grossMarginBps).toBe(6667); // exact integer, no float drift
    expect(Number.isInteger(statement.totals.grossMarginBps)).toBe(true);
    expect(formatMarginPercent(statement.totals.grossMarginBps)).toBe('66.7%');
  });

  it('defaults to monthly granularity', () => {
    const statement = buildProfitAndLoss([
      makeTransaction({ date: '2024-01-05', type: 'INCOME', amountCents: 100_000 }),
    ]);
    expect(statement.granularity).toBe('monthly');
    expect(statement.periods[0].key).toBe('2024-01');
  });

  it('returns empty periods and zeroed totals for no transactions', () => {
    const statement = buildProfitAndLoss([]);
    expect(statement.periods).toEqual([]);
    expect(statement.totals.revenueCents).toBe(0);
    expect(statement.totals.netProfitCents).toBe(0);
    expect(statement.totals.netMarginBps).toBeNull();
  });

  it('honours custom bucket tag overrides', () => {
    const statement = buildProfitAndLoss(
      [
        makeTransaction({ date: '2024-01-05', type: 'INCOME', amountCents: 100_000 }),
        makeTransaction({
          date: '2024-01-06',
          type: 'EXPENSE',
          amountCents: 25_000,
          tags: ['ingredients'],
        }),
      ],
      { granularity: 'monthly', cogsTags: ['ingredients'] },
    );

    expect(statement.totals.cogsCents).toBe(25_000);
    expect(statement.totals.overheadCents).toBe(0);
  });
});

describe('DEFAULT_PNL_TAGS', () => {
  it('exposes a marker list for every bucket', () => {
    expect(DEFAULT_PNL_TAGS.revenue.length).toBeGreaterThan(0);
    expect(DEFAULT_PNL_TAGS.cogs).toContain('cogs');
    expect(DEFAULT_PNL_TAGS.labor).toContain('payroll');
    expect(DEFAULT_PNL_TAGS.overhead).toContain('opex');
  });
});

describe('exportBusinessPnlCsv', () => {
  it('emits a header, one row per period, and an All periods totals row', () => {
    const csv = exportBusinessPnlCsv(
      buildProfitAndLoss([
        makeTransaction({ date: '2024-01-05', type: 'INCOME', amountCents: 100_000 }),
        makeTransaction({
          date: '2024-01-06',
          type: 'EXPENSE',
          amountCents: 30_000,
          tags: ['cogs'],
        }),
        makeTransaction({
          date: '2024-01-07',
          type: 'EXPENSE',
          amountCents: 20_000,
          tags: ['labor'],
        }),
        makeTransaction({ date: '2024-01-08', type: 'EXPENSE', amountCents: 10_000 }),
        makeTransaction({ date: '2024-02-05', type: 'INCOME', amountCents: 50_000 }),
      ]),
    );
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'Period,Revenue,COGS,Gross profit,Gross margin %,Labor,Overhead,Operating expenses,Net profit,Net margin %,Transactions',
    );
    expect(lines).toContain(
      'Jan 2024,1000.00,300.00,700.00,70.0,200.00,100.00,300.00,400.00,40.0,4',
    );
    expect(lines).toContain('Feb 2024,500.00,0.00,500.00,100.0,0.00,0.00,0.00,500.00,100.0,1');
    expect(lines[lines.length - 1]).toBe(
      'All periods,1500.00,300.00,1200.00,80.0,200.00,100.00,300.00,900.00,60.0,5',
    );
  });

  it('leaves both margins blank for a period with no revenue', () => {
    const csv = exportBusinessPnlCsv(
      buildProfitAndLoss([
        makeTransaction({ date: '2024-03-05', type: 'EXPENSE', amountCents: 5_000 }),
      ]),
    );

    expect(csv).toContain('Mar 2024,0.00,0.00,0.00,,0.00,50.00,50.00,-50.00,,1');
  });

  it('returns the header and an empty totals row for an empty statement', () => {
    const csv = exportBusinessPnlCsv(buildProfitAndLoss([]));

    expect(csv.split('\n')).toEqual([
      'Period,Revenue,COGS,Gross profit,Gross margin %,Labor,Overhead,Operating expenses,Net profit,Net margin %,Transactions',
      'All periods,0.00,0.00,0.00,,0.00,0.00,0.00,0.00,,0',
    ]);
  });
});
