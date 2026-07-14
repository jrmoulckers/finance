// SPDX-License-Identifier: BUSL-1.1

/**
 * Web runtime feature-flag consumer (#3875).
 *
 * Public entry point. Provides:
 *   - {@link isFeatureEnabled} — synchronous, non-React gate usable anywhere
 *     (including the pre-render bootstrap in `main.tsx`).
 *   - {@link isFeatureEnabledWith} — the same, with an explicit context/registry
 *     (used by tests and the React provider).
 *   - The React {@link FeatureFlagProvider} + {@link useFeatureFlag} hook.
 *
 * The single source of truth for flag *configuration* is
 * `config/feature-flags/flags.json`; see {@link ./flag-registry}.
 *
 * @module lib/feature-flags
 */

import { getStableClientId } from './client-id';
import { evaluateFlag } from './evaluate';
import { WEB_FLAG_REGISTRY } from './flag-registry';
import type { FlagEvaluationContext, WebFlagRegistry } from './types';

/**
 * Evaluate a flag against an explicit context and registry.
 *
 * Unknown keys resolve to `false` (fail-closed) so a missing flag never
 * accidentally enables a gated feature.
 *
 * @param key - The flag key.
 * @param context - The evaluation context.
 * @param registry - The registry to look the flag up in (defaults to the web
 *   bootstrap registry).
 * @returns Whether the flag is enabled for the context.
 */
export function isFeatureEnabledWith(
  key: string,
  context: FlagEvaluationContext,
  registry: WebFlagRegistry = WEB_FLAG_REGISTRY,
): boolean {
  const flag = registry[key];
  if (!flag) return false;
  return evaluateFlag(flag, context);
}

/**
 * Evaluate a flag for the current web install.
 *
 * Uses the persisted per-install client id and the `'web'` platform. Safe to
 * call outside React (e.g. at bootstrap in `main.tsx`).
 *
 * @param key - The flag key.
 * @returns Whether the flag is enabled for this install.
 */
export function isFeatureEnabled(key: string): boolean {
  return isFeatureEnabledWith(key, { clientId: getStableClientId(), platform: 'web' });
}

export { FeatureFlagProvider, useFeatureFlag } from './feature-flag-context';
export { WEB_FLAG_REGISTRY, FlagKeys } from './flag-registry';
export { computeBucket, isInRollout } from './rollout';
export { evaluateFlag } from './evaluate';
export { getStableClientId, CLIENT_ID_STORAGE_KEY } from './client-id';
export type { FlagEvaluationContext, FlagPlatform, WebFeatureFlag, WebFlagRegistry } from './types';
