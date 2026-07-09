// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PasswordStrengthMeter } from './PasswordStrengthMeter';

describe('PasswordStrengthMeter', () => {
  it('renders a progressbar reflecting the password strength', () => {
    render(<PasswordStrengthMeter password="correcthorsebatterystaple" />);
    const meter = screen.getByRole('progressbar');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '4');
    expect(meter).toHaveAttribute('aria-label', expect.stringContaining('Password strength:'));
  });

  it('scores a weak password lower than a strong one', () => {
    const { rerender } = render(<PasswordStrengthMeter password="123456" />);
    const weakScore = Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));

    rerender(<PasswordStrengthMeter password="A9!kZ2@wQ7#mL4$p" />);
    const strongScore = Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));

    expect(strongScore).toBeGreaterThan(weakScore);
  });
});
