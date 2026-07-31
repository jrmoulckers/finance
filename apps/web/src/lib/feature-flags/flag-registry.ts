// SPDX-License-Identifier: BUSL-1.1

/**
 * Web bootstrap feature-flag registry (#3875).
 *
 * The **single source of truth** for flag configuration is the cross-platform
 * registry at `config/feature-flags/flags.json` (schema-validated by the
 * `CI — Feature Flags` workflow). Until synced, runtime flag delivery exists on
 * web, this module vendors the web-consumed flags as a bootstrap default set.
 * Each entry here MUST stay in lockstep with the matching flags.json entry.
 *
 * Only flags the web runtime actually evaluates are listed — adding a flag to
 * flags.json does not require adding it here unless the web app consumes it.
 *
 * @module lib/feature-flags/flag-registry
 */

import type { WebFeatureFlag, WebFlagRegistry } from './types';

/**
 * `live_bank_data` — gates activation of the live consolidated bank-data
 * aggregator (Plaid/MX/TrueLayer/Finicity, epic #3846) on web.
 *
 * Fully ramped: `enabled` is `true` and `rolloutPercentage` is `100`, so the
 * aggregator provider layer registers and the in-app "Connect a bank" flow
 * (Plaid Link) is available to everyone. Keep this value in lockstep with
 * `config/feature-flags/flags.json`.
 */
const LIVE_BANK_DATA: WebFeatureFlag = {
  key: 'live_bank_data',
  description:
    'Activate the live consolidated bank-data aggregator (Plaid/MX/TrueLayer/Finicity) on web.',
  enabled: true,
  owner: 'web',
  platforms: ['web'],
  rolloutPercentage: 100,
};

/** The web bootstrap flag registry, keyed by flag key. */
export const WEB_FLAG_REGISTRY: WebFlagRegistry = Object.freeze({
  [LIVE_BANK_DATA.key]: LIVE_BANK_DATA,
});

/** Well-known flag keys the web runtime consumes, for typo-safe references. */
export const FlagKeys = {
  /** Live consolidated bank-data aggregator gate. */
  LIVE_BANK_DATA: 'live_bank_data',
} as const;
