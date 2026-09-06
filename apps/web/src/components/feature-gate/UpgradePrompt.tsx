// SPDX-License-Identifier: BUSL-1.1

/**
 * UpgradePrompt — UI shown when a feature is gated behind premium.
 *
 * Accessible card linking to plan comparison. It is not a capability gate.
 */

import React from 'react';
import { FEATURE_DEFINITIONS, type FeatureId } from './feature-gate-engine';
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
  const displayMessage =
    message ??
    (featureDef
      ? `${featureDef.name} is available without a paid plan.`
      : 'Compare plans for connected services and future plan benefits.');

  return (
    <section className={`upgrade-prompt ${className}`.trim()} aria-label="Compare plans">
      <div className="upgrade-prompt__content">
        <div className="upgrade-prompt__icon" aria-hidden="true">
          ⭐
        </div>
        <h3 className="upgrade-prompt__title">Compare plans</h3>
        <p className="upgrade-prompt__message">{displayMessage}</p>

        {onUpgrade && (
          <button
            type="button"
            className="form-button form-button--primary upgrade-prompt__button"
            onClick={onUpgrade}
            aria-label="View plans"
          >
            View plans
          </button>
        )}
      </div>
    </section>
  );
};

export default UpgradePrompt;
