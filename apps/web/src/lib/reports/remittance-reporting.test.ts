// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildRemittanceMetadata, summarizeMonthlyRemittances } from './remittance-reporting';

describe('remittance reporting', () => {
  it('stores integer minor units and calculates fee-inclusive rates', () => {
    const remittance = buildRemittanceMetadata({
      transactionId: 'tx-1',
      sentAt: '2026-01-10',
      sendAmountMinor: 10_000,
      sendCurrency: 'USD',
      feeAmountMinor: 500,
      provider: 'Provider',
      recipient: 'Family',
      corridor: 'US-MX',
      receivedAmountMinor: 170_000,
      receivedCurrency: 'MXN',
      rateTimestamp: '2026-01-10T12:00:00Z',
    });

    expect(remittance.exchangeRate).toBe(17);
    expect(remittance.effectiveRateIncludingFee).toBe(16.190476);
    expect(remittance.customFields.remittanceFeeAmountMinor).toBe(500);
  });

  it('summarizes monthly totals by recipient and corridor', () => {
    const remittances = [
      buildRemittanceMetadata({
        transactionId: 'tx-1',
        sentAt: '2026-01-10',
        sendAmountMinor: 10_000,
        sendCurrency: 'USD',
        feeAmountMinor: 500,
        provider: 'A',
        recipient: 'Family',
        corridor: 'US-MX',
        receivedAmountMinor: 170_000,
        receivedCurrency: 'MXN',
        rateTimestamp: '2026-01-10T12:00:00Z',
      }),
      buildRemittanceMetadata({
        transactionId: 'tx-2',
        sentAt: '2026-01-20',
        sendAmountMinor: 5_000,
        sendCurrency: 'USD',
        feeAmountMinor: 250,
        provider: 'A',
        recipient: 'Family',
        corridor: 'US-MX',
        receivedAmountMinor: 85_000,
        receivedCurrency: 'MXN',
        rateTimestamp: '2026-01-20T12:00:00Z',
      }),
    ];

    const summary = summarizeMonthlyRemittances({ remittances, month: '2026-01' });

    expect(summary).toMatchObject({
      sentAmountMinor: 15_000,
      feeAmountMinor: 750,
      receivedAmountMinor: 255_000,
      averageExchangeRate: 17,
      effectiveRateIncludingFee: 16.190476,
      count: 2,
    });
    expect(summary.byRecipient[0]).toMatchObject({ key: 'Family', count: 2 });
  });
});
