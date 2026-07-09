// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BudgetsSkeleton, GoalsSkeleton, ListSkeleton } from './EntitySkeletons';

describe('EntitySkeletons', () => {
  it('BudgetsSkeleton marks the region as busy', () => {
    const { container } = render(<BudgetsSkeleton />);
    const root = container.querySelector('.skeleton-page--budgets');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('aria-busy', 'true');
  });

  it('GoalsSkeleton renders a card grid', () => {
    const { container } = render(<GoalsSkeleton />);
    expect(container.querySelector('.skeleton-page--goals')).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton-page__card').length).toBeGreaterThan(0);
  });

  it('ListSkeleton renders the requested number of rows and an accessible label', () => {
    render(<ListSkeleton rows={3} aria-label="Loading budgets" />);
    const region = screen.getByLabelText('Loading budgets');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.querySelectorAll('.skeleton-page__row').length).toBe(3);
  });
});
