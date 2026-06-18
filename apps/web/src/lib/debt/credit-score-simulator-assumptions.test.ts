// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { simulateCreditScoreImpact } from './credit-score-impact';
import { buildCreditScoreAssumptionSummary } from './credit-score-simulator-assumptions';
import type { CreditCard } from '../debt-types';

const card: CreditCard = {
  id: 'card-a',
  name: 'Daily Card',
  balanceCents: 500_00,
  minimumPaymentCents: 25_00,
  dueDate: '2025-02-20',
  annualRateBps: 1999,
  statementDate: '2025-02-05',
};

describe('buildCreditScoreAssumptionSummary', () => {
  it('surfaces missing limits, missing payment history, and qualitative disclaimer', () => {
    const simulation = simulateCreditScoreImpact({ cards: [card] });
    const summary = buildCreditScoreAssumptionSummary([card], simulation);

    expect(summary.missingStates).toContain(
      '1 card need credit limits before utilization can be modeled.',
    );
    expect(summary.missingStates).toContain(
      'Payment-history direction needs a modeled on-time streak or imported late-payment history.',
    );
    expect(summary.qualitativeDisclaimer).toContain('does not predict exact');
  });

  it('surfaces closure missing-data state when account effects are unknown', () => {
    const withLimit = { ...card, creditLimitCents: 1_000_00 };
    const simulation = simulateCreditScoreImpact({
      cards: [withLimit],
      closeAccountIds: ['card-a'],
    });
    const summary = buildCreditScoreAssumptionSummary([withLimit], simulation);

    expect(summary.missingStates).toContain(
      'Closure scenarios need account age and bureau history that may be outside the app.',
    );
  });
});
