// SPDX-License-Identifier: BUSL-1.1

import { applyBillCandidateDecision, classifyCadence, detectBillCandidates, generateBillNotifications, type BillTransaction } from './billPrediction';

const tx: readonly BillTransaction[] = [
  { id: 'r1', merchant: 'City Rent Autopay', date: '2026-01-01', amountCents: -150_000, category: 'Rent' },
  { id: 'r2', merchant: 'City Rent', date: '2026-02-01', amountCents: -151_000, category: 'Rent' },
  { id: 'r3', merchant: 'City Rent', date: '2026-03-01', amountCents: -150_500, category: 'Rent' },
  { id: 'g1', merchant: 'Gym Co', date: '2026-01-03', amountCents: -4_000 },
  { id: 'g2', merchant: 'Gym Co', date: '2026-01-17', amountCents: -4_000 },
  { id: 'g3', merchant: 'Gym Co', date: '2026-01-31', amountCents: -4_000 },
  { id: 'a1', merchant: 'Annual Insurance', date: '2025-03-05', amountCents: -60_000, category: 'Insurance' },
  { id: 'a2', merchant: 'Annual Insurance', date: '2026-03-04', amountCents: -63_000, category: 'Insurance' },
];

describe('bill prediction and confirmation', () => {
  it('detects monthly, biweekly, annual, and irregular cadences', () => {
    expect(classifyCadence([31, 28, 31])).toBe('monthly');
    expect(classifyCadence([14, 14, 15])).toBe('biweekly');
    expect(classifyCadence([365])).toBe('annual');
    expect(classifyCadence([22, 39, 45])).toBe('irregular');
  });

  it('predicts bill candidates with amount ranges and source transactions', () => {
    const candidates = detectBillCandidates(tx);
    const rent = candidates.find((candidate) => candidate.merchant === 'City Rent');
    expect(rent).toMatchObject({ cadence: 'monthly', nextDueDate: '2026-03-31', status: 'candidate' });
    expect(rent?.expectedAmountRangeCents[0]).toBeLessThanOrEqual(150_000);
    expect(rent?.sourceTransactionIds).toEqual(['r1', 'r2', 'r3']);
  });

  it('supports confirm, edit, ignore, and merge candidate flows', () => {
    const candidates = detectBillCandidates(tx);
    const rent = candidates.find((candidate) => candidate.merchant === 'City Rent');
    expect(rent).toBeDefined();
    const confirmed = applyBillCandidateDecision(candidates, { candidateId: rent?.id ?? '', action: 'confirm' });
    expect(confirmed.find((candidate) => candidate.id === rent?.id)?.status).toBe('confirmed');
    const edited = applyBillCandidateDecision(confirmed, { candidateId: rent?.id ?? '', action: 'edit', changes: { nextDueDate: '2026-04-01' } });
    expect(edited.find((candidate) => candidate.id === rent?.id)?.nextDueDate).toBe('2026-04-01');
    const ignored = applyBillCandidateDecision(edited, { candidateId: rent?.id ?? '', action: 'ignore' });
    expect(ignored.find((candidate) => candidate.id === rent?.id)?.status).toBe('ignored');
  });

  it('dedupes bill-due and projected-low-balance notifications', () => {
    const [candidate] = applyBillCandidateDecision(detectBillCandidates(tx), { candidateId: 'bill-city rent', action: 'edit', changes: { nextDueDate: '2026-03-20' } });
    const notifications = generateBillNotifications([candidate], { today: '2026-03-18', confidenceThreshold: 0.5, leadDays: 7, projectedBalanceCents: 151_000, lowBalanceThresholdCents: 1_000 });
    expect(notifications.map((item) => item.type)).toEqual(['bill_due', 'projected_low_balance']);
    expect(generateBillNotifications([candidate], { today: '2026-03-18', confidenceThreshold: 0.5, leadDays: 7, existingDeduplicationKeys: notifications.map((item) => item.deduplicationKey) })).toHaveLength(0);
  });
});
