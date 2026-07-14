// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { computeBucket, isInRollout } from '../rollout';

/**
 * Cross-platform parity anchors.
 *
 * These `(userId, flagKey) -> bucket` values are produced by the shared FNV-1a
 * algorithm and pinned here so any future edit to {@link computeBucket} that
 * changes bucketing (and therefore diverges from Kotlin's `RolloutEvaluator`)
 * fails loudly. If these need to change, the Kotlin implementation must change
 * in lockstep.
 */
const PARITY_VECTORS: ReadonlyArray<readonly [string, string, number]> = [
  ['user-123', 'live_bank_data', 21],
  ['user-abc', 'live_bank_data', 57],
  ['00000000-0000-0000-0000-000000000000', 'live_bank_data', 63],
  ['alice', 'dark_mode_oled', 82],
  ['', '', 73],
];

describe('computeBucket', () => {
  it('matches the pinned cross-platform parity vectors', () => {
    for (const [userId, flagKey, expected] of PARITY_VECTORS) {
      expect(computeBucket(userId, flagKey)).toBe(expected);
    }
  });

  it('is deterministic for the same inputs', () => {
    expect(computeBucket('user-xyz', 'flag')).toBe(computeBucket('user-xyz', 'flag'));
  });

  it('always returns an integer in [0, 100)', () => {
    for (let i = 0; i < 500; i++) {
      const bucket = computeBucket(`user-${i}`, 'some_flag');
      expect(Number.isInteger(bucket)).toBe(true);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it('distributes roughly uniformly across deciles', () => {
    const deciles = new Array(10).fill(0);
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      deciles[Math.floor(computeBucket(`u${i}`, 'live_bank_data') / 10)]++;
    }
    // Each decile should hold ~10% of samples; allow a generous tolerance.
    for (const count of deciles) {
      expect(count).toBeGreaterThan(n * 0.07);
      expect(count).toBeLessThan(n * 0.13);
    }
  });
});

describe('isInRollout', () => {
  it('is false for everyone at 0%', () => {
    for (let i = 0; i < 200; i++) {
      expect(isInRollout(`user-${i}`, 'flag', 0)).toBe(false);
    }
  });

  it('is true for everyone at 100%', () => {
    for (let i = 0; i < 200; i++) {
      expect(isInRollout(`user-${i}`, 'flag', 100)).toBe(true);
    }
  });

  it('includes a user whose bucket is below the percentage and excludes one above', () => {
    const userId = 'user-123';
    const bucket = computeBucket(userId, 'flag'); // deterministic
    expect(isInRollout(userId, 'flag', bucket + 1)).toBe(true);
    expect(isInRollout(userId, 'flag', bucket)).toBe(false);
  });

  it('throws on out-of-range or non-integer percentages', () => {
    expect(() => isInRollout('u', 'f', -1)).toThrow(RangeError);
    expect(() => isInRollout('u', 'f', 101)).toThrow(RangeError);
    expect(() => isInRollout('u', 'f', 12.5)).toThrow(RangeError);
  });
});
