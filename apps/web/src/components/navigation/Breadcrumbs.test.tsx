// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs (hierarchical)', () => {
  it('renders no trail on a top-level route', () => {
    render(<Breadcrumbs currentPath="/dashboard" currentTitle="Dashboard" />);

    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });

  it('renders a hierarchical trail for a nested route', () => {
    render(<Breadcrumbs currentPath="/settings/preferences" currentTitle="Preferences" />);

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    const current = screen.getByText('Preferences');
    expect(current.closest('[aria-current="page"]')).not.toBeNull();
  });

  it('renders parent list + record type for a detail route', () => {
    render(<Breadcrumbs currentPath="/accounts/abc123" currentTitle="Accounts" />);

    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/accounts');
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('does not use the legacy history "Recent navigation" label', () => {
    render(<Breadcrumbs currentPath="/accounts/abc123" currentTitle="Accounts" />);

    expect(screen.queryByRole('navigation', { name: 'Recent navigation' })).not.toBeInTheDocument();
  });
});
