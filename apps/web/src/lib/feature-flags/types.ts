// SPDX-License-Identifier: BUSL-1.1

/**
 * Types for the web runtime feature-flag consumer (#3875).
 *
 * These mirror the simple flat schema of the canonical cross-platform registry
 * at `config/feature-flags/flags.json` (the single source of truth), reshaped to
 * camelCase for TypeScript ergonomics. The richer KMP targeting model
 * (`packages/core/.../featureflags/`) is intentionally NOT replicated here — the
 * web v1 consumer only needs enable/platform/rollout semantics.
 *
 * @module lib/feature-flags/types
 */

/** Platforms a flag may target. Matches the `platforms` entries in flags.json. */
export type FlagPlatform = 'web' | 'android' | 'ios';

/**
 * A single feature flag as consumed by the web runtime.
 *
 * Mirrors one entry of `config/feature-flags/flags.json`, with
 * `rollout_percentage` renamed to {@link rolloutPercentage}.
 */
export interface WebFeatureFlag {
  /** Stable flag key (the object key in flags.json). */
  key: string;
  /** Human-readable description of what the flag gates. */
  description: string;
  /** Master on/off switch. When `false`, the flag is off regardless of rollout. */
  enabled: boolean;
  /** Owning team (informational on the client). */
  owner: string;
  /** Platforms the flag applies to. A flag is off on platforms it does not list. */
  platforms: FlagPlatform[];
  /** Deterministic rollout percentage in [0, 100]. */
  rolloutPercentage: number;
}

/** A keyed collection of web feature flags. */
export type WebFlagRegistry = Readonly<Record<string, WebFeatureFlag>>;

/**
 * Context supplied when evaluating a flag.
 *
 * `clientId` is the stable identifier used for deterministic rollout bucketing
 * (see {@link ../feature-flags/rollout}). On web v1 this is a persisted
 * per-install id so the same install always resolves to the same bucket, and so
 * evaluation is consistent between the pre-auth bootstrap and post-auth
 * components.
 */
export interface FlagEvaluationContext {
  /** Stable id used for rollout bucketing. */
  clientId: string;
  /** The evaluating platform. Always `'web'` in this app. */
  platform: FlagPlatform;
}
