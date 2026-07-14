// SPDX-License-Identifier: BUSL-1.1

/**
 * Deterministic rollout-percentage evaluator (web).
 *
 * This is a **byte-for-byte port** of the Kotlin
 * `com.finance.core.featureflags.RolloutEvaluator` so that web and KMP clients
 * bucket a given `(userId, flagKey)` pair identically. Divergence here would let
 * the same user see a flag on one platform and off on another at the same
 * rollout percentage — so the algorithm below MUST NOT be "optimized" away from
 * the Kotlin original.
 *
 * The hash is an FNV-1a-inspired 64-bit accumulation. JavaScript numbers cannot
 * represent 64-bit integer wraparound, so we use `BigInt` masked to 64 bits to
 * emulate Kotlin's `Long` two's-complement arithmetic, then interpret the final
 * value as a signed 64-bit integer before the modulo — exactly matching
 * Kotlin's signed `%` semantics.
 *
 * @module lib/feature-flags/rollout
 */

/** 2^64 - 1, used to emulate 64-bit `Long` wraparound. */
const MASK_64 = (1n << 64n) - 1n;

/** 2^63, the sign boundary for a signed 64-bit integer. */
const SIGN_BIT = 1n << 63n;

/** 2^64, subtracted to reinterpret an unsigned value as signed. */
const TWO_POW_64 = 1n << 64n;

/** FNV-1a 64-bit offset basis (`0xcbf29ce484222325`). */
const OFFSET_BASIS = 0xcbf29ce484222325n;

/** FNV-1a 64-bit prime (`0x100000001b3` = 1099511628211). */
const FNV_PRIME = 0x100000001b3n;

/** Number of rollout buckets — mirrors Kotlin `BUCKET_COUNT`. */
const BUCKET_COUNT = 100n;

/**
 * Reinterpret a value in `[0, 2^64)` as a signed two's-complement 64-bit int.
 *
 * Kotlin's `Long % 100` operates on the signed value and may yield a negative
 * result; the caller normalizes it back into `[0, 100)`.
 */
function toSigned64(value: bigint): bigint {
  return value >= SIGN_BIT ? value - TWO_POW_64 : value;
}

/**
 * Compute a deterministic bucket in `[0, 100)` for a `(userId, flagKey)` pair.
 *
 * Iterates UTF-16 code units via {@link String.charCodeAt} to match Kotlin's
 * `for (char in input)` (which iterates `Char`s, i.e. UTF-16 code units).
 *
 * @param userId - The stable identifier (auth user id or per-install id).
 * @param flagKey - The feature flag's key.
 * @returns An integer in `[0, 100)`.
 */
export function computeBucket(userId: string, flagKey: string): number {
  const input = `${userId}:${flagKey}`;
  let hash = OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash = (hash ^ BigInt(input.charCodeAt(i))) & MASK_64;
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  const signed = toSigned64(hash);
  const bucket = ((signed % BUCKET_COUNT) + BUCKET_COUNT) % BUCKET_COUNT;
  return Number(bucket);
}

/**
 * Determine whether a user falls within the rollout percentage for a flag.
 *
 * Short-circuits `0` (off for everyone) and `100` (on for everyone) exactly like
 * the Kotlin original, so those endpoints never depend on the hash.
 *
 * @param userId - The stable identifier used for bucketing.
 * @param flagKey - The feature flag's key.
 * @param rolloutPercentage - Integer percentage in `[0, 100]`.
 * @returns `true` if the user's deterministic bucket is below the percentage.
 * @throws {RangeError} If `rolloutPercentage` is not an integer in `[0, 100]`.
 */
export function isInRollout(userId: string, flagKey: string, rolloutPercentage: number): boolean {
  if (!Number.isInteger(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) {
    throw new RangeError(`rolloutPercentage must be an integer 0-100, was ${rolloutPercentage}`);
  }
  if (rolloutPercentage === 0) return false;
  if (rolloutPercentage === 100) return true;
  return computeBucket(userId, flagKey) < rolloutPercentage;
}
