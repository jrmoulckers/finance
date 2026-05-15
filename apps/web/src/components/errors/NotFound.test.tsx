// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NotFound } from './NotFound';

describe('NotFound', () => {
  it('renders the 404 status, title, and description', () => {
    render(<NotFound />);

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(
      screen.getByText('The page you are looking for does not exist or has been moved.'),
    ).toBeInTheDocument();
  });

  it('renders a link to the dashboard', () => {
    render(<NotFound />);

    const link = screen.getByRole('link', { name: 'Go to Dashboard' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('focuses the heading on mount for screen readers', () => {
    render(<NotFound />);

    const heading = screen.getByRole('heading', { name: 'Page not found' });
    expect(heading).toHaveFocus();
  });

  it('hides the 404 status from screen readers', () => {
    render(<NotFound />);

    const status = screen.getByText('404');
    expect(status).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders with custom props', () => {
    render(
      <NotFound
        title="Account not found"
        description="This account may have been deleted."
        homeLinkLabel="Back to Accounts"
        homeHref="/accounts"
      />,
    );

    expect(screen.getByText('Account not found')).toBeInTheDocument();
    expect(screen.getByText('This account may have been deleted.')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Back to Accounts' });
    expect(link).toHaveAttribute('href', '/accounts');
  });

  it('calls onGoHome when the link is clicked', () => {
    const onGoHome = vi.fn();
    render(<NotFound onGoHome={onGoHome} />);

    fireEvent.click(screen.getByRole('link', { name: 'Go to Dashboard' }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });

  it('renders as a main landmark', () => {
    render(<NotFound />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
