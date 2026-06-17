// SPDX-License-Identifier: BUSL-1.1

export type TripPurpose = 'business' | 'medical' | 'charity' | 'moving' | 'personal';
export type MileageRatePurpose = Exclude<TripPurpose, 'personal'>;
export type ExpenseCategory =
  | 'travel'
  | 'meals'
  | 'equipment'
  | 'home-office'
  | 'professional-services'
  | 'subscriptions';
export type DeductionType = 'mileage' | 'business-expense';
export type BusinessExpenseSource = 'manual' | 'rule';

export interface TripEntryDraft {
  date: string;
  startLocation: string;
  endLocation: string;
  miles?: number | null;
  odometerStart?: number | null;
  odometerEnd?: number | null;
  purpose: TripPurpose;
  notes?: string;
  businessUsePercent?: number;
}

export interface TripEntry {
  id: string;
  date: string;
  startLocation: string;
  endLocation: string;
  miles: number;
  odometerStart: number | null;
  odometerEnd: number | null;
  purpose: TripPurpose;
  notes: string;
  businessUsePercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface MileageCalculation {
  rateCentsPerMile: number;
  deductionCents: number;
  appliedYear: number;
}

export interface BusinessExpenseMetadata {
  category: ExpenseCategory;
  businessUsePercent: number;
  deductiblePercent: number;
  note: string;
  source: BusinessExpenseSource;
  taggedAt: string;
}

export interface ExpenseTransactionInput {
  id: string;
  date: string;
  payee: string | null;
  note: string | null;
  amountCents: number;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  tags: readonly string[];
  customFields: Readonly<Record<string, string>> | null;
  categoryName?: string | null;
}

export interface ExpenseClassification extends BusinessExpenseMetadata {
  transactionId: string;
  date: string;
  payee: string;
  amountCents: number;
  deductibleAmountCents: number;
  deductionType: DeductionType;
  categoryLabel: string;
}

export interface MileagePurposeSummary {
  purpose: MileageRatePurpose;
  miles: number;
  tripCount: number;
  deductionCents: number;
}

export interface ExpenseCategorySummary {
  category: ExpenseCategory;
  categoryLabel: string;
  amountCents: number;
  deductibleAmountCents: number;
  transactionCount: number;
}

export interface ReportPeriod {
  startDate: string | null;
  endDate: string | null;
  label: string;
}

export interface TaxReadyExpenseReport {
  period: ReportPeriod;
  tripEntries: TripEntry[];
  mileageEntries: Array<TripEntry & MileageCalculation>;
  mileageByPurpose: MileagePurposeSummary[];
  expenseEntries: ExpenseClassification[];
  expenseByCategory: ExpenseCategorySummary[];
  totalMileageDeductionCents: number;
  totalExpenseDeductionCents: number;
  grandTotalDeductionCents: number;
}
