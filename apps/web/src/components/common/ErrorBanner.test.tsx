// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('renders the error message', () => {
    render(<ErrorBanner message="Something went wrong." />);

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('renders a dismiss button when dismissible', () => {
    const onDismiss = vi.fn();

    render(<ErrorBanner message="Something went wrong." onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('announces the error via an alert role', () => {
    render(<ErrorBanner message="Something went wrong." />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
