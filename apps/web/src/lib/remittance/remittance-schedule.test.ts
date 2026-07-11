// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { RemittanceRecord } from './remittance-types';
import {
  advanceRemittanceDate,
  projectUpcomingRemittances,
  remittanceTotalPaidMinor,
} from './remittance-schedule';

function makeRecord(overrides: Partial<RemittanceRecord> = {}): RemittanceRecord {
  return {
    id: overrides.id ?? 'rem-1',
    date: overrides.date ?? '2024-01-01',
    sourceCurrency: overrides.sourceCurrency ?? 'USD',
    destCurrency: overrides.destCurrency ?? 'MXN',
    sendAmountMinor: overrides.sendAmountMinor ?? 50000,
    feeMinor: overrides.feeMinor ?? 500,
    fxRate: overrides.fxRate ?? 17,
    feeModel: overrides.feeModel ?? 'ADDITIVE',
    referenceRate: overrides.referenceRate ?? null,
    recipient: overrides.recipient ?? { name: 'Family', country: 'MX' },
    note: overrides.note ?? null,
    recurrence: overrides.recurrence ?? null,
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00Z',
  };
}

describe('remittanceTotalPaidMinor', () => {
  it('adds the fee on top for an additive fee', () => {
    expect(
      remittanceTotalPaidMinor({ sendAmountMinor: 50000, feeMinor: 500, feeModel: 'ADDITIVE' }),
    ).toBe(50500);
  });

  it('leaves the send amount unchanged for an inclusive fee', () => {
    expect(
      remittanceTotalPaidMinor({ sendAmountMinor: 50000, feeMinor: 500, feeModel: 'INCLUSIVE' }),
    ).toBe(50000);
  });

  it('never returns a negative amount', () => {
    expect(
      remittanceTotalPaidMinor({ sendAmountMinor: -100, feeMinor: -5, feeModel: 'ADDITIVE' }),
    ).toBe(0);
  });
});

describe('advanceRemittanceDate', () => {
  it('advances weekly and biweekly by whole days', () => {
    expect(advanceRemittanceDate('2024-01-01', 'weekly')).toBe('2024-01-08');
    expect(advanceRemittanceDate('2024-01-01', 'biweekly')).toBe('2024-01-15');
  });

  it('advances monthly, quarterly and yearly by calendar months', () => {
    expect(advanceRemittanceDate('2024-01-15', 'monthly')).toBe('2024-02-15');
    expect(advanceRemittanceDate('2024-01-15', 'quarterly')).toBe('2024-04-15');
    expect(advanceRemittanceDate('2024-01-15', 'yearly')).toBe('2025-01-15');
  });

  it('clamps month-end overflow (Jan 31 + 1 month = Feb 29 in a leap year)', () => {
    expect(advanceRemittanceDate('2024-01-31', 'monthly')).toBe('2024-02-29');
    expect(advanceRemittanceDate('2023-01-31', 'monthly')).toBe('2023-02-28');
  });
});

describe('projectUpcomingRemittances', () => {
  it('ignores one-off remittances', () => {
    const records = [makeRecord({ recurrence: null })];
    expect(projectUpcomingRemittances(records, '2024-01-01', '2024-12-31')).toEqual([]);
  });

  it('projects monthly occurrences within the window in date order', () => {
    const records = [
      makeRecord({
        id: 'rem-monthly',
        recurrence: { frequency: 'monthly', nextDate: '2024-02-01' },
      }),
    ];
    const upcoming = projectUpcomingRemittances(records, '2024-02-01', '2024-04-30');
    expect(upcoming.map((u) => u.date)).toEqual(['2024-02-01', '2024-03-01', '2024-04-01']);
    expect(upcoming[0].totalPaidMinor).toBe(50500);
  });

  it('skips occurrences before the from date', () => {
    const records = [
      makeRecord({ recurrence: { frequency: 'weekly', nextDate: '2024-01-01' } }),
    ];
    const upcoming = projectUpcomingRemittances(records, '2024-01-15', '2024-01-31');
    expect(upcoming.map((u) => u.date)).toEqual(['2024-01-15', '2024-01-22', '2024-01-29']);
  });

  it('merges and sorts occurrences across multiple recurring remittances', () => {
    const records = [
      makeRecord({ id: 'a', recurrence: { frequency: 'monthly', nextDate: '2024-02-10' } }),
      makeRecord({ id: 'b', recurrence: { frequency: 'monthly', nextDate: '2024-02-01' } }),
    ];
    const upcoming = projectUpcomingRemittances(records, '2024-02-01', '2024-02-28');
    expect(upcoming.map((u) => u.date)).toEqual(['2024-02-01', '2024-02-10']);
  });
});
