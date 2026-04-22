// SPDX-License-Identifier: BUSL-1.1

/**
 * FeatureGate — Conditionally renders children based on feature access.
 *
 * Usage:
 * ```tsx
 * <FeatureGate feature="insights_dashboard" fallback={<UpgradePrompt />}>
 *   <InsightsPage />
 * </FeatureGate>
 * ```
 */

import React from 'react';
import type { ReactNode } from 'react';
import { useFeatureGate } from './FeatureGateProvider';
import type { FeatureId, FeatureUsage } from './feature-gate-engine';

export interface FeatureGateProps {
  /** Feature to check access for. */
  feature: FeatureId;
  /** Current usage counts (for limit-based features). */
  usage?: FeatureUsage;
  /** Content to render when feature is accessible. */
  children: ReactNode;
  /** Content to render when feature is gated. */
  fallback?: ReactNode;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  usage,
  children,
  fallback = null,
}) => {
  const { checkAccess } = useFeatureGate();
  const access = checkAccess(feature, usage);

  if (!access.allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default FeatureGate;
