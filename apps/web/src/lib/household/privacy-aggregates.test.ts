// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildPrivacySafeAggregate, validateHouseholdVisibility } from './privacy-aggregates';

describe('household privacy-safe aggregates', () => {
  it('validates that summary-only and hidden data do not expose line descriptions', () => {
    expect(
      validateHouseholdVisibility([
        { id: 'partner-card', owner: 'yours', visibility: 'summary-only', description: 'Cafe', amountCents: 20_00 },
      ]),
    ).toEqual({ valid: false, errors: ['partner-card:line-item-leakage'] });
  });

  it('shows only allowed line items while preserving summary totals', () => {
    const aggregate = buildPrivacySafeAggregate(
      [
        { id: 'mine', owner: 'mine', visibility: 'mine', description: 'Paycheck', amountCents: 100_00 },
        { id: 'shared', owner: 'ours', visibility: 'ours', description: 'Rent', amountCents: -50_00 },
        { id: 'partner', owner: 'yours', visibility: 'summary-only', description: '', amountCents: 25_00 },
        { id: 'hidden', owner: 'yours', visibility: 'hidden', description: '', amountCents: 999_00 },
      ],
      'mine',
    );
    expect(aggregate.visibleItems.map((item) => item.id)).toEqual(['mine', 'shared']);
    expect(aggregate.summaryOnlyCents).toBe(25_00);
    expect(aggregate.totalCents).toBe(75_00);
  });
});
