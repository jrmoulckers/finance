// SPDX-License-Identifier: BUSL-1.1

import { applySubscriptionDecision, detectPriceChanges, detectSubscriptions, normalizeSubscriptionMerchant, priceChangeAlerts, type SubscriptionTransaction } from './subscriptionDetection';

const transactions: readonly SubscriptionTransaction[] = [
  { id: 's1', merchant: 'StreamFlix Monthly', date: '2026-01-01', amountCents: -1_000, category: 'Streaming subscription' },
  { id: 's2', merchant: 'StreamFlix', date: '2026-02-01', amountCents: -1_000, category: 'Streaming subscription' },
  { id: 's3', merchant: 'StreamFlix', date: '2026-03-01', amountCents: -1_300, category: 'Streaming subscription' },
  { id: 'a1', merchant: 'Cloud Backup Annual', date: '2025-03-15', amountCents: -12_000, category: 'Software' },
  { id: 'a2', merchant: 'Cloud Backup', date: '2026-03-15', amountCents: -12_000, category: 'Software' },
  { id: 't1', merchant: 'News Trial', date: '2026-02-01', amountCents: -99, category: 'Subscription' },
  { id: 't2', merchant: 'News', date: '2026-03-01', amountCents: -1_499, category: 'Subscription' },
];

describe('subscription detection', () => {
  it('normalizes merchants and detects monthly, annual, and trial conversion candidates', () => {
    expect(normalizeSubscriptionMerchant('StreamFlix Monthly LLC')).toBe('streamflix');
    const candidates = detectSubscriptions(transactions);
    expect(candidates.find((candidate) => candidate.merchant === 'Streamflix')).toMatchObject({ cadence: 'monthly', annualizedCostCents: 15_600 });
    expect(candidates.find((candidate) => candidate.merchant === 'Cloud Backup')).toMatchObject({ cadence: 'annual', annualizedCostCents: 12_000 });
    expect(candidates.find((candidate) => candidate.merchant === 'News')).toMatchObject({ cadence: 'trial_conversion' });
  });

  it('flags material price changes with annual impact', () => {
    const changes = detectPriceChanges(
      [
        { transactionId: 'old', date: '2026-01-01', amountCents: 1_000 },
        { transactionId: 'new', date: '2026-02-01', amountCents: 1_300 },
      ],
      'monthly',
    );
    expect(changes[0]).toMatchObject({ priorAmountCents: 1_000, newAmountCents: 1_300, deltaCents: 300, percentDelta: 30, annualImpactCents: 3_600 });
  });

  it('supports confirm, rename, merge, dismiss, cancel, and price-change acknowledgement', () => {
    const candidates = detectSubscriptions(transactions);
    const stream = candidates.find((candidate) => candidate.id === 'sub-streamflix');
    expect(stream).toBeDefined();
    const renamed = applySubscriptionDecision(candidates, { candidateId: 'sub-streamflix', action: 'rename', name: 'StreamFlix Family' });
    expect(renamed.find((candidate) => candidate.id === 'sub-streamflix')?.merchant).toBe('StreamFlix Family');
    const acknowledged = applySubscriptionDecision(renamed, { candidateId: 'sub-streamflix', action: 'acknowledge-price-change', effectiveDate: '2026-03-01' });
    expect(acknowledged.find((candidate) => candidate.id === 'sub-streamflix')?.priceChanges[0].acknowledged).toBe(true);
    expect(applySubscriptionDecision(acknowledged, { candidateId: 'sub-streamflix', action: 'dismiss' }).find((candidate) => candidate.id === 'sub-streamflix')?.status).toBe('dismissed');
    expect(applySubscriptionDecision(acknowledged, { candidateId: 'sub-streamflix', action: 'cancel' }).find((candidate) => candidate.id === 'sub-streamflix')?.status).toBe('cancelled');
  });

  it('does not re-alert for acknowledged or already alerted price changes', () => {
    const candidates = detectSubscriptions(transactions);
    const alerts = priceChangeAlerts(candidates);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(priceChangeAlerts(candidates, alerts.map((alert) => alert.key))).toHaveLength(0);
  });
});
