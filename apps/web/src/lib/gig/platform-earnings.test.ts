// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the gig-platform earnings engine: rule matching, period bucketing,
 * banker's rounding, reconciliation, and edge cases.
 *
 * References: issue #2133
 */

import { describe, it, expect } from 'vitest';
import {
  bankersRound,
  computePeriodBounds,
  computePlatformEarnings,
  DEFAULT_GIG_PLATFORM_RULES,
  matchTransactionPlatform,
  platformPercent,
  reconcilePlatformPayouts,
} from './platform-earnings';
import type { ExpectedPayout, GigPlatformRule } from './platform-types';
import type { Transaction } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTx(opts: {
  id?: string;
  date: string;
  type?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amountCents: number;
  payee?: string | null;
  note?: string | null;
  statementDescription?: string | null;
  counterpartyName?: string | null;
  accountId?: string;
}): Transaction {
  return {
    id: opts.id ?? crypto.randomUUID(),
    householdId: 'hh-1',
    accountId: opts.accountId ?? 'acct-1',
    categoryId: null,
    type: opts.type ?? 'INCOME',
    status: 'CLEARED',
    amount: { amount: opts.amountCents },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: opts.payee ?? null,
    note: opts.note ?? null,
    date: opts.date,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: opts.statementDescription ?? null,
    customFields: null,
    extraNotes: null,
    counterpartyName: opts.counterpartyName ?? null,
    counterpartyAccountId: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  } as Transaction;
}

// A fixed Wednesday so week/month boundaries are deterministic.
// 2024-01-01 is a Monday → 2024-01-15 is a Monday, 2024-01-17 is a Wednesday.
const REF = new Date(2024, 0, 17, 12, 0, 0);

// ---------------------------------------------------------------------------
// Banker's rounding
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds halves to the nearest even integer', () => {
    expect(bankersRound(0.5)).toBe(0);
    expect(bankersRound(1.5)).toBe(2);
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
  });

  it('rounds non-halves normally', () => {
    expect(bankersRound(2.4)).toBe(2);
    expect(bankersRound(2.6)).toBe(3);
    expect(bankersRound(0)).toBe(0);
  });

  it('handles negative values symmetrically', () => {
    expect(bankersRound(-0.5)).toBe(0);
    expect(bankersRound(-1.5)).toBe(-2);
    expect(bankersRound(-2.5)).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// Rule matching
// ---------------------------------------------------------------------------

describe('matchTransactionPlatform', () => {
  it('matches the built-in platforms by payee (case-insensitive)', () => {
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, payee: 'UBER BV' }),
        DEFAULT_GIG_PLATFORM_RULES,
      ),
    ).toBe('Uber');
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, payee: 'DoorDash Inc' }),
        DEFAULT_GIG_PLATFORM_RULES,
      ),
    ).toBe('DoorDash');
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, payee: 'instacart' }),
        DEFAULT_GIG_PLATFORM_RULES,
      ),
    ).toBe('Instacart');
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, payee: 'LYFT, INC.' }),
        DEFAULT_GIG_PLATFORM_RULES,
      ),
    ).toBe('Lyft');
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, payee: 'Grub Hub' }),
        DEFAULT_GIG_PLATFORM_RULES,
      ),
    ).toBe('Grubhub');
  });

  it('matches the DoorDash "dasher" alias and the Instacart "maplebear" alias', () => {
    expect(
      matchTransactionPlatform(
        makeTx({
          date: '2024-01-17',
          amountCents: 1,
          statementDescription: 'DASHER DIRECT DEPOSIT',
        }),
        DEFAULT_GIG_PLATFORM_RULES,
      ),
    ).toBe('DoorDash');
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, counterpartyName: 'Maplebear Inc' }),
        DEFAULT_GIG_PLATFORM_RULES,
      ),
    ).toBe('Instacart');
  });

  it('returns null when nothing matches', () => {
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, payee: 'ACME Payroll' }),
        DEFAULT_GIG_PLATFORM_RULES,
      ),
    ).toBeNull();
  });

  it('respects the matchField — a payee-only rule ignores the description', () => {
    const rule: GigPlatformRule = {
      id: 'r1',
      platform: 'Spark',
      matchField: 'payee',
      keywords: ['spark'],
      enabled: true,
      isBuiltIn: false,
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, note: 'spark driver' }),
        [rule],
      ),
    ).toBeNull();
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, payee: 'Spark Driver' }),
        [rule],
      ),
    ).toBe('Spark');
  });

  it('matches against the account name for account-field rules', () => {
    const rule: GigPlatformRule = {
      id: 'r2',
      platform: 'Uber',
      matchField: 'account',
      keywords: ['rideshare'],
      enabled: true,
      isBuiltIn: false,
      createdAt: '2024-01-01T00:00:00Z',
    };
    const accountNames = new Map([['acct-9', 'Rideshare Checking']]);
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, accountId: 'acct-9' }),
        [rule],
        accountNames,
      ),
    ).toBe('Uber');
  });

  it('skips disabled rules', () => {
    const rule: GigPlatformRule = {
      id: 'r3',
      platform: 'Uber',
      matchField: 'any',
      keywords: ['uber'],
      enabled: false,
      isBuiltIn: false,
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(
      matchTransactionPlatform(makeTx({ date: '2024-01-17', amountCents: 1, payee: 'Uber' }), [
        rule,
      ]),
    ).toBeNull();
  });

  it('with overlapping rules the FIRST enabled match wins', () => {
    const userRule: GigPlatformRule = {
      id: 'user',
      platform: 'Uber Eats',
      matchField: 'any',
      keywords: ['uber eats'],
      enabled: true,
      isBuiltIn: false,
      createdAt: '2024-01-02T00:00:00Z',
    };
    // user rule placed first → takes precedence over the built-in "uber" rule
    const rules = [userRule, ...DEFAULT_GIG_PLATFORM_RULES];
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, payee: 'UBER EATS' }),
        rules,
      ),
    ).toBe('Uber Eats');
    // a plain Uber payout still falls through to the built-in
    expect(
      matchTransactionPlatform(
        makeTx({ date: '2024-01-17', amountCents: 1, payee: 'UBER BV' }),
        rules,
      ),
    ).toBe('Uber');
  });
});

// ---------------------------------------------------------------------------
// Period bucketing
// ---------------------------------------------------------------------------

describe('computePeriodBounds', () => {
  it('computes the Monday-start week containing the reference date', () => {
    const bounds = computePeriodBounds(REF, 1);
    expect(bounds.weekStart).toBe(new Date(2024, 0, 15).getTime());
    expect(bounds.weekEnd).toBe(new Date(2024, 0, 21).getTime());
    expect(bounds.monthStart).toBe(new Date(2024, 0, 1).getTime());
    expect(bounds.monthEnd).toBe(new Date(2024, 0, 31).getTime());
    expect(bounds.todayStart).toBe(new Date(2024, 0, 17).getTime());
  });

  it('supports a Sunday-start week', () => {
    const bounds = computePeriodBounds(REF, 0);
    expect(bounds.weekStart).toBe(new Date(2024, 0, 14).getTime());
    expect(bounds.weekEnd).toBe(new Date(2024, 0, 20).getTime());
  });
});

describe('computePlatformEarnings — period bucketing', () => {
  const rules = DEFAULT_GIG_PLATFORM_RULES;

  it('buckets transactions into today / week / month across boundaries', () => {
    const txns = [
      makeTx({ date: '2024-01-17', amountCents: 5000, payee: 'Uber' }), // today + week + month
      makeTx({ date: '2024-01-15', amountCents: 3000, payee: 'Uber' }), // week + month (Mon)
      makeTx({ date: '2024-01-21', amountCents: 2000, payee: 'Uber' }), // week + month (Sun end)
      makeTx({ date: '2024-01-10', amountCents: 1000, payee: 'Uber' }), // month only
      makeTx({ date: '2024-01-14', amountCents: 700, payee: 'Uber' }), // month only (prev Sun)
      makeTx({ date: '2023-12-31', amountCents: 9999, payee: 'Uber' }), // outside all windows
      makeTx({ date: '2024-02-01', amountCents: 8888, payee: 'Uber' }), // outside all windows
    ];

    const result = computePlatformEarnings(txns, rules, { referenceDate: REF, weekStartsOn: 1 });
    const uber = result.platforms.find((p) => p.platform === 'Uber');
    expect(uber).toBeDefined();
    expect(uber?.amounts.today).toBe(5000);
    expect(uber?.amounts.week).toBe(5000 + 3000 + 2000);
    expect(uber?.amounts.month).toBe(5000 + 3000 + 2000 + 1000 + 700);
    expect(uber?.counts.today).toBe(1);
    expect(uber?.counts.week).toBe(3);
    expect(uber?.counts.month).toBe(5);

    expect(result.combined.today).toBe(5000);
    expect(result.combined.week).toBe(10000);
    expect(result.combined.month).toBe(11700);
  });

  it('ignores EXPENSE and TRANSFER transactions', () => {
    const txns = [
      makeTx({ date: '2024-01-17', amountCents: 5000, payee: 'Uber', type: 'INCOME' }),
      makeTx({ date: '2024-01-17', amountCents: 4000, payee: 'Uber', type: 'EXPENSE' }),
      makeTx({ date: '2024-01-17', amountCents: 3000, payee: 'Uber', type: 'TRANSFER' }),
    ];
    const result = computePlatformEarnings(txns, rules, { referenceDate: REF });
    expect(result.combined.today).toBe(5000);
  });

  it('groups unmapped income under "Other" and sorts it last', () => {
    const txns = [
      makeTx({ date: '2024-01-17', amountCents: 1000, payee: 'Mystery LLC' }),
      makeTx({ date: '2024-01-17', amountCents: 9000, payee: 'Uber' }),
    ];
    const result = computePlatformEarnings(txns, rules, { referenceDate: REF });
    expect(result.platforms.map((p) => p.platform)).toEqual(['Uber', 'Other']);
    const other = result.platforms.find((p) => p.platform === 'Other');
    expect(other?.amounts.today).toBe(1000);
  });

  it('sorts platforms by month earnings descending', () => {
    const txns = [
      makeTx({ date: '2024-01-17', amountCents: 2000, payee: 'Lyft' }),
      makeTx({ date: '2024-01-17', amountCents: 5000, payee: 'Uber' }),
      makeTx({ date: '2024-01-17', amountCents: 3000, payee: 'DoorDash' }),
    ];
    const result = computePlatformEarnings(txns, rules, { referenceDate: REF });
    expect(result.platforms.map((p) => p.platform)).toEqual(['Uber', 'DoorDash', 'Lyft']);
  });

  it('returns empty totals when there are no transactions', () => {
    const result = computePlatformEarnings([], rules, { referenceDate: REF });
    expect(result.platforms).toHaveLength(0);
    expect(result.combined).toEqual({ today: 0, week: 0, month: 0 });
  });

  it('ignores malformed dates', () => {
    const txns = [makeTx({ date: 'not-a-date', amountCents: 1234, payee: 'Uber' })];
    const result = computePlatformEarnings(txns, rules, { referenceDate: REF });
    expect(result.platforms).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

describe('platformPercent', () => {
  it('computes a banker-rounded percent of the period total', () => {
    const txns = [
      makeTx({ date: '2024-01-17', amountCents: 2500, payee: 'Uber' }),
      makeTx({ date: '2024-01-17', amountCents: 7500, payee: 'Lyft' }),
    ];
    const result = computePlatformEarnings(txns, DEFAULT_GIG_PLATFORM_RULES, {
      referenceDate: REF,
    });
    const uber = result.platforms.find((p) => p.platform === 'Uber')!;
    const lyft = result.platforms.find((p) => p.platform === 'Lyft')!;
    expect(platformPercent(uber, result, 'today')).toBe(25);
    expect(platformPercent(lyft, result, 'today')).toBe(75);
  });

  it('returns 0 when the period total is zero', () => {
    const result = computePlatformEarnings([], DEFAULT_GIG_PLATFORM_RULES, { referenceDate: REF });
    const fake = {
      platform: 'Uber',
      amounts: { today: 0, week: 0, month: 0 },
      counts: { today: 0, week: 0, month: 0 },
    };
    expect(platformPercent(fake, result, 'today')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

describe('reconcilePlatformPayouts', () => {
  const rules = DEFAULT_GIG_PLATFORM_RULES;

  function resultFor(amountCents: number, platform = 'Uber') {
    return computePlatformEarnings(
      [makeTx({ date: '2024-01-17', amountCents, payee: platform })],
      rules,
      { referenceDate: REF },
    );
  }

  it('reports "matched" when received equals expected', () => {
    const expected: ExpectedPayout[] = [{ platform: 'Uber', expectedCents: 5000 }];
    const rows = reconcilePlatformPayouts(expected, resultFor(5000));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'matched', varianceCents: 0, receivedCents: 5000 });
  });

  it('reports "under" when received is less than expected', () => {
    const expected: ExpectedPayout[] = [{ platform: 'Uber', expectedCents: 5000 }];
    const rows = reconcilePlatformPayouts(expected, resultFor(4200));
    expect(rows[0].status).toBe('under');
    expect(rows[0].varianceCents).toBe(-800);
  });

  it('reports "over" when received exceeds expected', () => {
    const expected: ExpectedPayout[] = [{ platform: 'Uber', expectedCents: 5000 }];
    const rows = reconcilePlatformPayouts(expected, resultFor(5300));
    expect(rows[0].status).toBe('over');
    expect(rows[0].varianceCents).toBe(300);
  });

  it('reports "pending" when nothing has been received yet', () => {
    const expected: ExpectedPayout[] = [{ platform: 'Lyft', expectedCents: 5000 }];
    const rows = reconcilePlatformPayouts(expected, resultFor(5000, 'Uber'));
    const lyft = rows.find((r) => r.platform === 'Lyft');
    expect(lyft?.status).toBe('pending');
    expect(lyft?.receivedCents).toBe(0);
  });

  it('treats variance within tolerance as matched', () => {
    const expected: ExpectedPayout[] = [{ platform: 'Uber', expectedCents: 5000 }];
    const rows = reconcilePlatformPayouts(expected, resultFor(5002), { toleranceCents: 5 });
    expect(rows[0].status).toBe('matched');
  });

  it('includes platforms with deposits but no expected entry', () => {
    const rows = reconcilePlatformPayouts([], resultFor(5000));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ platform: 'Uber', expectedCents: 0, status: 'over' });
  });

  it('omits rows with neither expected nor received amount', () => {
    const expected: ExpectedPayout[] = [{ platform: 'Grubhub', expectedCents: 0 }];
    const rows = reconcilePlatformPayouts(expected, resultFor(5000, 'Uber'));
    expect(rows.find((r) => r.platform === 'Grubhub')).toBeUndefined();
  });

  it('reconciles against the requested period', () => {
    const txns = [
      makeTx({ date: '2024-01-17', amountCents: 1000, payee: 'Uber' }), // today + week + month
      makeTx({ date: '2024-01-10', amountCents: 4000, payee: 'Uber' }), // month only
    ];
    const result = computePlatformEarnings(txns, rules, { referenceDate: REF });
    const expected: ExpectedPayout[] = [{ platform: 'Uber', expectedCents: 5000 }];

    const todayRows = reconcilePlatformPayouts(expected, result, { period: 'today' });
    expect(todayRows[0].receivedCents).toBe(1000);
    expect(todayRows[0].status).toBe('under');

    const monthRows = reconcilePlatformPayouts(expected, result, { period: 'month' });
    expect(monthRows[0].receivedCents).toBe(5000);
    expect(monthRows[0].status).toBe('matched');
  });
});
