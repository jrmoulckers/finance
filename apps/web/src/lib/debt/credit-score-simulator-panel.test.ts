// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildCreditScoreSimulatorPanelModel } from './credit-score-simulator-panel';
import type { CreditCard } from '../debt-types';

const cards: CreditCard[] = [
  {
    id: 'card-a',
    name: 'Daily Card',
    balanceCents: 4_000_00,
    creditLimitCents: 10_000_00,
    minimumPaymentCents: 100_00,
    dueDate: '2025-02-20',
    annualRateBps: 1999,
    statementDate: '2025-02-05',
  },
];

describe('buildCreditScoreSimulatorPanelModel', () => {
  it('models paying one card down to target utilization', () => {
    const model = buildCreditScoreSimulatorPanelModel(cards, {
      targetCardId: 'card-a',
      targetUtilizationPercent: 30,
      plannedPaymentCents: 0,
      onTimePaymentMonths: 6,
      hardInquiries: 0,
      closeAccountIds: [],
    });

    expect(model.targetPaymentCents).toBe(1_000_00);
    expect(model.modeledPaymentCents).toBe(1_000_00);
    expect(
      model.result.factorImpacts.find((impact) => impact.factor === 'utilization')?.direction,
    ).toBe('positive');
    expect(model.result.disclaimer).toContain('score-factor direction');
  });
});
