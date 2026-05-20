// SPDX-License-Identifier: BUSL-1.1

/**
 * Internal utilities for the family finance engine.
 *
 * Contains banker's rounding and other shared helpers.
 * Not exported from the public barrel.
 */

/**
 * Rounds a number using banker's rounding (round half to even).
 *
 * @param value - The number to round
 * @returns The rounded integer
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value);
  // When exactly at .5, round to even
  if (Math.abs(value - (rounded - 0.5)) < Number.EPSILON) {
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
  return rounded;
}

/**
 * Safely divides two numbers, returning 0 if the divisor is zero.
 *
 * @param numerator - The numerator
 * @param denominator - The denominator
 * @returns The result of division, or 0 if denominator is 0
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Clamps a number between a minimum and maximum value.
 *
 * @param value - The value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
