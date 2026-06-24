// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildWeddingPlanSummary,
  buildWeddingVendorBreakdown,
  classifyDueUrgency,
  computeVendorEstimateCents,
  listUpcomingInstallments,
  type WeddingVendorPlan,
} from './wedding-planner-rules';

const SCENARIO_VENDORS: readonly WeddingVendorPlan[] = [
  {
    id: 'venue',
    name: 'Venue',
    contractedCents: 14000_00,
    paidCents: 4000_00,
    nextDueDate: '2026-07-07',
  },
  {
    id: 'catering',
    name: 'Catering',
    contractedCents: 3000_00,
    paidCents: 1000_00,
    nextDueDate: '2026-08-07',
    perGuestCents: 85_00,
  },
  {
    id: 'rentals',
    name: 'Rentals',
    contractedCents: 1000_00,
    paidCents: 0,
    nextDueDate: '2026-07-22',
    perGuestCents: 30_00,
  },
  {
    id: 'invitations',
    name: 'Invitations',
    contractedCents: 200_00,
    paidCents: 575_00,
    nextDueDate: null,
    perGuestCents: 5_00,
  },
];

describe('wedding planner shared rules', () => {
  it('calculates remaining balance, guest-sensitive estimates, and upcoming dues for a $35k scenario', () => {
    const summary = buildWeddingPlanSummary(
      [
        {
          id: 'venue',
          name: 'Venue',
          contractedCents: 18000_00,
          paidCents: 5000_00,
          nextDueDate: '2026-06-01',
        },
        {
          id: 'catering',
          name: 'Catering',
          contractedCents: 4000_00,
          paidCents: 1000_00,
          nextDueDate: '2026-05-20',
          perGuestCents: 75_00,
        },
        {
          id: 'photo',
          name: 'Photo',
          contractedCents: 6000_00,
          paidCents: 6000_00,
          nextDueDate: null,
        },
      ],
      80,
      35000_00,
      '2026-05-10',
    );
    expect(summary.estimatedTotalCents).toBe(34000_00);
    expect(summary.remainingBalanceCents).toBe(22000_00);
    expect(summary.overBudgetCents).toBe(0);
    expect(summary.upcomingDue.map((item) => item.vendorId)).toEqual(['catering', 'venue']);
  });

  it('recomputes per-guest line items and remaining balances exactly to the cent when the guest count changes', () => {
    const at75 = buildWeddingVendorBreakdown(SCENARIO_VENDORS, 75);
    const at100 = buildWeddingVendorBreakdown(SCENARIO_VENDORS, 100);

    const catering75 = at75.find((vendor) => vendor.id === 'catering');
    const catering100 = at100.find((vendor) => vendor.id === 'catering');

    // 3000_00 base + 85_00 * 75 guests = 9375_00; deposit 1000_00 leaves 8375_00.
    expect(catering75?.estimatedTotalCents).toBe(9375_00);
    expect(catering75?.remainingCents).toBe(8375_00);
    // 3000_00 base + 85_00 * 100 guests = 11500_00; deposit 1000_00 leaves 10500_00.
    expect(catering100?.estimatedTotalCents).toBe(11500_00);
    expect(catering100?.remainingCents).toBe(10500_00);

    // The breakdown total + total deposits must reconcile exactly with estimate − paid.
    const sumEstimate = at75.reduce((sum, vendor) => sum + vendor.estimatedTotalCents, 0);
    const sumPaid = at75.reduce((sum, vendor) => sum + vendor.paidCents, 0);
    const sumRemaining = at75.reduce((sum, vendor) => sum + vendor.remainingCents, 0);
    expect(sumRemaining).toBe(sumEstimate - sumPaid);
  });

  it('flags a vendor as paid in full once deposits cover the estimate and never reports negative remaining', () => {
    const breakdown = buildWeddingVendorBreakdown(SCENARIO_VENDORS, 75);
    const invitations = breakdown.find((vendor) => vendor.id === 'invitations');

    // 200_00 base + 5_00 * 75 = 575_00, fully covered by the 575_00 deposit.
    expect(invitations?.estimatedTotalCents).toBe(575_00);
    expect(invitations?.remainingCents).toBe(0);
    expect(invitations?.paidInFull).toBe(true);
    expect(breakdown.every((vendor) => vendor.remainingCents >= 0)).toBe(true);
  });

  it('computes a single vendor estimate with floored, non-negative guest counts', () => {
    const catering = SCENARIO_VENDORS[1];
    expect(computeVendorEstimateCents(catering, 80.9)).toBe(3000_00 + 85_00 * 80);
    expect(computeVendorEstimateCents(catering, -5)).toBe(3000_00);
  });

  it('orders upcoming installments by due date and tags urgency relative to today', () => {
    const today = '2026-07-01';
    const installments = listUpcomingInstallments(SCENARIO_VENDORS, 75, today);

    // Sorted ascending by due date; invitations excluded (no due date / paid in full).
    expect(installments.map((item) => item.vendorId)).toEqual(['venue', 'rentals', 'catering']);
    expect(installments.map((item) => item.urgency)).toEqual([
      'due-soon', // venue 2026-07-07 (6 days out)
      'due-soon', // rentals 2026-07-22 (21 days out)
      'upcoming', // catering 2026-08-07 (37 days out)
    ]);
    // Venue: 14000_00 estimate − 4000_00 deposit = 10000_00 remaining.
    expect(installments[0].amountCents).toBe(10000_00);
    expect(installments[0].daysUntilDue).toBe(6);
  });

  it('classifies overdue, due-soon, and later installments distinctly', () => {
    expect(classifyDueUrgency('2026-06-15', '2026-07-01')).toBe('overdue');
    expect(classifyDueUrgency('2026-07-10', '2026-07-01')).toBe('due-soon');
    expect(classifyDueUrgency('2026-07-31', '2026-07-01')).toBe('due-soon');
    expect(classifyDueUrgency('2026-09-01', '2026-07-01')).toBe('upcoming');
  });
});
