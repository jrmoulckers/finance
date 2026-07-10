// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartEmptyState, DEFAULT_CHART_EMPTY_MESSAGE } from './ChartEmptyState';

describe('ChartEmptyState', () => {
  it('renders the title heading and default message', () => {
    render(<ChartEmptyState title="Spending by category" />);
    expect(screen.getByRole('heading', { name: 'Spending by category' })).toBeInTheDocument();
    expect(screen.getByText(DEFAULT_CHART_EMPTY_MESSAGE)).toBeInTheDocument();
  });

  it('exposes the empty message through role="status" for assistive tech', () => {
    render(<ChartEmptyState title="Budget" message="Nothing here." />);
    expect(screen.getByRole('status')).toHaveTextContent('Nothing here.');
  });

  it('labels the figure with the title and message', () => {
    render(<ChartEmptyState title="Net worth" message="No history yet." />);
    expect(screen.getByRole('figure')).toHaveAttribute('aria-label', 'Net worth: No history yet.');
  });

  it('applies the provided title id so charts can reference it', () => {
    render(<ChartEmptyState title="Trend" titleId="trend-title" />);
    expect(screen.getByRole('heading', { name: 'Trend' })).toHaveAttribute('id', 'trend-title');
  });
});
