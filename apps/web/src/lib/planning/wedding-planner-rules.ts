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

/** Per-vendor breakdown after applying the current guest count. */
export interface WeddingVendorBreakdown {
  readonly id: string;
  readonly name: string;
  /** Contracted base plus per-guest scaling at the supplied guest count. */
  readonly estimatedTotalCents: number;
  readonly paidCents: number;
  readonly remainingCents: number;
  /** Per-guest contribution in cents (0 when the vendor is a flat fee). */
  readonly perGuestCents: number;
  /** True when this vendor scales with the guest count (catering, rentals, invitations…). */
  readonly guestSensitive: boolean;
  readonly nextDueDate: string | null;
  /** True once deposits cover the full estimate. */
  readonly paidInFull: boolean;
}

/** Urgency classification for an installment, surfaced with text + icon (never colour alone). */
export type WeddingDueUrgency = 'overdue' | 'due-soon' | 'upcoming';

export interface WeddingUpcomingInstallment extends WeddingInstallmentSummary {
  readonly urgency: WeddingDueUrgency;
  readonly daysUntilDue: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 30;

/** Clamp a guest count to a non-negative whole number. */
function normalizeGuestCount(guestCount: number): number {
  return Math.max(0, Math.floor(guestCount));
}

/**
 * Estimate a single vendor's total in integer cents, scaling per-guest line items
 * (catering, rentals, invitations) by the current guest count.
 */
export function computeVendorEstimateCents(vendor: WeddingVendorPlan, guestCount: number): number {
  return vendor.contractedCents + (vendor.perGuestCents ?? 0) * normalizeGuestCount(guestCount);
}

/**
 * Build a per-vendor breakdown (estimate, deposit paid, remaining balance) for the
 * current guest count. All money stays in integer cents.
 */
export function buildWeddingVendorBreakdown(
  vendors: readonly WeddingVendorPlan[],
  guestCount: number,
): WeddingVendorBreakdown[] {
  return vendors.map((vendor) => {
    const estimatedTotalCents = computeVendorEstimateCents(vendor, guestCount);
    const paidCents = Math.max(0, vendor.paidCents);
    const remainingCents = Math.max(0, estimatedTotalCents - paidCents);
    const perGuestCents = vendor.perGuestCents ?? 0;

    return {
      id: vendor.id,
      name: vendor.name,
      estimatedTotalCents,
      paidCents,
      remainingCents,
      perGuestCents,
      guestSensitive: perGuestCents > 0,
      nextDueDate: vendor.nextDueDate,
      paidInFull: remainingCents === 0,
    };
  });
}

/**
 * Classify how urgent an installment is relative to `today` so the UI can convey it
 * with text + icon rather than colour alone.
 */
export function classifyDueUrgency(
  dueDate: string,
  today: string,
  soonWithinDays = DUE_SOON_DAYS,
): WeddingDueUrgency {
  const days = Math.floor((Date.parse(dueDate) - Date.parse(today)) / MS_PER_DAY);
  if (days < 0) return 'overdue';
  if (days <= soonWithinDays) return 'due-soon';
  return 'upcoming';
}

/**
 * List every vendor installment that still has a balance and a due date, sorted by due
 * date ascending (overdue first) and tagged with an urgency level and day count.
 */
export function listUpcomingInstallments(
  vendors: readonly WeddingVendorPlan[],
  guestCount: number,
  today: string,
): WeddingUpcomingInstallment[] {
  const todayMs = Date.parse(today);

  return vendors
    .filter((vendor): vendor is WeddingVendorPlan & { nextDueDate: string } =>
      Boolean(vendor.nextDueDate),
    )
    .map((vendor) => {
      const amountCents = Math.max(
        0,
        computeVendorEstimateCents(vendor, guestCount) - Math.max(0, vendor.paidCents),
      );

      return {
        vendorId: vendor.id,
        vendorName: vendor.name,
        dueDate: vendor.nextDueDate,
        amountCents,
        urgency: classifyDueUrgency(vendor.nextDueDate, today),
        daysUntilDue: Math.floor((Date.parse(vendor.nextDueDate) - todayMs) / MS_PER_DAY),
      };
    })
    .filter((item) => item.amountCents > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

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
