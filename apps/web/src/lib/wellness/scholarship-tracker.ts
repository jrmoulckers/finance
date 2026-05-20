// SPDX-License-Identifier: BUSL-1.1

/**
 * Scholarship and financial aid tracking utilities.
 *
 * Provides scholarship application management, financial aid package
 * comparison, net cost calculation, and deadline tracking.
 *
 * All monetary values are in integer cents.
 *
 * References: #1765
 */

import type {
  Scholarship,
  FinancialAidPackage,
  AidPackageSummary,
  DeadlineEntry,
  ScholarshipStatus,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding: rounds half to even.
 *
 * @param value - The value to round
 * @returns Rounded integer
 */
function bankersRound(value: number): number {
  const rounded = Math.round(value);
  // When exactly at .5, round to even
  if (Math.abs(value - (rounded - 0.5)) < Number.EPSILON) {
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
  return rounded;
}

// ---------------------------------------------------------------------------
// Scholarship tracking
// ---------------------------------------------------------------------------

/**
 * Filter scholarships by status.
 *
 * @param scholarships - All scholarship entries
 * @param status - Status to filter by
 * @returns Filtered scholarships
 */
export function filterByStatus(
  scholarships: readonly Scholarship[],
  status: ScholarshipStatus,
): Scholarship[] {
  return scholarships.filter((s) => s.status === status);
}

/**
 * Calculate total awarded scholarship amount in cents.
 *
 * @param scholarships - All scholarship entries
 * @returns Total awarded amount in cents
 */
export function totalAwardedCents(scholarships: readonly Scholarship[]): number {
  return scholarships
    .filter((s) => s.status === 'awarded')
    .reduce((sum, s) => sum + s.amountCents, 0);
}

/**
 * Calculate total potential scholarship amount (submitted + awarded) in cents.
 *
 * @param scholarships - All scholarship entries
 * @returns Total potential amount in cents
 */
export function totalPotentialCents(scholarships: readonly Scholarship[]): number {
  return scholarships
    .filter((s) => s.status === 'submitted' || s.status === 'awarded')
    .reduce((sum, s) => sum + s.amountCents, 0);
}

/**
 * Calculate total renewable value over all renewal years in cents.
 *
 * @param scholarships - All scholarship entries
 * @returns Total multi-year value of awarded renewable scholarships in cents
 */
export function totalRenewableValueCents(scholarships: readonly Scholarship[]): number {
  return scholarships
    .filter((s) => s.status === 'awarded' && s.renewable)
    .reduce((sum, s) => sum + s.amountCents * Math.max(1, s.renewalYears), 0);
}

// ---------------------------------------------------------------------------
// Financial aid package comparison
// ---------------------------------------------------------------------------

/**
 * Summarize a financial aid package for comparison.
 *
 * @param pkg - Financial aid package
 * @returns Summary with net cost and aid breakdown
 */
export function summarizeAidPackage(pkg: FinancialAidPackage): AidPackageSummary {
  const totalGrantsCents = pkg.aidComponents
    .filter((c) => c.type === 'grant' || c.type === 'scholarship')
    .reduce((sum, c) => sum + c.amountCents, 0);

  const totalLoansCents = pkg.aidComponents
    .filter((c) => c.type === 'loan')
    .reduce((sum, c) => sum + c.amountCents, 0);

  const totalWorkStudyCents = pkg.aidComponents
    .filter((c) => c.type === 'work_study')
    .reduce((sum, c) => sum + c.amountCents, 0);

  const totalAidCents = totalGrantsCents + totalLoansCents + totalWorkStudyCents;
  const netCostCents = pkg.totalCostCents - totalAidCents;
  const outOfPocketCents = pkg.totalCostCents - totalGrantsCents - totalWorkStudyCents;

  return {
    institution: pkg.institution,
    totalAidCents,
    totalGrantsCents,
    totalLoansCents,
    totalWorkStudyCents,
    netCostCents: Math.max(0, netCostCents),
    outOfPocketCents: Math.max(0, outOfPocketCents),
  };
}

/**
 * Compare multiple financial aid packages side-by-side.
 *
 * @param packages - Array of financial aid packages
 * @returns Sorted array of summaries (lowest net cost first)
 */
export function compareAidPackages(packages: readonly FinancialAidPackage[]): AidPackageSummary[] {
  return packages.map(summarizeAidPackage).sort((a, b) => a.netCostCents - b.netCostCents);
}

/**
 * Calculate net cost after subtracting total aid from total cost.
 *
 * @param totalCostCents - Total cost of attendance in cents
 * @param totalAidCents - Total financial aid in cents
 * @returns Net cost in cents (floored at 0)
 */
export function calculateNetCost(totalCostCents: number, totalAidCents: number): number {
  return Math.max(0, totalCostCents - totalAidCents);
}

/**
 * Calculate the average aid-per-component for a package.
 *
 * @param pkg - Financial aid package
 * @returns Average aid per component in cents, using banker's rounding
 */
export function averageAidPerComponent(pkg: FinancialAidPackage): number {
  if (pkg.aidComponents.length === 0) return 0;
  const total = pkg.aidComponents.reduce((sum, c) => sum + c.amountCents, 0);
  return bankersRound(total / pkg.aidComponents.length);
}

// ---------------------------------------------------------------------------
// Deadline calendar
// ---------------------------------------------------------------------------

/**
 * Build a deadline calendar from scholarships, relative to a reference date.
 *
 * @param scholarships - All scholarship entries
 * @param referenceDate - Date to calculate days remaining from (ISO string)
 * @returns Sorted deadline entries (soonest first)
 */
export function buildDeadlineCalendar(
  scholarships: readonly Scholarship[],
  referenceDate: string,
): DeadlineEntry[] {
  const refMs = new Date(referenceDate).getTime();
  const msPerDay = 24 * 60 * 60 * 1000;

  return scholarships
    .filter((s) => s.status !== 'awarded' && s.status !== 'rejected')
    .map((s) => {
      const deadlineMs = new Date(s.deadline).getTime();
      const daysRemaining = Math.ceil((deadlineMs - refMs) / msPerDay);

      return {
        scholarshipId: s.id,
        scholarshipName: s.name,
        deadline: s.deadline,
        daysRemaining,
        status: s.status,
        isUrgent: daysRemaining >= 0 && daysRemaining <= 7,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Get only upcoming deadlines (not past due).
 *
 * @param entries - Deadline calendar entries
 * @returns Entries with positive days remaining
 */
export function upcomingDeadlines(entries: readonly DeadlineEntry[]): DeadlineEntry[] {
  return entries.filter((e) => e.daysRemaining >= 0);
}

/**
 * Get overdue deadlines.
 *
 * @param entries - Deadline calendar entries
 * @returns Entries with negative days remaining
 */
export function overdueDeadlines(entries: readonly DeadlineEntry[]): DeadlineEntry[] {
  return entries.filter((e) => e.daysRemaining < 0);
}

// ---------------------------------------------------------------------------
// Total aid summary
// ---------------------------------------------------------------------------

/**
 * Calculate a comprehensive aid summary across all sources.
 *
 * @param scholarships - Awarded scholarships
 * @param aidPackage - Selected financial aid package (or null)
 * @returns Object with total aid, total cost, net cost, and breakdown
 */
export function totalAidSummary(
  scholarships: readonly Scholarship[],
  aidPackage: FinancialAidPackage | null,
): {
  readonly totalScholarshipsCents: number;
  readonly totalInstitutionalAidCents: number;
  readonly combinedAidCents: number;
  readonly totalCostCents: number;
  readonly netCostCents: number;
} {
  const totalScholarshipsCents = totalAwardedCents(scholarships);

  let totalInstitutionalAidCents = 0;
  let totalCostCents = 0;

  if (aidPackage) {
    totalInstitutionalAidCents = aidPackage.aidComponents.reduce(
      (sum, c) => sum + c.amountCents,
      0,
    );
    totalCostCents = aidPackage.totalCostCents;
  }

  const combinedAidCents = totalScholarshipsCents + totalInstitutionalAidCents;

  return {
    totalScholarshipsCents,
    totalInstitutionalAidCents,
    combinedAidCents,
    totalCostCents,
    netCostCents: Math.max(0, totalCostCents - combinedAidCents),
  };
}
