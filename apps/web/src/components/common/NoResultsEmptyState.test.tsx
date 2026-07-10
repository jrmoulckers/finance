// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NoResultsEmptyState } from './NoResultsEmptyState';

describe('NoResultsEmptyState', () => {
  it('renders the default heading and description', () => {
    render(<NoResultsEmptyState />);

    expect(screen.getByRole('heading', { name: /no matches found/i })).toBeInTheDocument();
    expect(screen.getByText(/try adjusting your search or filters/i)).toBeInTheDocument();
  });

  it('announces itself via role="status"', () => {
    render(<NoResultsEmptyState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not render a clear-filters button when no handler is given', () => {
    render(<NoResultsEmptyState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders and wires the clear-filters button when a handler is given', async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    render(<NoResultsEmptyState onClearFilters={onClearFilters} />);

    const button = screen.getByRole('button', { name: /clear filters/i });
    await user.click(button);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('supports custom copy and clear label', () => {
    render(
      <NoResultsEmptyState
        title="No transactions found"
        description="Nothing matches these filters."
        clearLabel="Reset"
        onClearFilters={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: /no transactions found/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing matches these filters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('respects a custom heading level for document outline', () => {
    render(<NoResultsEmptyState headingLevel={3} />);
    expect(
      screen.getByRole('heading', { level: 3, name: /no matches found/i }),
    ).toBeInTheDocument();
  });
});
