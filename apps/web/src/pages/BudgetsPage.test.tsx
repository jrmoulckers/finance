// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BudgetsPage } from './BudgetsPage';

describe('BudgetsPage', () => {
  it('renders without crashing', () => {
    render(<BudgetsPage />);
    expect(screen.getByText('Budgets')).toBeInTheDocument();
  });

  it('displays budget summary labels', () => {
    render(<BudgetsPage />);
    expect(screen.getByText('Budgeted')).toBeInTheDocument();
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
  });

  it('displays budget category names', () => {
    render(<BudgetsPage />);
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Housing')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText('Entertainment')).toBeInTheDocument();
  });

  it('has accessible progress indicators', () => {
    render(<BudgetsPage />);
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBe(6);
  });
});
