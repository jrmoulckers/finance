// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  detectDuplicateAndTransferCandidates,
  learnDetectionDecision,
  scoreDuplicateCandidate,
  scoreTransferCandidate,
  type DetectionTransaction,
} from './duplicate-transfer-detection';

const existing: DetectionTransaction[] = [
  {
    id: 'e1',
    date: '2025-03-10',
    amountCents: -4_299,
    payee: 'POS STARBUCKS 1234',
    accountId: 'checking',
    sourceId: 'bank-1',
  },
  {
    id: 'e2',
    date: '2025-03-11',
    amountCents: 50_000,
    payee: 'Transfer from checking',
    accountId: 'savings',
  },
  {
    id: 'e3',
    date: '2025-03-12',
    amountCents: 200_000,
    payee: 'Payroll deposit',
    accountId: 'checking',
  },
];

describe('duplicate and transfer scoring', () => {
  it('scores duplicate candidates using source id, amount, date, payee, and account context', () => {
    const score = scoreDuplicateCandidate(
      {
        id: 'i1',
        date: '2025-03-10',
        amountCents: -4_299,
        payee: 'Starbucks Store 1234',
        accountId: 'checking',
        sourceId: 'bank-1',
      },
      existing[0],
    );

    expect(score.recommendedAction).toBe('merge-duplicate');
    expect(score.confidence).toBeGreaterThan(0.9);
    expect(score.autoMergeAllowed).toBe(true);
    expect(score.reasons).toContain('same source id');
  });

  it('detects likely transfers as opposite signed cross-account pairs', () => {
    const score = scoreTransferCandidate(
      {
        id: 'i2',
        date: '2025-03-10',
        amountCents: -50_000,
        payee: 'Online transfer to savings',
        accountId: 'checking',
      },
      existing[1],
    );

    expect(score.recommendedAction).toBe('link-transfer');
    expect(score.confidence).toBeGreaterThan(0.7);
    expect(score.autoMergeAllowed).toBe(false);
  });

  it('guards against refunds and payroll false positives', () => {
    const refund = scoreTransferCandidate(
      {
        id: 'i3',
        date: '2025-03-12',
        amountCents: -2_000,
        payee: 'Store purchase',
        accountId: 'card',
      },
      {
        id: 'e4',
        date: '2025-03-12',
        amountCents: 2_000,
        payee: 'Store refund',
        accountId: 'checking',
      },
    );
    const payroll = scoreTransferCandidate(
      {
        id: 'i4',
        date: '2025-03-12',
        amountCents: -200_000,
        payee: 'Company payroll reversal',
        accountId: 'payroll',
      },
      existing[2],
    );

    expect(refund.recommendedAction).toBe('keep-separate');
    expect(payroll.recommendedAction).toBe('keep-separate');
    expect(refund.reasons).toContain('refund or payroll guardrail');
  });
});

describe('detectDuplicateAndTransferCandidates', () => {
  it('returns review actions for duplicates and transfers without low-confidence auto merges', () => {
    const result = detectDuplicateAndTransferCandidates(
      [
        {
          id: 'i1',
          date: '2025-03-10',
          amountCents: -4_299,
          payee: 'Starbucks',
          accountId: 'checking',
          sourceId: 'bank-1',
        },
        {
          id: 'i2',
          date: '2025-03-10',
          amountCents: -50_000,
          payee: 'Transfer to savings',
          accountId: 'checking',
        },
      ],
      existing,
    );

    expect(result.duplicateCandidates[0]).toMatchObject({
      leftId: 'i1',
      rightId: 'e1',
      recommendedAction: 'merge-duplicate',
    });
    expect(result.transferCandidates[0]).toMatchObject({
      leftId: 'i2',
      rightId: 'e2',
      recommendedAction: 'link-transfer',
      autoMergeAllowed: false,
    });
  });

  it('learns from user decisions to tune local thresholds', () => {
    const thresholds = learnDetectionDecision('keep-separate', {
      id: 'i1',
      date: '2025-03-10',
      amountCents: -1,
      payee: 'A',
      accountId: 'checking',
      importSource: 'csv',
    });

    expect(thresholds[0]).toMatchObject({ accountId: 'checking', importSource: 'csv' });
    expect(thresholds[0].duplicateThreshold).toBeGreaterThan(0.72);
  });
});
