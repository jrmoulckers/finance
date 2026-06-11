// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockLocation = { key: 'route-1' };

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => mockLocation,
}));

import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockLocation = { key: 'route-1' };
  });

  it('does not render a trail on the first recorded visit', () => {
    render(<Breadcrumbs currentPath="/dashboard" currentTitle="Dashboard" />);

    expect(screen.queryByRole('navigation', { name: 'Recent navigation' })).not.toBeInTheDocument();
  });

  it('renders recent navigation links after moving to a new route', () => {
    const { rerender } = render(<Breadcrumbs currentPath="/dashboard" currentTitle="Dashboard" />);

    mockLocation = { key: 'route-2' };
    rerender(<Breadcrumbs currentPath="/accounts" currentTitle="Accounts" />);

    expect(screen.getByRole('navigation', { name: 'Recent navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByText('Accounts')).toBeInTheDocument();
  });
});
