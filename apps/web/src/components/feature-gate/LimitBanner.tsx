// SPDX-License-Identifier: BUSL-1.1

/**
 * LimitBanner — Shows a warning when a user is near or at a feature limit.
 *
 * Usage:
 * ```tsx
 * <LimitBanner feature="unlimited_accounts" usage={usage} onUpgrade={handleUpgrade} />
 * ```
 */

import React from 'react';
import { useFeatureGate } from './FeatureGateProvider';
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
  const { checkAccess } = useFeatureGate();
  const access = checkAccess(feature, usage);

  if (!access.atLimit || access.maxCount === null) {
    return null;
  }

  return (
    <div className={`limit-banner ${className}`.trim()} role="alert">
      <span className="limit-banner__icon" aria-hidden="true">
        ⚠️
      </span>
      <p className="limit-banner__text">{access.gateMessage}</p>
      {onUpgrade && (
        <button
          type="button"
          className="limit-banner__action"
          onClick={onUpgrade}
          aria-label="Upgrade to premium for unlimited access"
        >
          Upgrade
        </button>
      )}
    </div>
  );
};

export default LimitBanner;
