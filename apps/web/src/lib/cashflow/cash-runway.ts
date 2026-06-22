// SPDX-License-Identifier: BUSL-1.1

/**
 * Cash runway forecasting engine.
 *
 * Projects a small business's running cash balance forward, day-by-day, from a
 * known starting cash position plus a set of scheduled inflows (expected
 * revenue, invoice payments) and outflows (payroll, taxes, recurring truck /
 * business bills). It answers the question:
 *
 *   "Can I cover payroll / taxes / bills before revenue lands?"
 *
 * The engine surfaces:
 *   - an ordered, day-by-day projected-balance timeline,
 *   - the first date the balance would go negative (the "runway"),
 *   - the minimum projected balance and the date it occurs,
 *   - total projected inflow, outflow and net change over the horizon.
 *
 * Design rules:
 *   - ALL monetary values are integer **cents**. No floats, no rounding drift.
 *   - Pure functions, no side effects — fully deterministic and testable.
 *   - Recurring events are expanded into discrete occurrences inside the
 *     horizon. Anchored stepping (k * interval from the anchor date) avoids
 *     calendar drift.
 *   - Events on the same day are netted into a single timeline point.
 *   - Ordering is deterministic: timeline points by date ascending; events
 *     within a day by direction (outflow first), then amount desc, then id.
 *
 * References: issue #2185
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Local calendar date in `YYYY-MM-DD` form. */
export type IsoDate = string;

/** Whether a scheduled event adds (inflow) or removes (outflow) cash. */
export type CashEventDirection = 'inflow' | 'outflow';

/** How often a scheduled event repeats within the horizon. */
export type RecurrenceFrequency =
  | 'once'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

/** A scheduled cash movement, optionally recurring. */
export interface ScheduledCashEvent {
  /** Stable identifier for the source event. */
  readonly id: string;
  /** Human-readable label (e.g. "Payroll", "Q3 estimated tax", "Truck lease"). */
  readonly label: string;
  /** Inflow adds cash; outflow removes it. */
  readonly direction: CashEventDirection;
  /**
   * Magnitude in integer cents. Always non-negative; {@link direction}
   * determines the sign applied to the running balance.
   */
  readonly amountCents: number;
  /** First (or only) occurrence date, `YYYY-MM-DD`. */
  readonly date: IsoDate;
  /** Repeat cadence; defaults to `'once'`. */
  readonly frequency?: RecurrenceFrequency;
  /** Optional grouping for display (e.g. "payroll", "taxes", "bills"). */
  readonly category?: string;
}

/** A single materialised occurrence of a scheduled event within the horizon. */
export interface CashEventOccurrence {
  /** Unique id for this occurrence (`<sourceId>@<date>`). */
  readonly id: string;
  /** Identifier of the originating {@link ScheduledCashEvent}. */
  readonly sourceId: string;
  /** Label carried from the source event. */
  readonly label: string;
  /** Direction carried from the source event. */
  readonly direction: CashEventDirection;
  /** Signed cents: inflows positive, outflows negative. */
  readonly amountCents: number;
  /** Occurrence date, `YYYY-MM-DD`. */
  readonly date: IsoDate;
  /** Optional category carried from the source event. */
  readonly category?: string;
}

/** Projected state for a single day that has at least one event. */
export interface ProjectedBalancePoint {
  /** Day this point describes, `YYYY-MM-DD`. */
  readonly date: IsoDate;
  /** Total inflow on this day (non-negative cents). */
  readonly inflowCents: number;
  /** Total outflow on this day (non-negative cents). */
  readonly outflowCents: number;
  /** Net change applied on this day (signed cents). */
  readonly netChangeCents: number;
  /** Running balance after this day's events (signed cents). */
  readonly balanceCents: number;
  /** Occurrences contributing to this day, in deterministic order. */
  readonly events: readonly CashEventOccurrence[];
}

/** Overall runway health. */
export type RunwayStatus = 'healthy' | 'shortfall';

/** Result of a cash runway projection. */
export interface CashRunwayForecast {
  /** Starting cash balance in cents (echoed for convenience). */
  readonly startingCashCents: number;
  /** Forecast horizon length in weeks. */
  readonly horizonWeeks: number;
  /** Inclusive start of the horizon (anchor "today"). */
  readonly startDate: IsoDate;
  /** Inclusive end of the horizon. */
  readonly endDate: IsoDate;
  /** Ordered timeline of days that carry events within the horizon. */
  readonly timeline: readonly ProjectedBalancePoint[];
  /** First date the balance is `< 0`, or `null` if it never goes negative. */
  readonly shortfallDate: IsoDate | null;
  /** `'shortfall'` when the balance dips below zero within the horizon. */
  readonly status: RunwayStatus;
  /** Whole days from {@link startDate} to {@link shortfallDate}, or `null`. */
  readonly runwayDays: number | null;
  /** Lowest projected balance over the horizon (signed cents). */
  readonly minBalanceCents: number;
  /** Date the {@link minBalanceCents} is first reached. */
  readonly minBalanceDate: IsoDate;
  /** Total inflow over the horizon (non-negative cents). */
  readonly totalInflowCents: number;
  /** Total outflow over the horizon (non-negative cents). */
  readonly totalOutflowCents: number;
  /** Net projected change over the horizon (signed cents). */
  readonly totalNetCents: number;
  /** Projected balance at the end of the horizon (signed cents). */
  readonly endingBalanceCents: number;
}

/** Inputs to {@link forecastCashRunway}. */
export interface CashRunwayInput {
  /** Current cash balance in integer cents. */
  readonly startingCashCents: number;
  /** Scheduled inflows and outflows. */
  readonly events: readonly ScheduledCashEvent[];
  /** Forecast horizon in whole weeks. Defaults to 12. */
  readonly horizonWeeks?: number;
  /** Anchor "today" (`YYYY-MM-DD`). Defaults to the system local date. */
  readonly today?: IsoDate;
}

// ---------------------------------------------------------------------------
// Date helpers (local-date, drift-free)
// ---------------------------------------------------------------------------

const DEFAULT_HORIZON_WEEKS = 12;
/** Safety cap on recurrence expansion so a malformed event can't loop forever. */
const MAX_OCCURRENCES_PER_EVENT = 1000;

/** Parse a `YYYY-MM-DD` string into a local `Date` at midnight. */
function parseLocalDate(date: IsoDate): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Format a `Date` as a local `YYYY-MM-DD` string. */
function formatLocalDate(date: Date): IsoDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Return today's local date in `YYYY-MM-DD` form. */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  return formatLocalDate(now);
}

/** Add a whole number of days to a date string. */
function addDays(date: IsoDate, days: number): IsoDate {
  const next = parseLocalDate(date);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
}

/**
 * Add a whole number of months to a date string, clamping the day to the last
 * valid day of the target month (e.g. Jan 31 + 1 month → Feb 28/29).
 */
function addMonths(date: IsoDate, months: number): IsoDate {
  const parsed = parseLocalDate(date);
  const targetYear = parsed.getFullYear();
  const targetMonthIndex = parsed.getMonth() + months;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const clampedDay = Math.min(parsed.getDate(), lastDayOfTargetMonth);
  return formatLocalDate(new Date(targetYear, targetMonthIndex, clampedDay));
}

/** Whole days from `start` to `end` (negative if `end` precedes `start`). */
function daysBetween(start: IsoDate, end: IsoDate): number {
  const startMs = parseLocalDate(start).getTime();
  const endMs = parseLocalDate(end).getTime();
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

/** Step the k-th occurrence of an event from its anchor date. */
function occurrenceDate(anchor: IsoDate, frequency: RecurrenceFrequency, step: number): IsoDate {
  switch (frequency) {
    case 'weekly':
      return addDays(anchor, step * 7);
    case 'biweekly':
      return addDays(anchor, step * 14);
    case 'monthly':
      return addMonths(anchor, step);
    case 'quarterly':
      return addMonths(anchor, step * 3);
    case 'yearly':
      return addMonths(anchor, step * 12);
    case 'once':
    default:
      return anchor;
  }
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

/**
 * Expand a scheduled event into the discrete occurrences that fall within the
 * inclusive `[startDate, endDate]` horizon.
 *
 * Occurrences strictly before `startDate` are skipped — the starting cash
 * balance is assumed to already reflect anything that happened before today.
 */
export function expandEventOccurrences(
  event: ScheduledCashEvent,
  startDate: IsoDate,
  endDate: IsoDate,
): CashEventOccurrence[] {
  const frequency = event.frequency ?? 'once';
  const magnitude = Math.max(0, Math.trunc(event.amountCents));
  const signedAmount = event.direction === 'outflow' ? -magnitude : magnitude;
  const occurrences: CashEventOccurrence[] = [];

  for (let step = 0; step < MAX_OCCURRENCES_PER_EVENT; step += 1) {
    const date = occurrenceDate(event.date, frequency, step);

    if (date > endDate) {
      break;
    }

    if (date >= startDate) {
      occurrences.push({
        id: `${event.id}@${date}`,
        sourceId: event.id,
        label: event.label,
        direction: event.direction,
        amountCents: signedAmount,
        date,
        category: event.category,
      });
    }

    if (frequency === 'once') {
      break;
    }
  }

  return occurrences;
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const DIRECTION_ORDER: Record<CashEventDirection, number> = {
  outflow: 0,
  inflow: 1,
};

/** Deterministic ordering for occurrences sharing a date. */
function compareOccurrences(a: CashEventOccurrence, b: CashEventOccurrence): number {
  const directionDelta = DIRECTION_ORDER[a.direction] - DIRECTION_ORDER[b.direction];
  if (directionDelta !== 0) return directionDelta;

  // Larger magnitude first (outflows are negative, so compare absolute value).
  const magnitudeDelta = Math.abs(b.amountCents) - Math.abs(a.amountCents);
  if (magnitudeDelta !== 0) return magnitudeDelta;

  return a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Project a forward-looking cash runway from a starting balance and a set of
 * scheduled (optionally recurring) inflows and outflows.
 *
 * @param input - Starting cash, scheduled events, horizon and anchor date.
 * @returns A deterministic {@link CashRunwayForecast}.
 */
export function forecastCashRunway(input: CashRunwayInput): CashRunwayForecast {
  const horizonWeeks =
    input.horizonWeeks !== undefined && input.horizonWeeks > 0
      ? Math.trunc(input.horizonWeeks)
      : DEFAULT_HORIZON_WEEKS;
  const startingCashCents = Math.trunc(input.startingCashCents);
  const startDate = input.today ?? todayIsoDate();
  const endDate = addDays(startDate, horizonWeeks * 7);

  // 1. Expand every event into in-horizon occurrences.
  const occurrences = input.events.flatMap((event) =>
    expandEventOccurrences(event, startDate, endDate),
  );

  // 2. Group occurrences by day so same-day events net into one point.
  const byDate = new Map<IsoDate, CashEventOccurrence[]>();
  for (const occurrence of occurrences) {
    const bucket = byDate.get(occurrence.date);
    if (bucket) {
      bucket.push(occurrence);
    } else {
      byDate.set(occurrence.date, [occurrence]);
    }
  }

  const orderedDates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));

  // 3. Walk the timeline, accumulating the running balance.
  const timeline: ProjectedBalancePoint[] = [];
  let runningBalance = startingCashCents;
  let totalInflowCents = 0;
  let totalOutflowCents = 0;

  // The minimum candidate starts at the opening balance on the start date.
  let minBalanceCents = startingCashCents;
  let minBalanceDate = startDate;

  // A shortfall before any events means cash is already underwater today.
  let shortfallDate: IsoDate | null = startingCashCents < 0 ? startDate : null;

  for (const date of orderedDates) {
    const dayEvents = (byDate.get(date) ?? []).slice().sort(compareOccurrences);

    let inflowCents = 0;
    let outflowCents = 0;
    for (const occurrence of dayEvents) {
      if (occurrence.amountCents >= 0) {
        inflowCents += occurrence.amountCents;
      } else {
        outflowCents += -occurrence.amountCents;
      }
    }

    const netChangeCents = inflowCents - outflowCents;
    runningBalance += netChangeCents;
    totalInflowCents += inflowCents;
    totalOutflowCents += outflowCents;

    if (runningBalance < minBalanceCents) {
      minBalanceCents = runningBalance;
      minBalanceDate = date;
    }

    if (shortfallDate === null && runningBalance < 0) {
      shortfallDate = date;
    }

    timeline.push({
      date,
      inflowCents,
      outflowCents,
      netChangeCents,
      balanceCents: runningBalance,
      events: dayEvents,
    });
  }

  return {
    startingCashCents,
    horizonWeeks,
    startDate,
    endDate,
    timeline,
    shortfallDate,
    status: shortfallDate === null ? 'healthy' : 'shortfall',
    runwayDays: shortfallDate === null ? null : Math.max(0, daysBetween(startDate, shortfallDate)),
    minBalanceCents,
    minBalanceDate,
    totalInflowCents,
    totalOutflowCents,
    totalNetCents: totalInflowCents - totalOutflowCents,
    endingBalanceCents: runningBalance,
  };
}
