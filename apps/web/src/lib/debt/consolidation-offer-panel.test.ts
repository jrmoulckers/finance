// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { compareConsolidationOffer } from './consolidation-comparison';
import { buildConsolidationOfferPanelModel } from './consolidation-offer-panel';
import type { Debt } from '../debt-types';

const debts: Debt[] = [
  {
    id: 'card',
    name: 'Card',
    balanceCents: 5_000_00,
    annualRateBps: 2499,
    minimumPaymentCents: 150_00,
    type: 'credit_card',
  },
];

describe('buildConsolidationOfferPanelModel', () => {
  it('exposes payment, cost, flags, assumptions, and recommendation for the UI', () => {
    const comparison = compareConsolidationOffer({
      debts,
      consolidationAnnualRateBps: 900,
      consolidationTermMonths: 36,
      originationFeeCents: 250_00,
      feeTreatment: 'financed',
    });

    const model = buildConsolidationOfferPanelModel(comparison);

    expect(model.paymentCents).toBe(comparison.consolidation.monthlyPaymentCents);
    expect(model.totalPaidCents).toBe(comparison.consolidation.totalPaidCents);
    expect(model.feesCents).toBe(250_00);
    expect(model.assumptions).toContain('Origination fees are treated as financed principal.');
    expect(['consider', 'caution', 'avoid', 'insufficient_data']).toContain(model.recommendation);
  });
});
