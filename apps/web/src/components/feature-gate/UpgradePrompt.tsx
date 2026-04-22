// SPDX-License-Identifier: BUSL-1.1

/**
 * UpgradePrompt — UI shown when a feature is gated behind premium.
 *
 * Accessible card explaining the feature and offering an upgrade action.
 */

import React from 'react';
import { FEATURE_DEFINITIONS, getPremiumFeatures, type FeatureId } from './feature-gate-engine';
import './feature-gate.css';

export interface UpgradePromptProps {
  /** The feature that triggered this prompt. */
  feature?: FeatureId;
  /** Custom message override. */
  message?: string;
  /** Called when user clicks "Upgrade". */
  onUpgrade?: () => void;
  /** Additional CSS class. */
  className?: string;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  feature,
  message,
  onUpgrade,
  className = '',
}) => {
  const featureDef = feature ? FEATURE_DEFINITIONS[feature] : null;
  const premiumFeatures = getPremiumFeatures();

  const displayMessage =
    message ??
    (featureDef
      ? `${featureDef.name} is a premium feature. Upgrade to unlock ${featureDef.description.toLowerCase()}.`
      : 'Upgrade to premium to unlock all features.');

  return (
    <section className={`upgrade-prompt ${className}`.trim()} aria-label="Upgrade to premium">
      <div className="upgrade-prompt__content">
        <div className="upgrade-prompt__icon" aria-hidden="true">
          ⭐
        </div>
        <h3 className="upgrade-prompt__title">Upgrade to Premium</h3>
        <p className="upgrade-prompt__message">{displayMessage}</p>

        {!feature && premiumFeatures.length > 0 && (
          <ul className="upgrade-prompt__features" role="list">
            {premiumFeatures.slice(0, 4).map((pf) => (
              <li key={pf.id} className="upgrade-prompt__feature-item" role="listitem">
                <span aria-hidden="true">✓</span> {pf.name}
              </li>
            ))}
          </ul>
        )}

        {onUpgrade && (
          <button
            type="button"
            className="form-button form-button--primary upgrade-prompt__button"
            onClick={onUpgrade}
            aria-label="Upgrade to premium"
          >
            Upgrade Now
          </button>
        )}
      </div>
    </section>
  );
};

export default UpgradePrompt;
