// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  applyOverrides,
  buildImportableTransactions,
  buildP2PImportPlan,
  classifyRow,
  detectP2PProvider,
  netReimbursements,
  parseP2PCsv,
} from '../p2p-import';
import type { P2PParsedRow } from '../p2p-import-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VENMO_HEADER = 'Datetime,Type,Status,Note,From,To,Amount (total),Amount (fee)';

/** You front pizza, two friends Venmo you back. */
const VENMO_SPLIT_CSV = [
  VENMO_HEADER,
  '2024-01-10T18:00:00,Payment,Complete,Pizza night,Me,Joes Pizza,- $60.00,',
  '2024-01-11T09:00:00,Payment,Complete,pizza,Alice,Me,+ $20.00,',
  '2024-01-11T09:05:00,Payment,Complete,pizza,Bob,Me,+ $20.00,',
].join('\n');

/** Roommate back-and-forth: same counterparty pays you their half. */
const VENMO_ROOMMATE_CSV = [
  VENMO_HEADER,
  '2024-05-01T12:00:00,Payment,Complete,Groceries this week,Me,Pat,- $80.00,',
  '2024-05-03T12:00:00,Payment,Complete,my half,Pat,Me,+ $40.00,',
].join('\n');

const CASHAPP_HEADER =
  'Transaction ID,Date,Transaction Type,Currency,Amount,Fee,Net Amount,Status,Notes,Name of sender/receiver';

const CASHAPP_CSV = [
  CASHAPP_HEADER,
  'CA-1,2024-03-01,Sent P2P,USD,$45.00,$0.00,$45.00,COMPLETE,Dinner with crew,Joes Diner',
  'CA-2,2024-03-02,Received P2P,USD,$15.00,$0.00,$15.00,COMPLETE,dinner,Alex',
].join('\n');

const GENERIC_HEADER = 'date,description,counterparty,amount,type';

function parsedRow(overrides: Partial<P2PParsedRow>): P2PParsedRow {
  return {
    index: 0,
    provider: 'generic',
    date: '2024-01-01',
    note: '',
    counterparty: '',
    amountCents: -1000,
    feeCents: 0,
    flowType: 'payment',
    rawFields: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

describe('detectP2PProvider', () => {
  it('detects Venmo headers', () => {
    expect(detectP2PProvider(VENMO_HEADER.split(','))).toBe('venmo');
  });

  it('detects Cash App headers', () => {
    expect(detectP2PProvider(CASHAPP_HEADER.split(','))).toBe('cashapp');
  });

  it('falls back to generic when date and amount columns exist', () => {
    expect(detectP2PProvider(GENERIC_HEADER.split(','))).toBe('generic');
  });

  it('returns null for unrecognized headers', () => {
    expect(detectP2PProvider(['foo', 'bar', 'baz'])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

describe('parseP2PCsv', () => {
  it('parses Venmo rows with correct signs and counterparties', () => {
    const result = parseP2PCsv(VENMO_SPLIT_CSV);
    expect(result.provider).toBe('venmo');
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);

    const [outflow, inflow] = result.rows;
    expect(outflow.amountCents).toBe(-6000);
    expect(outflow.counterparty).toBe('Joes Pizza');
    expect(inflow.amountCents).toBe(2000);
    expect(inflow.counterparty).toBe('Alice');
  });

  it('uses the transaction-type direction hint for Cash App sent/received rows', () => {
    const result = parseP2PCsv(CASHAPP_CSV);
    expect(result.provider).toBe('cashapp');
    const [sent, received] = result.rows;
    expect(sent.amountCents).toBe(-4500); // "Sent P2P" forces an outflow
    expect(sent.counterparty).toBe('Joes Diner');
    expect(received.amountCents).toBe(1500); // "Received P2P" stays an inflow
    expect(received.counterparty).toBe('Alex');
  });

  it('collects malformed rows as errors instead of throwing', () => {
    const csv = [
      GENERIC_HEADER,
      ',payment,Someone,- $10.00,payment', // missing date
      '2024-07-01,bad amount,Someone,abc,payment', // unparseable amount
      '2024-07-02,good,Someone,- $5.00,payment',
    ].join('\n');

    const result = parseP2PCsv(csv);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toMatch(/date/i);
    expect(result.errors[1].message).toMatch(/amount/i);
    expect(result.rows).toHaveLength(1);
  });

  it('returns a provider of null and an error for unrecognized files', () => {
    const result = parseP2PCsv('foo,bar\n1,2');
    expect(result.provider).toBeNull();
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it('preserves integer cents with banker\u2019s rounding', () => {
    const csv = [
      GENERIC_HEADER,
      '2024-01-01,half even down,Cafe,1.225,payment',
      '2024-01-01,half even up,Cafe,1.235,payment',
      '2024-01-01,outflow,Cafe,-2.005,payment',
    ].join('\n');

    const { rows } = parseP2PCsv(csv);
    expect(rows[0].amountCents).toBe(122); // 1.225 -> 122 (round half to even)
    expect(rows[1].amountCents).toBe(124); // 1.235 -> 124
    expect(rows[2].amountCents).toBe(-200); // -2.005 -> -200
  });
});

// ---------------------------------------------------------------------------
// Classification heuristics
// ---------------------------------------------------------------------------

describe('classifyRow', () => {
  it('classifies a bank transfer flow type as a transfer', () => {
    const row = parsedRow({ flowType: 'transfer', amountCents: -20000, note: 'Standard Transfer' });
    expect(classifyRow(row).classification).toBe('transfer');
  });

  it('classifies a note with cash-out wording as a transfer', () => {
    const row = parsedRow({ note: 'Cash out to bank', amountCents: -5000 });
    expect(classifyRow(row).classification).toBe('transfer');
  });

  it('detects self-transfers via selfNames', () => {
    const row = parsedRow({ counterparty: 'Jamie Self', amountCents: 30000, note: 'moving money' });
    const result = classifyRow(row, { selfNames: ['Jamie Self'] });
    expect(result.classification).toBe('transfer');
    expect(result.reasons.join(' ')).toMatch(/self-transfer/i);
  });

  it('classifies an incoming payment with a split note as a reimbursement', () => {
    const row = parsedRow({ amountCents: 2500, note: 'split the uber' });
    expect(classifyRow(row).classification).toBe('reimbursement');
  });

  it('classifies a paid request (inflow) as a reimbursement', () => {
    const row = parsedRow({ amountCents: 4000, flowType: 'request', note: 'tickets' });
    const result = classifyRow(row);
    expect(result.classification).toBe('reimbursement');
    expect(result.confidence).toBeGreaterThanOrEqual(80);
  });

  it('treats an unexplained inflow as a reimbursement by default', () => {
    const row = parsedRow({ amountCents: 1000, note: '' });
    expect(classifyRow(row).classification).toBe('reimbursement');
  });

  it('classifies a plain outgoing payment as spending', () => {
    const row = parsedRow({ amountCents: -3000, note: 'Hardware store' });
    expect(classifyRow(row).classification).toBe('spending');
  });

  it('keeps an outgoing "split" payment as spending (you fronted it)', () => {
    const row = parsedRow({ amountCents: -10000, note: 'Dinner split' });
    expect(classifyRow(row).classification).toBe('spending');
  });

  it('classifies an outgoing "my half" payment as a reimbursement pass-through', () => {
    const row = parsedRow({ amountCents: -50000, note: 'my half of rent' });
    expect(classifyRow(row).classification).toBe('reimbursement');
  });

  it('always returns human-readable reasons (no color-only signaling)', () => {
    const row = parsedRow({ amountCents: -3000, note: 'coffee' });
    expect(classifyRow(row).reasons.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Netting / pairing
// ---------------------------------------------------------------------------

describe('netReimbursements', () => {
  it('nets reimbursement inflows against a spend by overlapping note', () => {
    const rows = [
      {
        index: 0,
        date: '2024-01-10',
        note: 'Pizza night',
        counterparty: 'Joes Pizza',
        amountCents: -6000,
        effectiveClassification: 'spending' as const,
      },
      {
        index: 1,
        date: '2024-01-11',
        note: 'pizza',
        counterparty: 'Alice',
        amountCents: 2000,
        effectiveClassification: 'reimbursement' as const,
      },
      {
        index: 2,
        date: '2024-01-11',
        note: 'pizza',
        counterparty: 'Bob',
        amountCents: 2000,
        effectiveClassification: 'reimbursement' as const,
      },
    ];

    const { groups } = netReimbursements(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIndices).toEqual([1, 2]);
    expect(groups[0].grossSpendingCents).toBe(6000);
    expect(groups[0].reimbursedCents).toBe(4000);
    expect(groups[0].netSpendingCents).toBe(2000);
  });

  it('pairs by counterparty even when the notes differ', () => {
    const rows = [
      {
        index: 0,
        date: '2024-05-01',
        note: 'Groceries this week',
        counterparty: 'Pat',
        amountCents: -8000,
        effectiveClassification: 'spending' as const,
      },
      {
        index: 1,
        date: '2024-05-03',
        note: 'my half',
        counterparty: 'Pat',
        amountCents: 4000,
        effectiveClassification: 'reimbursement' as const,
      },
    ];

    const { groups, groupByIndex } = netReimbursements(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].netSpendingCents).toBe(4000);
    expect(groupByIndex.get(0)).toBe('net-0');
    expect(groupByIndex.get(1)).toBe('net-0');
  });

  it('does not pair a reimbursement that precedes the spend', () => {
    const rows = [
      {
        index: 0,
        date: '2024-01-20',
        note: 'dinner',
        counterparty: 'Cafe',
        amountCents: -5000,
        effectiveClassification: 'spending' as const,
      },
      {
        index: 1,
        date: '2024-01-01',
        note: 'dinner',
        counterparty: 'Cafe',
        amountCents: 2500,
        effectiveClassification: 'reimbursement' as const,
      },
    ];
    expect(netReimbursements(rows).groups).toHaveLength(0);
  });

  it('does not pair beyond the matching window', () => {
    const rows = [
      {
        index: 0,
        date: '2024-01-01',
        note: 'dinner',
        counterparty: 'Cafe',
        amountCents: -5000,
        effectiveClassification: 'spending' as const,
      },
      {
        index: 1,
        date: '2024-03-01',
        note: 'dinner',
        counterparty: 'Cafe',
        amountCents: 2500,
        effectiveClassification: 'reimbursement' as const,
      },
    ];
    expect(netReimbursements(rows, { windowDays: 30 }).groups).toHaveLength(0);
  });

  it('clamps net spend to zero and records over-reimbursement', () => {
    const rows = [
      {
        index: 0,
        date: '2024-01-01',
        note: 'concert tickets',
        counterparty: 'Box Office',
        amountCents: -3000,
        effectiveClassification: 'spending' as const,
      },
      {
        index: 1,
        date: '2024-01-02',
        note: 'concert tickets',
        counterparty: 'Sam',
        amountCents: 5000,
        effectiveClassification: 'reimbursement' as const,
      },
    ];
    const { groups } = netReimbursements(rows);
    expect(groups[0].netSpendingCents).toBe(0);
    expect(groups[0].overReimbursedCents).toBe(2000);
  });

  it('leaves an unmatched request reimbursement standalone', () => {
    const rows = [
      {
        index: 0,
        date: '2024-08-01',
        note: 'concert tickets',
        counterparty: 'Taylor',
        amountCents: 5000,
        effectiveClassification: 'reimbursement' as const,
      },
    ];
    const { groups, groupByIndex } = netReimbursements(rows);
    expect(groups).toHaveLength(0);
    expect(groupByIndex.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Full plan
// ---------------------------------------------------------------------------

describe('buildP2PImportPlan', () => {
  it('builds a netted plan for a Venmo split', () => {
    const plan = buildP2PImportPlan(VENMO_SPLIT_CSV);
    expect(plan.provider).toBe('venmo');
    expect(plan.groups).toHaveLength(1);
    expect(plan.summary.grossSpendingCents).toBe(6000);
    expect(plan.summary.reimbursementCents).toBe(4000);
    expect(plan.summary.netSpendingCents).toBe(2000);
    expect(plan.summary.excludedFromBudgetCents).toBe(4000);
    expect(plan.summary.spendingCount).toBe(1);
    expect(plan.summary.reimbursementCount).toBe(2);

    const anchor = plan.rows[0];
    expect(anchor.effectiveClassification).toBe('spending');
    expect(anchor.netGroupId).toBe('net-0');
    expect(plan.rows[1].excludedFromBudget).toBe(true);
  });

  it('builds a netted plan for a Cash App export', () => {
    const plan = buildP2PImportPlan(CASHAPP_CSV);
    expect(plan.provider).toBe('cashapp');
    expect(plan.summary.netSpendingCents).toBe(3000);
    expect(plan.groups[0].reimbursedCents).toBe(1500);
  });

  it('pairs the roommate reimbursement by counterparty', () => {
    const plan = buildP2PImportPlan(VENMO_ROOMMATE_CSV);
    expect(plan.groups).toHaveLength(1);
    expect(plan.summary.netSpendingCents).toBe(4000);
  });

  it('surfaces parse errors on the plan', () => {
    const plan = buildP2PImportPlan('foo,bar\n1,2');
    expect(plan.provider).toBeNull();
    expect(plan.errors).toHaveLength(1);
    expect(plan.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

describe('applyOverrides', () => {
  it('reclassifies a default inflow as spending when overridden', () => {
    const base = buildP2PImportPlan(VENMO_SPLIT_CSV);
    const updated = applyOverrides(base, { 1: 'spending' });
    expect(updated.rows[1].effectiveClassification).toBe('spending');
    expect(updated.rows[1].excludedFromBudget).toBe(false);
    // The remaining reimbursement no longer fully nets the pizza spend.
    expect(updated.summary.reimbursementCount).toBe(1);
  });

  it('keeps a split-with-friends inflow excluded as a reimbursement', () => {
    const base = buildP2PImportPlan(VENMO_SPLIT_CSV);
    const updated = applyOverrides(base, { 1: 'split-with-friends' });
    expect(updated.rows[1].effectiveClassification).toBe('reimbursement');
    expect(updated.rows[1].override).toBe('split-with-friends');
  });

  it('marks an outgoing payment as a roommate reimbursement', () => {
    const csv = [
      VENMO_HEADER,
      '2024-09-01T10:00:00,Payment,Complete,rent,Me,Landlord,- $1200.00,',
    ].join('\n');
    const base = buildP2PImportPlan(csv);
    expect(base.rows[0].effectiveClassification).toBe('spending');

    const updated = applyOverrides(base, { 0: 'roommate-reimbursement' });
    expect(updated.rows[0].effectiveClassification).toBe('reimbursement');
    expect(updated.rows[0].excludedFromBudget).toBe(true);
    expect(updated.summary.netSpendingCents).toBe(0);
  });

  it('treats an outgoing split-with-friends payment as fronted spending', () => {
    const csv = [
      VENMO_HEADER,
      '2024-09-01T10:00:00,Payment,Complete,group gift,Me,Store,- $90.00,',
    ].join('\n');
    const base = buildP2PImportPlan(csv);
    const updated = applyOverrides(base, { 0: 'split-with-friends' });
    expect(updated.rows[0].effectiveClassification).toBe('spending');
  });
});

// ---------------------------------------------------------------------------
// Importable transactions
// ---------------------------------------------------------------------------

describe('buildImportableTransactions', () => {
  it('emits net spending transactions and excludes reimbursements/transfers', () => {
    const plan = buildP2PImportPlan(VENMO_SPLIT_CSV);
    const importable = buildImportableTransactions(plan);
    expect(importable).toHaveLength(1);
    expect(importable[0].amountCents).toBe(-2000);
    expect(importable[0].reimbursedCents).toBe(4000);
    expect(importable[0].isNetted).toBe(true);
  });

  it('omits a fully reimbursed spend (net zero)', () => {
    const csv = [
      VENMO_HEADER,
      '2024-01-10T18:00:00,Payment,Complete,Pizza night,Me,Joes Pizza,- $40.00,',
      '2024-01-11T09:00:00,Payment,Complete,pizza,Alice,Me,+ $20.00,',
      '2024-01-11T09:05:00,Payment,Complete,pizza,Bob,Me,+ $20.00,',
    ].join('\n');
    const plan = buildP2PImportPlan(csv);
    expect(plan.summary.netSpendingCents).toBe(0);
    expect(buildImportableTransactions(plan)).toHaveLength(0);
  });
});
