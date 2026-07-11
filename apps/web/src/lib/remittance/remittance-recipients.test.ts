// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { deriveSavedRecipients } from './remittance-recipients';
import type { RemittanceRecord } from './remittance-types';

function record(overrides: Partial<RemittanceRecord>): RemittanceRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    date: overrides.date ?? '2026-01-01',
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
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('deriveSavedRecipients', () => {
  it('returns an empty list when there is no history', () => {
    expect(deriveSavedRecipients([])).toEqual([]);
  });

  it('de-duplicates by name + country and counts transfers', () => {
    const recipients = deriveSavedRecipients([
      record({ date: '2026-01-01', recipient: { name: 'Wei', country: 'CN' } }),
      record({ date: '2026-02-01', recipient: { name: 'Wei', country: 'CN' } }),
      record({ date: '2026-01-15', recipient: { name: 'Family', country: 'MX' } }),
    ]);

    expect(recipients).toHaveLength(2);
    const wei = recipients.find((r) => r.name === 'Wei');
    expect(wei?.count).toBe(2);
  });

  it('adopts the corridor from the most recent transfer to a recipient', () => {
    const recipients = deriveSavedRecipients([
      record({
        date: '2026-01-01',
        recipient: { name: 'Wei', country: 'CN' },
        sourceCurrency: 'USD',
        destCurrency: 'MXN',
      }),
      record({
        date: '2026-03-01',
        recipient: { name: 'Wei', country: 'CN' },
        sourceCurrency: 'USD',
        destCurrency: 'CNY',
      }),
    ]);

    expect(recipients[0]).toMatchObject({
      name: 'Wei',
      destCurrency: 'CNY',
      lastDate: '2026-03-01',
    });
  });

  it('sorts most-recent-first so the likely next recipient leads', () => {
    const recipients = deriveSavedRecipients([
      record({ date: '2026-01-01', recipient: { name: 'Older', country: 'MX' } }),
      record({ date: '2026-05-01', recipient: { name: 'Newer', country: 'CN' } }),
    ]);

    expect(recipients.map((r) => r.name)).toEqual(['Newer', 'Older']);
  });

  it('ignores records with a blank recipient name', () => {
    const recipients = deriveSavedRecipients([
      record({ recipient: { name: '   ', country: 'MX' } }),
    ]);
    expect(recipients).toEqual([]);
  });
});
