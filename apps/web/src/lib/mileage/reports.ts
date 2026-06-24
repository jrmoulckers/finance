// SPDX-License-Identifier: BUSL-1.1

import { calculateTripDeduction } from './calculator';
import { classifyBusinessExpense, getExpenseCategoryOptions } from './expenseRules';
import type {
  ExpenseCategory,
  ExpenseCategorySummary,
  ExpenseClassification,
  ExpenseTransactionInput,
  MileagePurposeSummary,
  PlatformAuditSummary,
  ShiftAuditGroup,
  ShiftAuditLeg,
  ShiftMileageAuditReport,
  TaxReadyExpenseReport,
  TripEntry,
  WorkShift,
} from './types';

const MILEAGE_PURPOSE_ORDER = ['business', 'medical', 'moving', 'charity'] as const;
const EXPENSE_CATEGORY_ORDER = getExpenseCategoryOptions().map((option) => option.value);

function isWithinPeriod(date: string, startDate?: string | null, endDate?: string | null): boolean {
  if (startDate && date < startDate) {
    return false;
  }

  if (endDate && date > endDate) {
    return false;
  }

  return true;
}

function formatPeriodLabel(startDate?: string | null, endDate?: string | null): string {
  if (startDate && endDate) {
    return `${startDate} to ${endDate}`;
  }

  if (startDate) {
    return `Since ${startDate}`;
  }

  if (endDate) {
    return `Through ${endDate}`;
  }

  return 'All time';
}

function buildMileageSummaries(
  mileageEntries: TaxReadyExpenseReport['mileageEntries'],
): MileagePurposeSummary[] {
  return MILEAGE_PURPOSE_ORDER.map((purpose) => {
    const matchingEntries = mileageEntries.filter((entry) => entry.purpose === purpose);
    const miles = matchingEntries.reduce((sum, entry) => sum + entry.miles, 0);
    const deductionCents = matchingEntries.reduce((sum, entry) => sum + entry.deductionCents, 0);

    return {
      purpose,
      miles: Math.round(miles * 10) / 10,
      tripCount: matchingEntries.length,
      deductionCents,
    };
  }).filter((summary) => summary.tripCount > 0);
}

function buildExpenseSummaries(
  expenseEntries: TaxReadyExpenseReport['expenseEntries'],
): ExpenseCategorySummary[] {
  return EXPENSE_CATEGORY_ORDER.map((category) => {
    const matchingEntries = expenseEntries.filter((entry) => entry.category === category);
    if (matchingEntries.length === 0) {
      return null;
    }

    return {
      category: category as ExpenseCategory,
      categoryLabel: matchingEntries[0]?.categoryLabel ?? category,
      amountCents: matchingEntries.reduce((sum, entry) => sum + entry.amountCents, 0),
      deductibleAmountCents: matchingEntries.reduce(
        (sum, entry) => sum + entry.deductibleAmountCents,
        0,
      ),
      transactionCount: matchingEntries.length,
    };
  }).filter((summary): summary is ExpenseCategorySummary => summary !== null);
}

export function generateTaxReadyExpenseReport(options: {
  trips: TripEntry[];
  transactions: ExpenseTransactionInput[];
  startDate?: string | null;
  endDate?: string | null;
}): TaxReadyExpenseReport {
  const { trips, transactions, startDate = null, endDate = null } = options;

  const tripEntries = trips.filter((trip) => isWithinPeriod(trip.date, startDate, endDate));
  const mileageEntries = tripEntries
    .filter((trip) => trip.purpose !== 'personal')
    .map((trip) => ({
      ...trip,
      ...calculateTripDeduction(trip),
    }));
  const expenseEntries = transactions
    .filter((transaction) => isWithinPeriod(transaction.date, startDate, endDate))
    .map((transaction) => classifyBusinessExpense(transaction))
    .filter((entry): entry is ExpenseClassification => entry !== null)
    .sort((left, right) => right.date.localeCompare(left.date));

  const mileageByPurpose = buildMileageSummaries(mileageEntries);
  const expenseByCategory = buildExpenseSummaries(expenseEntries);
  const totalMileageDeductionCents = mileageEntries.reduce(
    (sum, entry) => sum + entry.deductionCents,
    0,
  );
  const totalExpenseDeductionCents = expenseEntries.reduce(
    (sum, entry) => sum + entry.deductibleAmountCents,
    0,
  );

  return {
    period: {
      startDate,
      endDate,
      label: formatPeriodLabel(startDate, endDate),
    },
    tripEntries,
    mileageEntries,
    mileageByPurpose,
    expenseEntries,
    expenseByCategory,
    totalMileageDeductionCents,
    totalExpenseDeductionCents,
    grandTotalDeductionCents: totalMileageDeductionCents + totalExpenseDeductionCents,
  };
}

// --- Shift mileage audit report (IRS-friendly audit trail, #2137) ----------

function roundMiles(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildPlatformAuditSummaries(shifts: ShiftAuditGroup[]): PlatformAuditSummary[] {
  const byPlatform = new Map<string, PlatformAuditSummary>();

  for (const shift of shifts) {
    const existing = byPlatform.get(shift.platform) ?? {
      platform: shift.platform,
      shiftCount: 0,
      legCount: 0,
      miles: 0,
      deductionCents: 0,
    };

    existing.shiftCount += 1;
    existing.legCount += shift.legCount;
    existing.miles = roundMiles(existing.miles + shift.miles);
    existing.deductionCents += shift.deductionCents;
    byPlatform.set(shift.platform, existing);
  }

  return [...byPlatform.values()].sort((left, right) =>
    left.platform.localeCompare(right.platform),
  );
}

/**
 * Builds an IRS-friendly audit trail from work shifts: one row per leg (date,
 * purpose, miles, rate, deduction, shift, platform) plus per-shift and
 * per-platform rollups. Reuses {@link calculateTripDeduction} so the IRS rate
 * is never hardcoded.
 */
export function generateShiftMileageAuditReport(options: {
  shifts: WorkShift[];
  startDate?: string | null;
  endDate?: string | null;
}): ShiftMileageAuditReport {
  const { shifts, startDate = null, endDate = null } = options;

  const legs: ShiftAuditLeg[] = [];
  const shiftGroups: ShiftAuditGroup[] = [];

  for (const shift of shifts) {
    const shiftDate = shift.startedAt.slice(0, 10);
    if (!isWithinPeriod(shiftDate, startDate, endDate)) {
      continue;
    }

    let shiftMiles = 0;
    let shiftDeductionCents = 0;

    for (const leg of shift.legs) {
      if (leg.purpose === 'personal') {
        continue;
      }

      const calculation = calculateTripDeduction(leg);
      shiftMiles += leg.miles;
      shiftDeductionCents += calculation.deductionCents;

      legs.push({
        shiftId: shift.id,
        platform: shift.platform,
        legId: leg.id,
        date: leg.date,
        purpose: leg.purpose,
        startLocation: leg.startLocation,
        endLocation: leg.endLocation,
        miles: leg.miles,
        rateCentsPerMile: calculation.rateCentsPerMile,
        deductionCents: calculation.deductionCents,
        appliedYear: calculation.appliedYear,
      });
    }

    shiftGroups.push({
      shiftId: shift.id,
      platform: shift.platform,
      date: shiftDate,
      startedAt: shift.startedAt,
      endedAt: shift.endedAt,
      status: shift.status,
      legCount: shift.legs.length,
      miles: roundMiles(shiftMiles),
      deductionCents: shiftDeductionCents,
    });
  }

  legs.sort((left, right) => right.date.localeCompare(left.date));
  shiftGroups.sort((left, right) => right.startedAt.localeCompare(left.startedAt));

  const totalMiles = roundMiles(legs.reduce((sum, leg) => sum + leg.miles, 0));
  const totalDeductionCents = legs.reduce((sum, leg) => sum + leg.deductionCents, 0);

  return {
    period: {
      startDate,
      endDate,
      label: formatPeriodLabel(startDate, endDate),
    },
    legs,
    shifts: shiftGroups,
    byPlatform: buildPlatformAuditSummaries(shiftGroups),
    totalMiles,
    totalDeductionCents,
  };
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/**
 * Serialises a shift audit report to CSV text suitable for an IRS audit trail.
 * Money columns are emitted in dollars from integer cents.
 */
export function buildShiftMileageAuditCsv(report: ShiftMileageAuditReport): string {
  const header = [
    'Date',
    'Platform',
    'Shift ID',
    'Purpose',
    'Start',
    'End',
    'Miles',
    'Rate (cents/mi)',
    'Deduction (USD)',
    'Applied year',
  ];

  const rows = report.legs.map((leg) =>
    [
      leg.date,
      leg.platform,
      leg.shiftId,
      leg.purpose,
      leg.startLocation,
      leg.endLocation,
      leg.miles.toFixed(1),
      String(leg.rateCentsPerMile),
      (leg.deductionCents / 100).toFixed(2),
      String(leg.appliedYear),
    ]
      .map((cell) => escapeCsvCell(cell))
      .join(','),
  );

  const totalRow = [
    'Total',
    '',
    '',
    '',
    '',
    '',
    report.totalMiles.toFixed(1),
    '',
    (report.totalDeductionCents / 100).toFixed(2),
    '',
  ]
    .map((cell) => escapeCsvCell(cell))
    .join(',');

  return [header.map((cell) => escapeCsvCell(cell)).join(','), ...rows, totalRow].join('\r\n');
}
