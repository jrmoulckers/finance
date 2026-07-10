// SPDX-License-Identifier: BUSL-1.1

/**
 * Feature-comparison table row for the onboarding "choose path" step. Extracted
 * from `OnboardingPage.tsx` (#3712).
 */

import React from 'react';

import { AppIcon } from '../../components/icons';
import type { FeatureAvailability } from '../../lib/local-only-mode';

export const FeatureRow: React.FC<{ feature: FeatureAvailability }> = ({ feature }) => (
  <tr className="onboarding__feature-row">
    <td className="onboarding__feature-name">
      <span className="onboarding__feature-title">{feature.name}</span>
      <span className="onboarding__feature-desc">{feature.description}</span>
    </td>
    <td
      className="onboarding__feature-cell"
      aria-label={
        feature.availableLocalOnly ? 'Available in Local Only' : 'Not available in Local Only'
      }
    >
      {feature.availableLocalOnly ? (
        <span className="onboarding__check" aria-hidden="true">
          <AppIcon name="check" />
        </span>
      ) : (
        <span className="onboarding__cross" aria-hidden="true">
          —
        </span>
      )}
    </td>
    <td className="onboarding__feature-cell" aria-label="Available with Account">
      <span className="onboarding__check" aria-hidden="true">
        <AppIcon name="check" />
      </span>
    </td>
  </tr>
);
