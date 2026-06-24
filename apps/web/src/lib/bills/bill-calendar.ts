// SPDX-License-Identifier: BUSL-1.1

/**
 * Bill calendar engine — aligns upcoming bills with a payday schedule.
 *
 * Given a payday cadence (weekly, biweekly, semi-monthly, monthly) plus a list
 * of recurring/scheduled bills, this engine:
 *   1. Generates the upcoming paydays that bound each pay period.
 *   2. Expands each recurring bill into concrete occurrences inside the horizon.
 *   3. Buckets those occurrences into pay periods (payday -> next payday).
 *   4. Computes the total due before each payday and whether the expected
 *      income for the period covers the bills due in it.
 *
 * Pure, deterministic functions — no side effects, no reliance on `Date.now()`.
 * The caller supplies `fromDate` ("today") so results are fully testable.
 *
 * All monetary values are integer cents to avoid floating-point errors.
 *
 * References: issue #2196
 */

import type { Bill, BillFrequency, LocalDate, SyncId } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cadence on which the user is paid. */
export type PaydayCadence = 'WEEKLY' | 'BIWEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';

/** Human-readable labels for each payday cadence. */
export const PAYDAY_CADENCE_LABELS: Record<PaydayCadence, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every two weeks',
  SEMI_MONTHLY: 'Twice a month (15th & last day)',
  MONTHLY: 'Monthly',
};

/** Configuration describing when a user is paid and how much they net. */
export interface PaydaySchedule {
  /** Cadence of paydays. */
  readonly cadence: PaydayCadence;
  /**
   * A known payday (ISO local date). Used as the anchor for WEEKLY/BIWEEKLY
   * and as the day-of-month for MONTHLY. Ignored for SEMI_MONTHLY (which is
   * fixed to the 15th and last day of each month).
   */
  readonly anchorDate: LocalDate;
  /** Expected net income deposited each payday, in integer cents. */
  readonly expectedIncomeCents: number;
}

/** A single concrete occurrence of a bill on a specific date. */
export interface BillOccurrence {
  /** Identifier of the source bill. */
  readonly billId: SyncId;
  /** Display name of the bill. */
  readonly name: string;
  /** Payee for the bill. */
  readonly payee: string;
  /** Amount due for this occurrence, in integer cents. */
  readonly amountCents: number;
  /** ISO 4217 currency code. */
  readonly currencyCode: string;
  /** ISO local date this occurrence is due. */
  readonly dueDate: LocalDate;
  /** Frequency of the source bill. */
  readonly frequency: BillFrequency;
  /** Whether the source bill is set to auto-pay. */
  readonly isAutoPay: boolean;
}

/** A pay period running from one payday up to (but not including) the next. */
export interface PayPeriod {
  /** Zero-based index of the period within the calendar. */
  readonly index: number;
  /** Payday that begins this period (income lands here). */
  readonly paydayDate: LocalDate;
  /** The next payday, which closes this period (exclusive). */
  readonly nextPaydayDate: LocalDate;
  /** Expected income deposited for this period, in integer cents. */
  readonly expectedIncomeCents: number;
  /** Bill occurrences due within this period, ordered by due date. */
  readonly bills: readonly BillOccurrence[];
  /** Sum of all bill occurrences due in this period, in integer cents. */
  readonly totalDueCents: number;
  /** Expected income minus total due (negative means a shortfall). */
  readonly coverageCents: number;
  /** `true` when expected income covers the bills due in this period. */
  readonly covered: boolean;
}

/** Result of {@link buildBillCalendar}. */
export interface BillCalendar {
  /** Cadence used to build the calendar. */
  readonly cadence: PaydayCadence;
  /** The reference "today" the calendar was built from. */
  readonly fromDate: LocalDate;
  /** Pay periods ordered from the current period forward. */
  readonly periods: readonly PayPeriod[];
  /** Total bills due across all periods, in integer cents. */
  readonly totalDueCents: number;
  /** Total expected income across all periods, in integer cents. */
  readonly totalIncomeCents: number;
  /** Total income minus total due across all periods, in integer cents. */
  readonly totalCoverageCents: number;
}

/** Options for {@link buildBillCalendar}. */
export interface BuildBillCalendarOptions {
  /** Bills to schedule. PAID and CANCELLED bills are ignored. */
  readonly bills: readonly Bill[];
  /** Payday schedule describing income cadence and amount. */
  readonly schedule: PaydaySchedule;
  /** Reference "today" as an ISO local date. */
  readonly fromDate: LocalDate;
  /** Number of pay periods to project (default 3). */
  readonly periodsToShow?: number;
}

// ---------------------------------------------------------------------------
// Deterministic date helpers (operate purely on ISO "YYYY-MM-DD" strings)
// ---------------------------------------------------------------------------

interface YMD {
  readonly y: number;
  readonly m: number; // 1-12
  readonly d: number; // 1-31
}

/** Parse an ISO local date into year/month/day integers. */
function parseDate(iso: LocalDate): YMD {
  const [y, m, d] = iso.split('-').map((part) => Number.parseInt(part, 10));
  return { y, m, d };
}

/** Pad a number to two digits. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Format year/month/day integers as an ISO local date. */
function toIso(y: number, m: number, d: number): LocalDate {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Number of days in the given month (m is 1-12). */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Add `n` days to an ISO local date (deterministic via UTC). */
function addDays(iso: LocalDate, n: number): LocalDate {
  const { y, m, d } = parseDate(iso);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Add `n` whole months to an ISO local date, clamping the day-of-month to the
 * length of the target month (e.g. Jan 31 + 1 month = Feb 28/29). The day is
 * always derived from the original date so repeated calls do not drift.
 */
function addMonths(iso: LocalDate, n: number): LocalDate {
  const { y, m, d } = parseDate(iso);
  const monthIndex = y * 12 + (m - 1) + n;
  const ny = Math.floor(monthIndex / 12);
  const nm = (monthIndex % 12) + 1;
  const day = Math.min(d, lastDayOfMonth(ny, nm));
  return toIso(ny, nm, day);
}

/** Whole days from `a` to `b` (positive when `b` is after `a`). */
function daysBetween(a: LocalDate, b: LocalDate): number {
  const da = parseDate(a);
  const db = parseDate(b);
  const ma = Date.UTC(da.y, da.m - 1, da.d);
  const mb = Date.UTC(db.y, db.m - 1, db.d);
  return Math.round((mb - ma) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Payday generation
// ---------------------------------------------------------------------------

/** Safety cap so malformed inputs can never loop forever. */
const MAX_OCCURRENCE_ITERATIONS = 600;

function generateFixedStepPaydays(
  anchorDate: LocalDate,
  fromDate: LocalDate,
  stepDays: number,
  count: number,
): LocalDate[] {
  // Find the most recent payday on or before `fromDate`.
  const diff = daysBetween(anchorDate, fromDate);
  const k = Math.floor(diff / stepDays);
  const start = addDays(anchorDate, k * stepDays);
  const paydays: LocalDate[] = [];
  for (let i = 0; i < count; i++) {
    paydays.push(addDays(start, i * stepDays));
  }
  return paydays;
}

function generateMonthlyPaydays(
  anchorDate: LocalDate,
  fromDate: LocalDate,
  count: number,
): LocalDate[] {
  const anchorDay = parseDate(anchorDate).d;
  const from = parseDate(fromDate);
  let year = from.y;
  let month = from.m;
  // If this month's payday has not happened yet, start from the previous month.
  const candidateDay = Math.min(anchorDay, lastDayOfMonth(year, month));
  if (toIso(year, month, candidateDay) > fromDate) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  const paydays: LocalDate[] = [];
  for (let i = 0; i < count; i++) {
    // Re-anchor on `anchorDay` each step so short months never cause drift.
    const monthIndex = year * 12 + (month - 1) + i;
    const py = Math.floor(monthIndex / 12);
    const pm = (monthIndex % 12) + 1;
    const day = Math.min(anchorDay, lastDayOfMonth(py, pm));
    paydays.push(toIso(py, pm, day));
  }
  return paydays;
}

function generateSemiMonthlyPaydays(fromDate: LocalDate, count: number): LocalDate[] {
  const from = parseDate(fromDate);
  // Begin a month early so the most-recent payday is always captured.
  let year = from.y;
  let month = from.m - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  const all: LocalDate[] = [];
  while (all.length < count + 4) {
    all.push(toIso(year, month, 15));
    all.push(toIso(year, month, lastDayOfMonth(year, month)));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  // `all` is already ascending (15th < last day; months ascending).
  let startIdx = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i] <= fromDate) {
      startIdx = i;
    } else {
      break;
    }
  }
  return all.slice(startIdx, startIdx + count);
}

/**
 * Generate `count` paydays starting from the most recent payday on or before
 * `fromDate`, ordered ascending.
 */
export function generatePaydays(
  schedule: PaydaySchedule,
  fromDate: LocalDate,
  count: number,
): LocalDate[] {
  const safeCount = Math.max(0, Math.trunc(count));
  if (safeCount === 0) return [];

  switch (schedule.cadence) {
    case 'WEEKLY':
      return generateFixedStepPaydays(schedule.anchorDate, fromDate, 7, safeCount);
    case 'BIWEEKLY':
      return generateFixedStepPaydays(schedule.anchorDate, fromDate, 14, safeCount);
    case 'MONTHLY':
      return generateMonthlyPaydays(schedule.anchorDate, fromDate, safeCount);
    case 'SEMI_MONTHLY':
      return generateSemiMonthlyPaydays(fromDate, safeCount);
  }
}

// ---------------------------------------------------------------------------
// Bill occurrence expansion
// ---------------------------------------------------------------------------

/** Compute the date of the `i`-th occurrence of a bill from its base due date. */
function occurrenceAt(baseDueDate: LocalDate, frequency: BillFrequency, i: number): LocalDate {
  switch (frequency) {
    case 'ONE_TIME':
      return baseDueDate;
    case 'WEEKLY':
      return addDays(baseDueDate, i * 7);
    case 'BIWEEKLY':
      return addDays(baseDueDate, i * 14);
    case 'MONTHLY':
      return addMonths(baseDueDate, i);
    case 'QUARTERLY':
      return addMonths(baseDueDate, i * 3);
    case 'YEARLY':
      return addMonths(baseDueDate, i * 12);
  }
}

function toOccurrence(bill: Bill, dueDate: LocalDate): BillOccurrence {
  return {
    billId: bill.id,
    name: bill.name,
    payee: bill.payee,
    amountCents: bill.amount.amount,
    currencyCode: bill.currency.code,
    dueDate,
    frequency: bill.frequency,
    isAutoPay: bill.isAutoPay,
  };
}

/**
 * Expand recurring bills into concrete occurrences within the half-open window
 * `[windowStart, windowEndExclusive)`. PAID and CANCELLED bills are ignored.
 */
export function expandBillOccurrences(
  bills: readonly Bill[],
  windowStart: LocalDate,
  windowEndExclusive: LocalDate,
): BillOccurrence[] {
  const occurrences: BillOccurrence[] = [];

  for (const bill of bills) {
    if (bill.status === 'PAID' || bill.status === 'CANCELLED') continue;

    const base = bill.dueDate;

    if (bill.frequency === 'ONE_TIME') {
      if (base >= windowStart && base < windowEndExclusive) {
        occurrences.push(toOccurrence(bill, base));
      }
      continue;
    }

    for (let i = 0; i < MAX_OCCURRENCE_ITERATIONS; i++) {
      const date = occurrenceAt(base, bill.frequency, i);
      if (date >= windowEndExclusive) break;
      if (date >= windowStart) {
        occurrences.push(toOccurrence(bill, date));
      }
    }
  }

  return occurrences;
}

// ---------------------------------------------------------------------------
// Calendar assembly
// ---------------------------------------------------------------------------

/** Default number of pay periods to project. */
export const DEFAULT_PERIODS_TO_SHOW = 3;

/**
 * Build a payday-aligned bill calendar: pay periods with the bills due in each,
 * the total due before each payday, and per-period income coverage.
 */
export function buildBillCalendar(options: BuildBillCalendarOptions): BillCalendar {
  const { bills, schedule, fromDate } = options;
  const periodsToShow = Math.max(1, Math.trunc(options.periodsToShow ?? DEFAULT_PERIODS_TO_SHOW));

  // One extra payday is needed to close the final period.
  const paydays = generatePaydays(schedule, fromDate, periodsToShow + 1);

  const windowStart = paydays[0];
  const windowEnd = paydays[paydays.length - 1];
  const occurrences = expandBillOccurrences(bills, windowStart, windowEnd);

  const grouped: BillOccurrence[][] = Array.from({ length: periodsToShow }, () => []);
  for (const occ of occurrences) {
    for (let i = 0; i < periodsToShow; i++) {
      if (occ.dueDate >= paydays[i] && occ.dueDate < paydays[i + 1]) {
        grouped[i].push(occ);
        break;
      }
    }
  }

  const periods: PayPeriod[] = grouped.map((periodBills, index) => {
    const sorted = [...periodBills].sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name),
    );
    const totalDueCents = sorted.reduce((sum, occ) => sum + occ.amountCents, 0);
    const coverageCents = schedule.expectedIncomeCents - totalDueCents;
    return {
      index,
      paydayDate: paydays[index],
      nextPaydayDate: paydays[index + 1],
      expectedIncomeCents: schedule.expectedIncomeCents,
      bills: sorted,
      totalDueCents,
      coverageCents,
      covered: coverageCents >= 0,
    };
  });

  const totalDueCents = periods.reduce((sum, p) => sum + p.totalDueCents, 0);
  const totalIncomeCents = periods.reduce((sum, p) => sum + p.expectedIncomeCents, 0);

  return {
    cadence: schedule.cadence,
    fromDate,
    periods,
    totalDueCents,
    totalIncomeCents,
    totalCoverageCents: totalIncomeCents - totalDueCents,
  };
}

// ---------------------------------------------------------------------------
// Risk classification (high-risk pay periods) and one-time expenses
// ---------------------------------------------------------------------------

/**
 * Risk level for a single pay period, judged against the expected income.
 *  - `unknown`  – no income entered yet, so coverage cannot be assessed.
 *  - `shortfall`– bills due before the next payday exceed expected income.
 *  - `tight`    – covered, but the leftover buffer is a thin slice of income.
 *  - `covered`  – comfortably covered.
 *
 * Both `shortfall` and `tight` are treated as "high-risk" so single parents see
 * the weeks where money is dangerously close to running out before payday.
 */
export type PeriodRisk = 'covered' | 'tight' | 'shortfall' | 'unknown';

/**
 * Share of expected income that, when the leftover buffer falls below it, marks
 * a pay period as financially "tight" (high-risk-adjacent). For example, with a
 * 10% ratio a $2,000 paycheck is tight when under $200 is left after bills.
 */
export const TIGHT_COVERAGE_RATIO = 0.1;

/** Plain-language labels for each {@link PeriodRisk}, safe for screen readers. */
export const PERIOD_RISK_LABELS: Record<PeriodRisk, string> = {
  covered: 'On track',
  tight: 'Tight — little left after bills',
  shortfall: 'High-risk — bills exceed this paycheck',
  unknown: 'Add income to assess risk',
};

/** Classify how risky a pay period is, given whether income was supplied. */
export function classifyPeriodRisk(period: PayPeriod, incomeProvided: boolean): PeriodRisk {
  if (!incomeProvided || period.expectedIncomeCents <= 0) return 'unknown';
  if (period.coverageCents < 0) return 'shortfall';
  if (period.coverageCents < Math.round(period.expectedIncomeCents * TIGHT_COVERAGE_RATIO)) {
    return 'tight';
  }
  return 'covered';
}

/**
 * A pay period is "high-risk" when bills outpace — or come dangerously close to
 * outpacing — the income landing on that payday.
 */
export function isHighRiskPeriod(period: PayPeriod, incomeProvided: boolean): boolean {
  const risk = classifyPeriodRisk(period, incomeProvided);
  return risk === 'shortfall' || risk === 'tight';
}

/**
 * One-time (non-recurring) bill occurrences due in a period. These are the
 * one-off "kid expenses" — school fees, birthdays, sports signups — planned
 * alongside recurring bills rather than tracked separately.
 */
export function oneTimeOccurrences(period: PayPeriod): readonly BillOccurrence[] {
  return period.bills.filter((bill) => bill.frequency === 'ONE_TIME');
}

/** Total of one-time expenses due in a period, in integer cents. */
export function oneTimeDueCents(period: PayPeriod): number {
  return oneTimeOccurrences(period).reduce((sum, bill) => sum + bill.amountCents, 0);
}

/** Calendar-wide risk + one-off-expense summary for the at-a-glance banner. */
export interface CalendarRiskSummary {
  /** Number of pay periods flagged high-risk (shortfall or tight). */
  readonly highRiskPeriodCount: number;
  /** Number of pay periods with an outright shortfall. */
  readonly shortfallPeriodCount: number;
  /** Payday of the first period that runs short, or `null` if none. */
  readonly firstShortfallPaydayDate: LocalDate | null;
  /** Total one-time (non-recurring) expenses across the horizon, in cents. */
  readonly oneTimeDueCents: number;
  /** Count of one-time expense occurrences across the horizon. */
  readonly oneTimeCount: number;
}

/** Summarise risk and one-off expenses across an entire {@link BillCalendar}. */
export function summarizeCalendarRisk(
  calendar: BillCalendar,
  incomeProvided: boolean,
): CalendarRiskSummary {
  let highRiskPeriodCount = 0;
  let shortfallPeriodCount = 0;
  let firstShortfallPaydayDate: LocalDate | null = null;
  let totalOneTimeCents = 0;
  let oneTimeCount = 0;

  for (const period of calendar.periods) {
    const risk = classifyPeriodRisk(period, incomeProvided);
    if (risk === 'shortfall' || risk === 'tight') highRiskPeriodCount += 1;
    if (risk === 'shortfall') {
      shortfallPeriodCount += 1;
      if (firstShortfallPaydayDate === null) firstShortfallPaydayDate = period.paydayDate;
    }
    for (const bill of period.bills) {
      if (bill.frequency === 'ONE_TIME') {
        totalOneTimeCents += bill.amountCents;
        oneTimeCount += 1;
      }
    }
  }

  return {
    highRiskPeriodCount,
    shortfallPeriodCount,
    firstShortfallPaydayDate,
    oneTimeDueCents: totalOneTimeCents,
    oneTimeCount,
  };
}
