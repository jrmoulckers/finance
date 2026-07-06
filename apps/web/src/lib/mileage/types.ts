// SPDX-License-Identifier: BUSL-1.1

export type TripPurpose = 'business' | 'medical' | 'charity' | 'moving' | 'personal';
export type MileageRatePurpose = Exclude<TripPurpose, 'personal'>;
export type ExpenseCategory =
  'travel' | 'meals' | 'equipment' | 'home-office' | 'professional-services' | 'subscriptions';
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

// --- Shift-based mileage (delivery-driver flow, #2137) ---------------------
// A work shift groups multiple trip "legs" between deliveries so a driver can
// start/pause/resume/end a shift and attach mileage to a platform without
// re-typing full route details for every leg.

export type ShiftStatus = 'active' | 'paused' | 'ended';

/** Recurring route presets/hotspots a driver can tap to prefill a leg. */
export type RoutePresetKind = 'home' | 'hotspot' | 'store-cluster' | 'gas-station';

export interface RoutePreset {
  id: string;
  kind: RoutePresetKind;
  label: string;
  location: string;
}

/** A single pause window inside a shift; open while `resumedAt` is null. */
export interface ShiftPause {
  pausedAt: string;
  resumedAt: string | null;
}

/**
 * A work shift. `legs` reuse the existing {@link TripEntry} model (no duplicate
 * trip model) so a leg is just a trip attached to this shift + platform.
 */
export interface WorkShift {
  id: string;
  platform: string;
  status: ShiftStatus;
  startedAt: string;
  endedAt: string | null;
  pauses: ShiftPause[];
  legs: TripEntry[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** A driver-facing summary of a single shift (miles + IRS-rate deduction). */
export interface WorkShiftSummary {
  shiftId: string;
  platform: string;
  date: string;
  status: ShiftStatus;
  legCount: number;
  miles: number;
  deductionCents: number;
  activeDurationMs: number;
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

// --- Shift mileage audit report (IRS-friendly audit trail, #2137) ----------

/** One audit row per leg: date, purpose, miles, rate, deduction, shift, platform. */
export interface ShiftAuditLeg {
  shiftId: string;
  platform: string;
  legId: string;
  date: string;
  purpose: TripPurpose;
  startLocation: string;
  endLocation: string;
  miles: number;
  rateCentsPerMile: number;
  deductionCents: number;
  appliedYear: number;
}

export interface ShiftAuditGroup {
  shiftId: string;
  platform: string;
  date: string;
  startedAt: string;
  endedAt: string | null;
  status: ShiftStatus;
  legCount: number;
  miles: number;
  deductionCents: number;
}

export interface PlatformAuditSummary {
  platform: string;
  shiftCount: number;
  legCount: number;
  miles: number;
  deductionCents: number;
}

export interface ShiftMileageAuditReport {
  period: ReportPeriod;
  legs: ShiftAuditLeg[];
  shifts: ShiftAuditGroup[];
  byPlatform: PlatformAuditSummary[];
  totalMiles: number;
  totalDeductionCents: number;
}
