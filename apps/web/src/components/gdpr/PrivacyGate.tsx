// SPDX-License-Identifier: BUSL-1.1

/**
 * PrivacyGate — gates features behind consent with privacy-first disclosure.
 *
 * Wraps features that require specific consent categories. When the user
 * has not consented, shows a privacy explainer describing what data the
 * feature needs, instead of a blocked/empty UI.
 *
 * This implements progressive disclosure: users see what data a feature
 * needs before deciding to enable it.
 *
 * Usage:
 * ```tsx
 * <PrivacyGate
 *   requiredConsent="sync"
 *   featureName="Cloud Sync"
 *   featureDescription="Sync data across devices."
 *   dataNeeded={['Account data', 'Transaction history']}
 * >
 *   <SyncSettings />
 * </PrivacyGate>
 * ```
 *
 * References: issue #1612 (cross-platform app privacy shell)
 */

import React, { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useConsent } from '../../hooks/useConsent';
import { useConsentHistory } from '../../hooks/useConsentHistory';
import {
  CONSENT_LABELS,
  CONSENT_DESCRIPTIONS,
  type ConsentCategory,
} from '../../lib/consent-storage';
import './privacy-gate.css';
import { AppIcon } from '../icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrivacyGateProps {
  /** The consent category required to access this feature. */
  readonly requiredConsent: ConsentCategory;
  /** Human-readable feature name. */
  readonly featureName: string;
  /** Description of the feature for the privacy explainer. */
  readonly featureDescription: string;
  /** List of data types this feature accesses. */
  readonly dataNeeded?: readonly string[];
  /** Content to render when consent is granted. */
  readonly children: ReactNode;
  /** Optional custom fallback when consent is not granted. */
  readonly fallback?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Gates a feature behind consent with a privacy-first explainer. */
export const PrivacyGate: React.FC<PrivacyGateProps> = ({
  requiredConsent,
  featureName,
  featureDescription,
  dataNeeded = [],
  children,
  fallback,
}) => {
  const { consent, updateCategory } = useConsent();
  const { recordChange } = useConsentHistory();
  const isGranted = consent.categories[requiredConsent];

  const handleEnable = useCallback(() => {
    updateCategory(requiredConsent, true);
    recordChange(requiredConsent, true, 'dashboard');
  }, [requiredConsent, updateCategory, recordChange]);

  if (isGranted) {
    return <>{children}</>;
  }

  // Custom fallback takes precedence
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default privacy explainer
  return (
    <section className="privacy-gate" aria-label={`${featureName} requires consent`}>
      <div className="privacy-gate__card">
        <div className="privacy-gate__icon" aria-hidden="true">
          <AppIcon name="lock" />
        </div>

        <h3 className="privacy-gate__title">{featureName}</h3>

        <p className="privacy-gate__description">{featureDescription}</p>

        <div className="privacy-gate__consent-info">
          <h4 className="privacy-gate__consent-label">Requires:</h4>
          <p className="privacy-gate__consent-name">{CONSENT_LABELS[requiredConsent]}</p>
          <p className="privacy-gate__consent-description">
            {CONSENT_DESCRIPTIONS[requiredConsent]}
          </p>
        </div>

        {dataNeeded.length > 0 && (
          <div className="privacy-gate__data-section">
            <h4 className="privacy-gate__data-title">Data this feature accesses:</h4>
            <ul className="privacy-gate__data-list" role="list">
              {dataNeeded.map((item) => (
                <li key={item} className="privacy-gate__data-item" role="listitem">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          className="privacy-gate__enable-btn"
          onClick={handleEnable}
          aria-label={`Enable ${CONSENT_LABELS[requiredConsent]} to use ${featureName}`}
        >
          Enable {CONSENT_LABELS[requiredConsent]}
        </button>

        <p className="privacy-gate__revoke-note">
          You can withdraw consent at any time in Privacy Settings.
        </p>
      </div>
    </section>
  );
};

export default PrivacyGate;
