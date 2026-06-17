// SPDX-License-Identifier: BUSL-1.1

import { generateSummaryNarrative, type PeriodSummaryInput } from './summaryNarratives';

const input: PeriodSummaryInput = {
  period: 'weekly',
  startDate: '2026-03-01',
  endDate: '2026-03-07',
  transactions: [
    { id: 'income', date: '2026-03-01', amountCents: 200_000, type: 'income', category: 'Paycheck', merchant: 'Employer' },
    { id: 'grocery', date: '2026-03-02', amountCents: -10_000, type: 'expense', category: 'Groceries', merchant: 'Market' },
    { id: 'dining', date: '2026-03-03', amountCents: -4_000, type: 'expense', category: 'Dining', merchant: 'Cafe' },
    { id: 'repair', date: '2026-03-04', amountCents: -90_000, type: 'expense', category: 'Auto', merchant: 'Repair shop' },
  ],
  comparisonTransactions: [{ id: 'old', date: '2026-02-22', amountCents: -50_000, type: 'expense', category: 'Mixed' }],
  budgets: [{ id: 'b1', name: 'Dining', amountCents: 5_000, spentCents: 4_000 }],
  goals: [{ id: 'g1', name: 'Emergency fund', currentCents: 80_000, previousCurrentCents: 70_000, targetCents: 100_000 }],
  bills: [{ id: 'bill', merchant: 'Rent', dueDate: '2026-03-05', amountCents: 150_000, paid: false }],
};

describe('summary narratives', () => {
  it('generates a source-backed weekly narrative with neutral highlights and risks', () => {
    const summary = generateSummaryNarrative(input, '2026-03-08T00:00:00.000Z');
    expect(summary.headline).toContain('Weekly recap');
    expect(summary.highlights.join(' ')).toContain('Emergency fund gained');
    expect(summary.risks.join(' ')).toContain('higher than the comparison period');
    expect(summary.risks.join(' ')).toContain('Rent');
    expect(summary.sources.find((source) => source.metric === 'spendingCents')?.sourceIds).toContain('repair');
  });

  it('handles empty periods with a data-needed action', () => {
    const summary = generateSummaryNarrative({ period: 'monthly', startDate: '2026-04-01', endDate: '2026-04-30', transactions: [] }, '2026-05-01T00:00:00.000Z');
    expect(summary.highlights[0]).toContain('No local transaction activity');
    expect(summary.nextActions[0]).toContain('widen the date range');
  });

  it('reports positive spending changes and localization-ready currency formatting', () => {
    const summary = generateSummaryNarrative({ ...input, comparisonTransactions: [{ id: 'old', date: '2026-02-01', amountCents: -200_000, type: 'expense' }], locale: 'en-US' });
    expect(summary.highlights.join(' ')).toContain('Spending improved');
    expect(summary.highlights[0]).toContain('$2,000.00');
  });
});
