// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders title, description, and a default alert role', () => {
    render(<ErrorState title="Couldn't load budgets" description="Try again shortly." />);

    const region = screen.getByRole('alert');
    expect(region).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Couldn't load budgets" })).toBeInTheDocument();
    expect(screen.getByText('Try again shortly.')).toBeInTheDocument();
  });

  it('renders a retry button that calls onRetry', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Failed" onRetry={onRetry} />);

    const button = screen.getByRole('button', { name: 'Try again' });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('reflects a busy state while retrying', () => {
    render(<ErrorState title="Failed" onRetry={() => {}} retrying />);

    const button = screen.getByRole('button', { name: 'Retrying…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('respects a custom heading level', () => {
    render(<ErrorState title="Nope" headingLevel={3} />);

    const heading = screen.getByRole('heading', { name: 'Nope' });
    expect(heading.tagName).toBe('H3');
  });

  it('does not render an actions row when no retry or action is provided', () => {
    const { container } = render(<ErrorState title="Just a message" />);
    expect(container.querySelector('.error-state__actions')).toBeNull();
  });
});
