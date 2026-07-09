// SPDX-License-Identifier: BUSL-1.1

/**
 * PasswordStrengthMeter — shared visual password-strength indicator.
 *
 * Extracted from SignupPage so the same accessible meter can be reused on
 * every screen where a user chooses a password (signup, reset). See #3770.
 */

import React from 'react';

import { calculatePasswordStrength } from '../../lib/password-strength';

export interface PasswordStrengthMeterProps {
  /** The current password value to score. */
  password: string;
}

/** Visual password strength indicator with a colored bar and feedback. */
export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password }) => {
  const strength = calculatePasswordStrength(password);
  const widthPercent = ((strength.score + 1) / 5) * 100;

  return (
    <div className="auth-password-strength" aria-live="polite">
      <div
        className="auth-password-strength__bar"
        role="progressbar"
        aria-valuenow={strength.score}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-label={`Password strength: ${strength.label}`}
      >
        <div
          className="auth-password-strength__fill"
          style={{
            width: `${widthPercent}%`,
            backgroundColor: strength.color,
          }}
        />
      </div>
      <span className="auth-password-strength__label">{strength.label}</span>
      {strength.feedback && (
        <span className="auth-password-strength__feedback">{strength.feedback}</span>
      )}
    </div>
  );
};

export default PasswordStrengthMeter;
