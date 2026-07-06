// SPDX-License-Identifier: BUSL-1.1

/**
 * Per-debt payoff milestone timeline.
 *
 * The payoff engine already records the month each debt reaches zero
 * (`AmortizationSchedule.monthsToPayoff`). This helper turns that raw data into
 * an ordered, date-stamped milestone list so the UI can show the user *when*
 * each individual debt clears — the emotional core of the snowball method —
 * instead of only the single aggregate debt-free date.
 *
 * Pure function — no side effects, fully testable.
 */

import { addMonthsToIsoDate } from '../date-utils';
import type { StrategyResult } from '../debt-types';

/** A single debt's projected payoff moment. */
export interface PayoffMilestone {
  /** Stable id of the debt that clears at this milestone. */
  readonly debtId: string;
  /** Human-readable debt name. */
  readonly debtName: string;
  /** Number of months from today until this debt is fully paid. */
  readonly monthsToPayoff: number;
  /** Projected ISO date (YYYY-MM-DD) the debt is fully paid. */
  readonly payoffDateIso: string;
}

/**
 * Build a chronological, date-stamped payoff milestone list for a strategy
 * result.
 *
 * Only meaningful when the plan actually reaches debt-free: if any debt never
 * amortizes (`fullyPaidOff === false`), the per-debt months are capped at the
 * simulation horizon and would render as a fake countdown, so an empty list is
 * returned instead. Debts are sorted by the month they clear (ascending) so the
 * list reads as a true timeline regardless of internal strategy ordering.
 *
 * @param result - A completed strategy simulation.
 * @param todayIso - Reference "today" as an ISO date (YYYY-MM-DD).
 * @returns Ordered milestones, earliest payoff first; empty when not fully paid.
 */
export function buildPayoffMilestones(
  result: Pick<StrategyResult, 'schedules' | 'fullyPaidOff'>,
  todayIso: string,
): PayoffMilestone[] {
  if (!result.fullyPaidOff) return [];

  return result.schedules
    .filter((schedule) => schedule.monthsToPayoff > 0)
    .slice()
    .sort((a, b) => a.monthsToPayoff - b.monthsToPayoff)
    .map((schedule) => ({
      debtId: schedule.debtId,
      debtName: schedule.debtName,
      monthsToPayoff: schedule.monthsToPayoff,
      payoffDateIso: addMonthsToIsoDate(todayIso, schedule.monthsToPayoff),
    }));
}
