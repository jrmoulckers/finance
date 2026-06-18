// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  createTransactionTimestampContext,
  getMerchantLocalDate,
  getTimeZoneOffsetMinutes,
} from './transaction-timestamp-context';

describe('transaction-timestamp-context', () => {
  it('preserves merchant-local day for late-night travel transactions', () => {
    const instant = '2026-02-01T16:50:00.000Z';

    expect(getMerchantLocalDate(instant, 'Asia/Bangkok')).toBe('2026-02-01');
    expect(getMerchantLocalDate(instant, 'Europe/Lisbon')).toBe('2026-02-01');
    expect(getTimeZoneOffsetMinutes(instant, 'Asia/Bangkok')).toBe(420);
  });

  it('keeps legacy date-only transactions from shifting', () => {
    expect(
      createTransactionTimestampContext({ occurredAt: null, legacyDate: '2026-02-01' }),
    ).toEqual({
      occurredAt: null,
      occurredTimeZone: null,
      occurredOffsetMinutes: null,
      merchantLocalDate: '2026-02-01',
      isDateOnlyLegacy: true,
    });
  });

  it('captures import instants with offset and timezone context', () => {
    expect(
      createTransactionTimestampContext({
        occurredAt: '2026-02-01T23:50:00+07:00',
        occurredTimeZone: 'Asia/Bangkok',
      }),
    ).toMatchObject({
      occurredAt: '2026-02-01T16:50:00.000Z',
      occurredTimeZone: 'Asia/Bangkok',
      occurredOffsetMinutes: 420,
      merchantLocalDate: '2026-02-01',
      isDateOnlyLegacy: false,
    });
  });
});
