// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { upsertBnplObligationFromDraft, validateBnplObligationDraft } from './bnpl-obligation-entry';
import type { BnplObligation } from '../debt-types';

const draft = {
  id: 'bnpl-a',
  merchantName: 'Store',
  originalAmountCents: 400_00,
  totalInstallments: 4,
  paidInstallments: 1,
  installmentAmountCents: 100_00,
  totalFeesCents: 0,
  annualRateBps: 0,
  firstDueDateIso: '2025-02-01',
  cadenceDays: 14,
};

describe('BNPL obligation entry', () => {
  it('validates invalid dates, zero installments, and overpaid schedules', () => {
    const validation = validateBnplObligationDraft({
      ...draft,
      firstDueDateIso: '2025-02-31',
      totalInstallments: 0,
      paidInstallments: 5,
      originalAmountCents: 100_00,
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('Enter a valid first due date.');
    expect(validation.errors).toContain('Total installments must be greater than zero.');
    expect(validation.errors).toContain('Paid installments cannot exceed total installments.');
    expect(validation.errors).toContain('Paid schedule cannot exceed the original purchase amount.');
  });

  it('edits active obligations without replacing an unchanged remaining due-date schedule', () => {
    const existing: BnplObligation = {
      id: 'bnpl-a',
      merchantName: 'Old Store',
      originalAmountCents: 400_00,
      remainingBalanceCents: 300_00,
      totalInstallments: 4,
      paidInstallments: 1,
      installmentAmountCents: 100_00,
      annualRateBps: 0,
      totalFeesCents: 0,
      upcomingDueDates: ['2025-02-03', '2025-02-17', '2025-03-03'],
    };

    const [updated] = upsertBnplObligationFromDraft([existing], { ...draft, merchantName: 'New Store' });

    expect(updated.merchantName).toBe('New Store');
    expect(updated.upcomingDueDates).toEqual(existing.upcomingDueDates);
  });
});
