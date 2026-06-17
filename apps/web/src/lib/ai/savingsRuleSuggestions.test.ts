// SPDX-License-Identifier: BUSL-1.1

import { applySavingsSuggestionDecision, detectPaydayCadence, estimateRoundUpSavings, suggestSavingsRules, type SavingsTransaction } from './savingsRuleSuggestions';

const transactions: readonly SavingsTransaction[] = [
  { id: 'p1', date: '2026-03-01', amountCents: 200_000, type: 'income', merchant: 'Employer' },
  { id: 'p2', date: '2026-03-15', amountCents: 200_000, type: 'income', merchant: 'Employer' },
  { id: 'e1', date: '2026-03-02', amountCents: -12_345, type: 'expense', category: 'Groceries' },
  { id: 'e2', date: '2026-03-05', amountCents: -6_789, type: 'expense', category: 'Dining' },
  { id: 'e3', date: '2026-03-10', amountCents: -30_000, type: 'expense', category: 'Dining' },
];

describe('automated savings-rule suggestions', () => {
  it('detects payday cadence and suggests user-approved rules from surplus', () => {
    expect(detectPaydayCadence(transactions.filter((transaction) => transaction.type === 'income'))).toBe('biweekly');
    const suggestions = suggestSavingsRules(transactions, [{ id: 'goal', name: 'Emergency fund', currentCents: 10_000, targetCents: 100_000, targetDate: '2026-12-31' }], { startDate: '2026-03-01', endDate: '2026-03-31', currentBalanceCents: 500_000, minimumSafeBalanceCents: 50_000 });
    expect(suggestions.map((item) => item.type)).toContain('payday_percentage');
    expect(suggestions.every((item) => item.requiresApproval)).toBe(true);
    expect(suggestions[0].targetGoalId).toBe('goal');
  });

  it('estimates round-up savings from observed purchases', () => {
    const estimate = estimateRoundUpSavings(transactions.filter((transaction) => transaction.type === 'expense'));
    expect(estimate.monthlyImpactCents).toBe(66);
    expect(estimate.sourceTransactionIds).toEqual(['e1', 'e2']);
  });

  it('suppresses suggestions when balance and upcoming bills imply risk', () => {
    const suggestions = suggestSavingsRules(transactions, [], { startDate: '2026-03-01', endDate: '2026-03-31', currentBalanceCents: 40_000, minimumSafeBalanceCents: 20_000, upcomingBills: [{ id: 'rent', merchant: 'Rent', dueDate: '2026-03-20', amountCents: 30_000 }] });
    expect(suggestions).toEqual([]);
  });

  it('requires explicit approval or dismissal and can link a chosen goal', () => {
    const [suggestion] = suggestSavingsRules(transactions, [], { startDate: '2026-03-01', endDate: '2026-03-31', currentBalanceCents: 500_000 });
    expect(applySavingsSuggestionDecision([suggestion], { suggestionId: suggestion.id, action: 'approve', targetGoalId: 'vacation' })[0]).toMatchObject({ status: 'approved', targetGoalId: 'vacation' });
    expect(applySavingsSuggestionDecision([suggestion], { suggestionId: suggestion.id, action: 'dismiss' })[0].status).toBe('dismissed');
  });
});
