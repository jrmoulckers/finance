// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AccountsSkeleton, DashboardSkeleton, Skeleton, TransactionsSkeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders with default line variant', () => {
    render(<Skeleton />);
    const el = screen.getByRole('status');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el).toHaveClass('skeleton--line');
  });

  it('renders circle variant', () => {
    render(<Skeleton variant="circle" width="48px" height="48px" />);
    const el = screen.getByRole('status');
    expect(el).toHaveClass('skeleton--circle');
    expect(el).toHaveStyle({ width: '48px', height: '48px' });
  });

  it('renders rectangle variant', () => {
    render(<Skeleton variant="rectangle" width="100%" height="200px" />);
    const el = screen.getByRole('status');
    expect(el).toHaveClass('skeleton--rectangle');
  });

  it('applies custom aria-label', () => {
    render(<Skeleton aria-label="Loading account data" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading account data');
  });

  it('applies additional className', () => {
    render(<Skeleton className="custom-class" />);
    expect(screen.getByRole('status')).toHaveClass('custom-class');
  });

  it('has a visually hidden label for screen readers', () => {
    render(<Skeleton aria-label="Loading items" />);
    expect(screen.getByText('Loading items')).toBeInTheDocument();
  });
});

describe('AccountsSkeleton', () => {
  it('renders with aria-busy', () => {
    const { container } = render(<AccountsSkeleton />);
    const wrapper = container.querySelector('.skeleton-page--accounts');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveAttribute('aria-busy', 'true');
  });

  it('renders multiple skeleton rows', () => {
    const { container } = render(<AccountsSkeleton />);
    const rows = container.querySelectorAll('.skeleton-page__row');
    expect(rows.length).toBe(4);
  });
});

describe('TransactionsSkeleton', () => {
  it('renders with filters and list rows', () => {
    const { container } = render(<TransactionsSkeleton />);
    expect(container.querySelector('.skeleton-page--transactions')).toBeInTheDocument();
    const rows = container.querySelectorAll('.skeleton-page__row');
    expect(rows.length).toBe(5);
  });
});

describe('DashboardSkeleton', () => {
  it('renders summary cards and list rows', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.querySelector('.skeleton-page--dashboard')).toBeInTheDocument();
    const rows = container.querySelectorAll('.skeleton-page__row');
    expect(rows.length).toBe(3);
  });
});
