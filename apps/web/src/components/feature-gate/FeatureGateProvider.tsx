// SPDX-License-Identifier: BUSL-1.1

/**
 * Feature gate React context and provider.
 *
 * Provides the shared minimized entitlement display state and unrestricted
 * local capability checks to the component tree.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  canPreflightBankConnection,
  allowsCachedDisplay,
  createEntitlementRepository,
  EntitlementDisplayCache,
  PENDING_ENTITLEMENT,
  presentationFromNetwork,
  presentationFromUnavailable,
  removeLegacySubscriptionAuthority,
  type EntitlementPresentation,
  type EntitlementRepository,
} from '../../entitlements';
import {
  checkFeatureAccess,
  type FeatureAccessResult,
  type FeatureId,
  type FeatureUsage,
} from './feature-gate-engine';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface FeatureGateContextValue {
  /** Current non-authorizing entitlement presentation. */
  entitlement: EntitlementPresentation;
  /** Check if a feature is accessible. */
  checkAccess: (featureId: FeatureId, usage?: FeatureUsage) => FeatureAccessResult;
  /** Re-read the authenticated server projection. */
  refreshEntitlement: () => Promise<void>;
  /** Display convenience only; never authorizes a server operation. */
  isPremium: boolean;
  /**
   * Fail-closed UI preflight for a new bank-connection request. The bank API
   * still independently authorizes against its current server projection.
   */
  canRequestBankConnection: (currentConnectionCount: number) => boolean;
}

const FeatureGateContext = createContext<FeatureGateContextValue | null>(null);
const systemNow = () => new Date();

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface FeatureGateProviderProps {
  principalId: string | null;
  householdId?: string;
  repository?: EntitlementRepository;
  cache?: EntitlementDisplayCache;
  now?: () => Date;
  /** Optional presentation override for focused component tests. */
  initialState?: EntitlementPresentation;
  children: ReactNode;
}

export const FeatureGateProvider: React.FC<FeatureGateProviderProps> = ({
  principalId,
  householdId,
  repository,
  cache,
  now = systemNow,
  initialState,
  children,
}) => {
  const stableRepository = useMemo(() => repository ?? createEntitlementRepository(), [repository]);
  const stableCache = useMemo(() => cache ?? new EntitlementDisplayCache(), [cache]);
  const [entitlement, setEntitlement] = useState<EntitlementPresentation>(
    initialState ?? PENDING_ENTITLEMENT,
  );
  const cachedEnvelope = useRef(entitlement.envelope);
  const requestGeneration = useRef(0);

  const checkAccess = useCallback((featureId: FeatureId, usage?: FeatureUsage) => {
    return checkFeatureAccess(featureId, undefined, usage);
  }, []);

  const refreshEntitlement = useCallback(async () => {
    const generation = ++requestGeneration.current;
    if (!principalId) {
      cachedEnvelope.current = null;
      setEntitlement(presentationFromUnavailable('unauthenticated', null, now()));
      return;
    }

    const cached = await stableCache.read(principalId, householdId);
    if (generation !== requestGeneration.current) return;
    if (cached?.available) {
      cachedEnvelope.current = cached.envelope;
    }
    const result = await stableRepository.load(householdId);
    if (generation !== requestGeneration.current) return;
    if (result.available) {
      cachedEnvelope.current = result.envelope;
      await stableCache.write(principalId, householdId, result.envelope);
      if (generation !== requestGeneration.current) return;
      setEntitlement(presentationFromNetwork(result.envelope, now()));
      return;
    }
    const presentation = presentationFromUnavailable(result.reason, cachedEnvelope.current, now());
    if (!allowsCachedDisplay(result.reason)) {
      cachedEnvelope.current = null;
      await stableCache.remove(principalId, householdId);
      if (generation !== requestGeneration.current) return;
    }
    setEntitlement(presentation);
  }, [householdId, now, principalId, stableCache, stableRepository]);

  useEffect(() => {
    removeLegacySubscriptionAuthority();
    let active = true;
    if (!principalId) {
      cachedEnvelope.current = null;
      setEntitlement(presentationFromUnavailable('unauthenticated', null, now()));
      return;
    }

    cachedEnvelope.current = null;
    setEntitlement(PENDING_ENTITLEMENT);
    void refreshEntitlement();

    const handleOnline = () => void refreshEntitlement();
    const handleOffline = () => {
      if (!active) return;
      setEntitlement(presentationFromUnavailable('offline', cachedEnvelope.current, now()));
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      active = false;
      requestGeneration.current += 1;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [householdId, now, principalId, refreshEntitlement, stableCache]);

  useEffect(() => {
    const envelope = entitlement.envelope;
    const refreshAfter = envelope?.entitlement.validity.refresh_after;
    if (envelope === null) return;

    const currentTime = now().getTime();
    const downgradeAt = envelope.entitlement.downgrade.effective_at;
    const deadlines = [
      !entitlement.needsRefresh && refreshAfter
        ? Date.parse(refreshAfter)
        : Number.POSITIVE_INFINITY,
      downgradeAt ? Date.parse(downgradeAt) : Number.POSITIVE_INFINITY,
    ].filter((deadline) => deadline > currentTime);
    if (deadlines.length === 0) return;

    const delay = Math.min(...deadlines) - currentTime;
    const timer = window.setTimeout(
      () => {
        const current = now();
        const next = entitlement.reason
          ? presentationFromUnavailable(entitlement.reason, envelope, current)
          : presentationFromNetwork(envelope, current);
        setEntitlement(next);
        if (
          refreshAfter !== null &&
          refreshAfter !== undefined &&
          current.getTime() >= Date.parse(refreshAfter)
        ) {
          void refreshEntitlement();
        }
      },
      Math.min(delay, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [entitlement, now, refreshEntitlement]);

  const isPremium = entitlement.displayTier === 'premium' || entitlement.displayTier === 'family';
  const canRequestBankConnection = useCallback(
    (currentConnectionCount: number) =>
      canPreflightBankConnection(entitlement, currentConnectionCount),
    [entitlement],
  );

  const value = useMemo<FeatureGateContextValue>(
    () => ({
      entitlement,
      checkAccess,
      refreshEntitlement,
      isPremium,
      canRequestBankConnection,
    }),
    [canRequestBankConnection, checkAccess, entitlement, isPremium, refreshEntitlement],
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

export function useOptionalFeatureGate(): FeatureGateContextValue | null {
  return useContext(FeatureGateContext);
}
