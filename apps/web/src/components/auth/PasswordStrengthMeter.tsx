// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';

import { calculatePasswordStrength } from '../../lib/password-strength';

export interface PasswordStrengthMeterProps {
  password: string;
}

/**
 * Visual password strength indicator with a colored bar and feedback text.
 *
 * Shared across the "create a password" surfaces (Signup, Reset) so the
 * guidance stays consistent (#3669). Renders nothing for an empty password.
 */
export const PasswordStrengthMeter: FC<PasswordStrengthMeterProps> = ({ password }) => {
  if (password.length === 0) {
    return null;
  }

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
