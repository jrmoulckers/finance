// SPDX-License-Identifier: BUSL-1.1

export interface WeddingVendorPlan {
  readonly id: string;
  readonly name: string;
  readonly contractedCents: number;
  readonly paidCents: number;
  readonly nextDueDate: string | null;
  readonly perGuestCents?: number;
}

export interface WeddingInstallmentSummary {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly dueDate: string;
  readonly amountCents: number;
}

export interface WeddingPlanSummary {
  readonly estimatedTotalCents: number;
  readonly paidCents: number;
  readonly remainingBalanceCents: number;
  readonly upcomingDue: readonly WeddingInstallmentSummary[];
  readonly overBudgetCents: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildWeddingPlanSummary(
  vendors: readonly WeddingVendorPlan[],
  guestCount: number,
  budgetCents: number,
  today: string,
): WeddingPlanSummary {
  const estimatedTotalCents = vendors.reduce(
    (sum, vendor) =>
      sum + vendor.contractedCents + (vendor.perGuestCents ?? 0) * Math.max(0, guestCount),
    0,
  );
  const paidCents = vendors.reduce((sum, vendor) => sum + Math.max(0, vendor.paidCents), 0);
  const remainingBalanceCents = Math.max(0, estimatedTotalCents - paidCents);
  const todayMs = Date.parse(today);
  const upcomingDue = vendors
    .filter((vendor) => vendor.nextDueDate !== null)
    .map((vendor) => ({
      vendorId: vendor.id,
      vendorName: vendor.name,
      dueDate: vendor.nextDueDate ?? '',
      amountCents: Math.max(
        0,
        vendor.contractedCents +
          (vendor.perGuestCents ?? 0) * Math.max(0, guestCount) -
          vendor.paidCents,
      ),
    }))
    .filter((item) => {
      const days = (Date.parse(item.dueDate) - todayMs) / MS_PER_DAY;
      return days >= 0 && days <= 30 && item.amountCents > 0;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    estimatedTotalCents,
    paidCents,
    remainingBalanceCents,
    upcomingDue,
    overBudgetCents: Math.max(0, estimatedTotalCents - budgetCents),
  };
}
