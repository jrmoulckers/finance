// SPDX-License-Identifier: BUSL-1.1

/**
 * Feature gate React context and provider.
 *
 * Provides subscription tier and feature access checking to the component
 * tree. Components use the useFeatureGate hook to check access.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  checkFeatureAccess,
  loadSubscriptionState,
  saveSubscriptionState,
  type FeatureAccessResult,
  type FeatureId,
  type FeatureUsage,
  type SubscriptionState,
  type SubscriptionTier,
} from './feature-gate-engine';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface FeatureGateContextValue {
  /** Current subscription state. */
  subscription: SubscriptionState;
  /** Check if a feature is accessible. */
  checkAccess: (featureId: FeatureId, usage?: FeatureUsage) => FeatureAccessResult;
  /** Update the subscription tier (e.g., after purchase). */
  updateTier: (tier: SubscriptionTier) => void;
  /** Whether the user is on the premium tier. */
  isPremium: boolean;
}

const FeatureGateContext = createContext<FeatureGateContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface FeatureGateProviderProps {
  /** Optional initial subscription state (for testing). */
  initialState?: SubscriptionState;
  children: ReactNode;
}

export const FeatureGateProvider: React.FC<FeatureGateProviderProps> = ({
  initialState,
  children,
}) => {
  const [subscription, setSubscription] = useState<SubscriptionState>(
    () => initialState ?? loadSubscriptionState(),
  );

  const checkAccess = useCallback(
    (featureId: FeatureId, usage?: FeatureUsage): FeatureAccessResult => {
      return checkFeatureAccess(featureId, subscription.tier, usage);
    },
    [subscription.tier],
  );

  const updateTier = useCallback((tier: SubscriptionTier) => {
    const newState: SubscriptionState = {
      tier,
      isActive: true,
      periodEnd: tier === 'premium' ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
    };
    setSubscription(newState);
    saveSubscriptionState(newState);
  }, []);

  const isPremium = subscription.tier === 'premium';

  const value = useMemo<FeatureGateContextValue>(
    () => ({ subscription, checkAccess, updateTier, isPremium }),
    [subscription, checkAccess, updateTier, isPremium],
  );

  return <FeatureGateContext.Provider value={value}>{children}</FeatureGateContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the feature gate context.
 *
 * Must be used within a FeatureGateProvider.
 */
export function useFeatureGate(): FeatureGateContextValue {
  const context = useContext(FeatureGateContext);
  if (!context) {
    throw new Error('useFeatureGate must be used within a FeatureGateProvider');
  }
  return context;
}
