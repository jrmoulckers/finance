// SPDX-License-Identifier: BUSL-1.1

/**
 * Generic life event planning framework.
 *
 * Provides tools for defining life events with target dates and costs,
 * performing savings gap analysis, generating timelines with milestones,
 * and ranking/analyzing multiple concurrent events.
 *
 * All monetary values are in integer cents.
 *
 * References: #1769
 */

import type { LifeEvent, LifeEventAnalysis, LifeEventMilestone, MultiEventAnalysis } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard milestone percentages for progress tracking. */
const MILESTONE_PERCENTS = [25, 50, 75, 100] as const;

/** Milestone celebration labels. */
const MILESTONE_LABELS: Record<number, string> = {
  25: '25% saved — great start!',
  50: 'Halfway there!',
  75: '75% — almost there!',
  100: 'Fully funded! 🎉',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply Banker's rounding (round half to even) to a number.
 *
 * @param value - The value to round
 * @returns The rounded integer
 */
function bankersRound(value: number): number {
  const floored = Math.floor(value);
  const diff = value - floored;
  if (Math.abs(diff - 0.5) < 1e-10) {
    return floored % 2 === 0 ? floored : floored + 1;
  }
  return Math.round(value);
}

/**
 * Calculate months between today and a target date.
 *
 * @param targetDate - ISO-8601 date string
 * @param today - Reference date (defaults to now)
 * @returns Number of months (can be negative if target is in the past)
 */
function monthsBetween(targetDate: string, today: Date = new Date()): number {
  const target = new Date(targetDate);
  return (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
}

/**
 * Add months to a date and return ISO-8601 date string.
 *
 * @param baseDate - Starting date
 * @param months - Number of months to add
 * @returns ISO-8601 date string (YYYY-MM-DD)
 */
function addMonths(baseDate: Date, months: number): string {
  const result = new Date(baseDate);
  result.setMonth(result.getMonth() + months);
  return result.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Calculate the savings gap for a life event.
 *
 * @param estimatedCostCents - Total estimated cost in cents
 * @param currentSavingsCents - Current savings in cents
 * @returns Gap in cents (0 if fully funded)
 */
export function calculateSavingsGap(
  estimatedCostCents: number,
  currentSavingsCents: number,
): number {
  return Math.max(0, estimatedCostCents - currentSavingsCents);
}

/**
 * Calculate progress as basis points (0–10000).
 *
 * @param currentSavingsCents - Current savings in cents
 * @param estimatedCostCents - Total cost in cents
 * @returns Progress in basis points
 */
export function calculateProgressBps(
  currentSavingsCents: number,
  estimatedCostCents: number,
): number {
  if (estimatedCostCents <= 0) return 0;
  return Math.min(10000, bankersRound((currentSavingsCents / estimatedCostCents) * 10000));
}

/**
 * Calculate the required monthly savings to meet a target by a given date.
 *
 * @param gapCents - Remaining savings gap in cents
 * @param monthsRemaining - Months until target date
 * @returns Required monthly savings in cents
 */
export function calculateRequiredMonthlySavings(gapCents: number, monthsRemaining: number): number {
  if (gapCents <= 0) return 0;
  if (monthsRemaining <= 0) return gapCents; // Need full amount immediately
  return bankersRound(gapCents / monthsRemaining);
}

/**
 * Generate milestones with projected dates for a life event.
 *
 * @param event - The life event to generate milestones for
 * @param today - Reference date (defaults to now)
 * @returns Array of milestones with projected dates
 */
export function generateMilestones(
  event: LifeEvent,
  today: Date = new Date(),
): LifeEventMilestone[] {
  const progressBps = calculateProgressBps(event.currentSavingsCents, event.estimatedCostCents);

  return MILESTONE_PERCENTS.map((percent) => {
    const targetCents = bankersRound(event.estimatedCostCents * (percent / 100));
    const reached = progressBps >= percent * 100;

    let projectedDate: string | null = null;
    if (!reached && event.monthlySavingsCents > 0) {
      const remainingCents = targetCents - event.currentSavingsCents;
      if (remainingCents > 0) {
        const monthsNeeded = Math.ceil(remainingCents / event.monthlySavingsCents);
        projectedDate = addMonths(today, monthsNeeded);
      }
    }

    return {
      label: MILESTONE_LABELS[percent],
      targetCents,
      reached,
      projectedDate,
    };
  });
}

// ---------------------------------------------------------------------------
// Single event analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a single life event for savings readiness.
 *
 * @param event - The life event to analyze
 * @param today - Reference date (defaults to now)
 * @returns Complete analysis of the event
 */
export function analyzeEvent(event: LifeEvent, today: Date = new Date()): LifeEventAnalysis {
  const savingsGapCents = calculateSavingsGap(event.estimatedCostCents, event.currentSavingsCents);
  const progressBps = calculateProgressBps(event.currentSavingsCents, event.estimatedCostCents);
  const monthsToTarget = monthsBetween(event.targetDate, today);
  const requiredMonthlySavingsCents = calculateRequiredMonthlySavings(
    savingsGapCents,
    monthsToTarget,
  );
  const onTrack = savingsGapCents === 0 || event.monthlySavingsCents >= requiredMonthlySavingsCents;
  const milestones = generateMilestones(event, today);

  return {
    event,
    savingsGapCents,
    progressBps,
    monthsToTarget,
    requiredMonthlySavingsCents,
    onTrack,
    milestones,
  };
}

// ---------------------------------------------------------------------------
// Multi-event analysis
// ---------------------------------------------------------------------------

/**
 * Analyze multiple concurrent life events.
 *
 * Sorts by priority, calculates aggregate savings needs, and identifies
 * events at risk of not being funded on time.
 *
 * @param events - Array of life events to analyze
 * @param today - Reference date (defaults to now)
 * @returns Aggregated multi-event analysis
 */
export function analyzeMultipleEvents(
  events: readonly LifeEvent[],
  today: Date = new Date(),
): MultiEventAnalysis {
  // Sort by priority (lower number = higher priority)
  const sorted = [...events].sort((a, b) => a.priority - b.priority);

  const analyses = sorted.map((event) => analyzeEvent(event, today));

  const totalMonthlySavingsNeededCents = analyses.reduce(
    (sum, a) => sum + a.requiredMonthlySavingsCents,
    0,
  );
  const totalMonthlyAllocatedCents = analyses.reduce(
    (sum, a) => sum + a.event.monthlySavingsCents,
    0,
  );
  const monthlyShortfallCents = Math.max(
    0,
    totalMonthlySavingsNeededCents - totalMonthlyAllocatedCents,
  );
  const atRiskEvents = analyses.filter((a) => !a.onTrack).map((a) => a.event);

  return {
    events: analyses,
    totalMonthlySavingsNeededCents,
    totalMonthlyAllocatedCents,
    monthlyShortfallCents,
    atRiskEvents,
  };
}

/**
 * Create a new life event with defaults.
 *
 * @param overrides - Partial event properties to override defaults
 * @returns A new LifeEvent with a generated ID and defaults
 */
export function createLifeEvent(
  overrides: Partial<LifeEvent> &
    Pick<LifeEvent, 'name' | 'type' | 'targetDate' | 'estimatedCostCents'>,
): LifeEvent {
  return {
    id: crypto.randomUUID(),
    currentSavingsCents: 0,
    monthlySavingsCents: 0,
    priority: 1,
    notes: '',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
