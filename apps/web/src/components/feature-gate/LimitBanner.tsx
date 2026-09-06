// SPDX-License-Identifier: BUSL-1.1

/**
 * Legacy compatibility surface. Local capabilities no longer have plan limits,
 * so this component intentionally renders nothing.
 *
 * Usage:
 * ```tsx
 * <LimitBanner feature="unlimited_accounts" usage={usage} onUpgrade={handleUpgrade} />
 * ```
 */

import React from 'react';
import type { FeatureId, FeatureUsage } from './feature-gate-engine';
import './feature-gate.css';

export interface LimitBannerProps {
  /** Feature to check limits for. */
  feature: FeatureId;
  /** Current usage counts. */
  usage: FeatureUsage;
  /** Called when user clicks upgrade action. */
  onUpgrade?: () => void;
  /** Additional CSS class. */
  className?: string;
}

export const LimitBanner: React.FC<LimitBannerProps> = ({
  feature,
  usage,
  onUpgrade,
  className = '',
}) => {
  void feature;
  void usage;
  void onUpgrade;
  void className;
  return null;
};

export default LimitBanner;
