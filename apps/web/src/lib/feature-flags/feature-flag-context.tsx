// SPDX-License-Identifier: BUSL-1.1

/**
 * React context + hook for feature flags (#3875).
 *
 * Component-level consumers read flags via {@link useFeatureFlag}. A
 * {@link FeatureFlagProvider} is optional: the hook falls back to direct
 * evaluation (against the persisted install id) when no provider is mounted, so
 * it is usable anywhere in the tree. Mount a provider to override the registry
 * or client id — primarily useful in tests and Storybook.
 *
 * @module lib/feature-flags/feature-flag-context
 */

import { createContext, useContext, useMemo } from 'react';
import type { FC, ReactNode } from 'react';

import { getStableClientId } from './client-id';
import { WEB_FLAG_REGISTRY } from './flag-registry';
import { isFeatureEnabled, isFeatureEnabledWith } from './index';
import type { WebFlagRegistry } from './types';

/** Value exposed by {@link FeatureFlagContext}. */
interface FeatureFlagContextValue {
  /** Evaluate a flag key for the provider's context. */
  isEnabled: (key: string) => boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

/** Props for {@link FeatureFlagProvider}. */
export interface FeatureFlagProviderProps {
  /** Registry override (defaults to the web bootstrap registry). */
  registry?: WebFlagRegistry;
  /** Client id override for rollout bucketing (defaults to the install id). */
  clientId?: string;
  children: ReactNode;
}

/**
 * Provide a memoized flag evaluator to the subtree.
 *
 * @param props - Optional registry/client-id overrides plus children.
 */
export const FeatureFlagProvider: FC<FeatureFlagProviderProps> = ({
  registry = WEB_FLAG_REGISTRY,
  clientId,
  children,
}) => {
  const value = useMemo<FeatureFlagContextValue>(() => {
    const context = { clientId: clientId ?? getStableClientId(), platform: 'web' as const };
    return { isEnabled: (key: string) => isFeatureEnabledWith(key, context, registry) };
  }, [registry, clientId]);

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
};

/**
 * Read a boolean feature flag.
 *
 * Uses the nearest {@link FeatureFlagProvider} when present; otherwise evaluates
 * directly against the persisted install id.
 *
 * @param key - The flag key.
 * @returns Whether the flag is enabled.
 */
export function useFeatureFlag(key: string): boolean {
  const context = useContext(FeatureFlagContext);
  if (context) return context.isEnabled(key);
  return isFeatureEnabled(key);
}
