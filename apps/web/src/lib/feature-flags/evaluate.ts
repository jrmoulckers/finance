// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure flag-evaluation logic (#3875).
 *
 * @module lib/feature-flags/evaluate
 */

import { isInRollout } from './rollout';
import type { FlagEvaluationContext, WebFeatureFlag } from './types';

/**
 * Evaluate a boolean feature flag for the given context.
 *
 * A flag resolves to `true` only when all of the following hold:
 *   1. `enabled` is `true` (master switch), and
 *   2. the context's platform is listed in `platforms`, and
 *   3. the context's `clientId` falls within the deterministic rollout.
 *
 * @param flag - The flag definition.
 * @param context - The evaluation context (client id + platform).
 * @returns Whether the flag is on for this context.
 */
export function evaluateFlag(flag: WebFeatureFlag, context: FlagEvaluationContext): boolean {
  if (!flag.enabled) return false;
  if (!flag.platforms.includes(context.platform)) return false;
  return isInRollout(context.clientId, flag.key, flag.rolloutPercentage);
}
