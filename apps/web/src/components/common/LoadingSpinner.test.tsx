// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with a status role', () => {
    render(<LoadingSpinner />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('has a polite live region', () => {
    render(<LoadingSpinner />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
