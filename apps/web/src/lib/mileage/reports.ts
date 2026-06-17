// SPDX-License-Identifier: BUSL-1.1

import { calculateTripDeduction } from './calculator';
import { classifyBusinessExpense, getExpenseCategoryOptions } from './expenseRules';
import type {
  ExpenseCategory,
  ExpenseCategorySummary,
  ExpenseClassification,
  ExpenseTransactionInput,
  MileagePurposeSummary,
  TaxReadyExpenseReport,
  TripEntry,
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
