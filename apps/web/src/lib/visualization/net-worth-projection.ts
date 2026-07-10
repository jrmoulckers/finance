// SPDX-License-Identifier: BUSL-1.1

/**
 * Net worth forward-projection engine.
 *
 * Pure, deterministic helpers that take a historical net-worth series and
 * project it forward based on the *recent contribution pace* derived from the
 * series itself — no user-entered growth assumptions. All monetary values are
 * integer cents.
 *
 * Two deterministic pace estimators are supported:
 * - `average`    — mean of consecutive month-over-month deltas.
 * - `regression` — ordinary least-squares slope over the series (default).
 *
 * Short histories (fewer than two points) yield no projection so the UI can
 * show a friendly "need more history" message rather than a misleading line.
 *
 * References: issue #2116
 */

import { getCurrentLocale } from '../i18n';
import { monthlyRateFromAnnual } from '../fire';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Pace-estimation strategy used to derive the monthly trend.
 *
 * - `average`    — mean of consecutive month-over-month deltas (linear).
 * - `regression` — ordinary least-squares slope over the series (linear).
 * - `compound`   — geometric growth from an expected annual return plus an
 *   optional recurring monthly contribution (issue #3323).
 */
export type ProjectionMethod = 'average' | 'regression' | 'compound';

/** Selectable time range that drives both the visible window and the horizon. */
export type ProjectionRange = '3M' | '6M' | '1Y' | 'All';

/** Direction of the derived pace, for color-independent labelling. */
export type PaceDirection = 'up' | 'down' | 'flat';

/** A single historical net-worth observation. Amount in integer cents. */
export interface NetWorthSeriesPoint {
  /** Short display label (e.g. "Mar"). */
  readonly label: string;
  /** Net worth at this point in integer cents. */
  readonly netWorthCents: number;
  /** Optional ISO date (YYYY-MM-DD) anchoring the point for future labelling. */
  readonly dateIso?: string;
}

/** A single projected (forecast) net-worth point. Amount in integer cents. */
export interface NetWorthProjectionPoint {
  /** Short display label (e.g. "Jul"). */
  readonly label: string;
  /** Projected net worth in integer cents. */
  readonly netWorthCents: number;
  /** 1-based number of months beyond the last actual point. */
  readonly monthOffset: number;
  /** Optional projected ISO date, when the basis point carries one. */
  readonly dateIso?: string;
}

/** Result of a forward projection. */
export interface NetWorthProjectionResult {
  /** True when at least one projected point was produced. */
  readonly hasProjection: boolean;
  /** Pace strategy used. */
  readonly method: ProjectionMethod;
  /** Derived monthly pace in integer cents (signed). */
  readonly monthlyPaceCents: number;
  /** Direction of the derived pace. */
  readonly paceDirection: PaceDirection;
  /** Number of historical points the pace was derived from. */
  readonly basisPoints: number;
  /** Net worth at the last actual point, in integer cents. */
  readonly startNetWorthCents: number;
  /** Net worth at the final projected point (or start when none), in cents. */
  readonly endNetWorthCents: number;
  /** Number of months projected forward. */
  readonly horizonMonths: number;
  /** Projected points, oldest first. */
  readonly points: readonly NetWorthProjectionPoint[];
  /** Currency-free, human-readable description of the method. */
  readonly methodSummary: string;
  /** Why no projection was produced, or null when one was. */
  readonly reason: string | null;
}

/** Default expected annual return for compound projections (7%, real-ish). */
export const DEFAULT_PROJECTION_ANNUAL_RETURN = 0.07;

/** Options for {@link projectNetWorth}. */
export interface ProjectNetWorthOptions {
  /** Pace estimator. Defaults to `regression`. */
  readonly method?: ProjectionMethod;
  /** Explicit horizon in months. Takes precedence over `range`. */
  readonly horizonMonths?: number;
  /** Range used to derive the horizon when `horizonMonths` is omitted. */
  readonly range?: ProjectionRange;
  /**
   * Expected annual return (decimal, e.g. 0.07) for the `compound` method.
   * Ignored by the linear methods. Defaults to
   * {@link DEFAULT_PROJECTION_ANNUAL_RETURN}.
   */
  readonly annualReturnRate?: number;
  /**
   * Recurring monthly contribution in integer cents applied at the end of each
   * projected month for the `compound` method. Ignored by linear methods.
   */
  readonly monthlyContributionCents?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Selectable ranges in display order. */
export const PROJECTION_RANGES: readonly ProjectionRange[] = ['3M', '6M', '1Y', 'All'];

/** Number of trailing months each fixed range covers. */
const RANGE_WINDOW_MONTHS: Record<Exclude<ProjectionRange, 'All'>, number> = {
  '3M': 3,
  '6M': 6,
  '1Y': 12,
};

/** Hard cap on how far forward we project regardless of input. */
export const MAX_PROJECTION_MONTHS = 24;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function roundCents(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function paceDirectionOf(paceCents: number): PaceDirection {
  if (paceCents > 0) return 'up';
  if (paceCents < 0) return 'down';
  return 'flat';
}

function methodSummaryOf(method: ProjectionMethod, basisPoints: number): string {
  const window = `the last ${basisPoints} ${basisPoints === 1 ? 'month' : 'months'}`;
  if (method === 'regression') return `linear trend across ${window}`;
  if (method === 'average') return `average monthly change across ${window}`;
  return `compound growth from your expected return`;
}

function compoundSummary(annualReturnRate: number, monthlyContributionCents: number): string {
  const percent = annualReturnRate * 100;
  const rateText = `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
  const base = `compound growth at ${rateText} annual return`;
  return monthlyContributionCents > 0 ? `${base} plus monthly contributions` : base;
}

function addMonthsIso(iso: string, months: number): string {
  const base = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

function monthShortLabel(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  return date.toLocaleDateString(getCurrentLocale(), { month: 'short', timeZone: 'UTC' });
}

function projectedLabel(lastPoint: NetWorthSeriesPoint, monthOffset: number): string {
  if (lastPoint.dateIso) {
    return monthShortLabel(addMonthsIso(lastPoint.dateIso, monthOffset));
  }
  return `+${monthOffset}mo`;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Returns the trailing slice of a series for the given range.
 *
 * @param series - Full net-worth history, oldest first.
 * @param range - Selected range.
 * @returns A new array containing the trailing window (all points for `All`).
 */
export function sliceSeriesToRange(
  series: readonly NetWorthSeriesPoint[],
  range: ProjectionRange,
): NetWorthSeriesPoint[] {
  if (range === 'All') return series.slice();
  const window = RANGE_WINDOW_MONTHS[range];
  return series.slice(Math.max(0, series.length - window));
}

/**
 * Derives the projection horizon in months for a range.
 *
 * Fixed ranges map directly (3M→3, 6M→6, 1Y→12). `All` derives half of the
 * available history, bounded to a sensible [3, {@link MAX_PROJECTION_MONTHS}].
 *
 * @param range - Selected range.
 * @param historyLength - Number of available historical points.
 * @returns Horizon in months.
 */
export function rangeToHorizonMonths(range: ProjectionRange, historyLength: number): number {
  if (range === 'All') {
    return clamp(Math.floor(historyLength / 2), 3, MAX_PROJECTION_MONTHS);
  }
  return RANGE_WINDOW_MONTHS[range];
}

/**
 * Derives the monthly net-worth pace (integer cents) from a series.
 *
 * @param series - Net-worth history, oldest first (needs >= 2 points).
 * @param method - Pace estimator. Defaults to `regression`.
 * @returns Signed integer cents per month; 0 when undeterminable.
 */
export function deriveMonthlyPaceCents(
  series: readonly NetWorthSeriesPoint[],
  method: ProjectionMethod = 'regression',
): number {
  if (series.length < 2) return 0;

  const values = series.map((point) => point.netWorthCents);
  const n = values.length;

  if (method === 'average') {
    const first = values[0]!;
    const last = values[n - 1]!;
    return roundCents((last - first) / (n - 1));
  }

  // Ordinary least-squares slope over evenly spaced x = 0..n-1.
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - meanX;
    numerator += dx * (values[i]! - meanY);
    denominator += dx * dx;
  }
  if (denominator === 0) return 0;
  return roundCents(numerator / denominator);
}

/**
 * Compounds a starting balance forward month-by-month at a monthly rate with an
 * optional end-of-month contribution.
 *
 * balance(m) = start * (1+i)^m + C * (((1+i)^m - 1) / i)   [i != 0]
 * balance(m) = start + C * m                               [i == 0]
 *
 * Every returned value is an exact integer cent (rounded once per point so
 * rounding error never accumulates across the horizon).
 *
 * @param startCents - Starting balance in integer cents.
 * @param monthlyRate - Monthly growth rate (decimal).
 * @param monthlyContributionCents - End-of-month contribution in integer cents.
 * @param monthOffset - 1-based month to evaluate.
 * @returns Projected balance in integer cents.
 */
function compoundBalanceCents(
  startCents: number,
  monthlyRate: number,
  monthlyContributionCents: number,
  monthOffset: number,
): number {
  const growth = Math.pow(1 + monthlyRate, monthOffset);
  const grownStart = startCents * growth;
  const annuityFactor = Math.abs(monthlyRate) < 1e-12 ? monthOffset : (growth - 1) / monthlyRate;
  return roundCents(grownStart + monthlyContributionCents * annuityFactor);
}

/**
 * Projects net worth forward from a historical series.
 *
 * The linear methods derive a monthly pace from the supplied series (treat the
 * caller's window as "recent"); each projected point is
 * `start + pace * monthOffset`. The `compound` method instead grows the last
 * actual balance geometrically at the supplied annual return with an optional
 * recurring monthly contribution. Every value stays an exact integer cent.
 * Series shorter than two points return a result flagged `hasProjection: false`
 * with a friendly {@link NetWorthProjectionResult.reason}.
 *
 * @param series - Net-worth history, oldest first.
 * @param options - Method, horizon and (for compound) return/contribution controls.
 * @returns A deterministic {@link NetWorthProjectionResult}.
 */
export function projectNetWorth(
  series: readonly NetWorthSeriesPoint[],
  options: ProjectNetWorthOptions = {},
): NetWorthProjectionResult {
  const method = options.method ?? 'regression';
  const lastPoint = series.length > 0 ? series[series.length - 1]! : null;
  const startNetWorthCents = lastPoint?.netWorthCents ?? 0;
  const isCompound = method === 'compound';
  const annualReturnRate = options.annualReturnRate ?? DEFAULT_PROJECTION_ANNUAL_RETURN;
  const monthlyContributionCents = Math.max(0, Math.round(options.monthlyContributionCents ?? 0));
  const summary = isCompound
    ? compoundSummary(annualReturnRate, monthlyContributionCents)
    : methodSummaryOf(method, series.length);

  if (series.length < 2) {
    return {
      hasProjection: false,
      method,
      monthlyPaceCents: 0,
      paceDirection: 'flat',
      basisPoints: series.length,
      startNetWorthCents,
      endNetWorthCents: startNetWorthCents,
      horizonMonths: 0,
      points: [],
      methodSummary: summary,
      reason: 'At least two months of net-worth history are needed to project forward.',
    };
  }

  const requestedHorizon =
    options.horizonMonths ?? rangeToHorizonMonths(options.range ?? 'All', series.length);
  const horizonMonths = clamp(Math.floor(requestedHorizon), 0, MAX_PROJECTION_MONTHS);

  const monthlyRate = isCompound ? monthlyRateFromAnnual(annualReturnRate) : 0;
  // For compound mode the "pace" reported is the first-month increment so the
  // UI can still surface a direction; linear modes use the derived pace.
  const monthlyPaceCents = isCompound
    ? compoundBalanceCents(startNetWorthCents, monthlyRate, monthlyContributionCents, 1) -
      startNetWorthCents
    : deriveMonthlyPaceCents(series, method);
  const paceDirection = paceDirectionOf(monthlyPaceCents);

  if (horizonMonths <= 0) {
    return {
      hasProjection: false,
      method,
      monthlyPaceCents,
      paceDirection,
      basisPoints: series.length,
      startNetWorthCents,
      endNetWorthCents: startNetWorthCents,
      horizonMonths: 0,
      points: [],
      methodSummary: summary,
      reason: 'The selected horizon is zero months, so there is nothing to project.',
    };
  }

  const points: NetWorthProjectionPoint[] = [];
  for (let monthOffset = 1; monthOffset <= horizonMonths; monthOffset += 1) {
    const netWorthCents = isCompound
      ? compoundBalanceCents(startNetWorthCents, monthlyRate, monthlyContributionCents, monthOffset)
      : startNetWorthCents + monthlyPaceCents * monthOffset;
    const point: NetWorthProjectionPoint = {
      label: projectedLabel(lastPoint!, monthOffset),
      netWorthCents,
      monthOffset,
      ...(lastPoint!.dateIso ? { dateIso: addMonthsIso(lastPoint!.dateIso, monthOffset) } : {}),
    };
    points.push(point);
  }

  return {
    hasProjection: true,
    method,
    monthlyPaceCents,
    paceDirection,
    basisPoints: series.length,
    startNetWorthCents,
    endNetWorthCents: points[points.length - 1]!.netWorthCents,
    horizonMonths,
    points,
    methodSummary: summary,
    reason: null,
  };
}
