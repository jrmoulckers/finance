// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette, type CommandPaletteAction } from './CommandPalette';
import { recordNavigationEntry } from '../../lib/navigation/history';

function record(path: string, key: string): void {
  recordNavigationEntry({ path, title: path, key, visitedAt: Date.now() });
}

describe('CommandPalette recents (#3676)', () => {
  const prefetchAccounts = vi.fn();

  const actions: CommandPaletteAction[] = [
    {
      id: 'command-nav-accounts',
      label: 'Go to Accounts',
      href: '/accounts',
      prefetch: prefetchAccounts,
      perform: vi.fn(),
    },
    {
      id: 'command-nav-budgets',
      label: 'Go to Budgets',
      href: '/budgets',
      perform: vi.fn(),
    },
    {
      id: 'command-add-transaction',
      label: 'Add transaction',
      perform: vi.fn(),
    },
  ];

  beforeEach(() => {
    window.sessionStorage.clear();
    prefetchAccounts.mockClear();
  });

  it('surfaces recently visited destinations when the query is empty', () => {
    record('/accounts', 'a1');
    record('/budgets', 'b1');
    record('/dashboard', 'd1');

    render(<CommandPalette isOpen actions={actions} onClose={vi.fn()} currentPath="/dashboard" />);

    // Recent section is present and lists the visited destinations.
    const recentGroup = screen.getByRole('group', { name: 'Recent' });
    expect(within(recentGroup).getByRole('option', { name: 'Go to Budgets' })).toBeInTheDocument();
    expect(within(recentGroup).getByRole('option', { name: 'Go to Accounts' })).toBeInTheDocument();
  });

  it('excludes the current route from the recents', () => {
    record('/accounts', 'a1');
    record('/dashboard', 'd1');

    render(<CommandPalette isOpen actions={actions} onClose={vi.fn()} currentPath="/dashboard" />);

    const recentGroup = screen.getByRole('group', { name: 'Recent' });
    // Dashboard is the current route → must not appear as a recent shortcut.
    expect(
      within(recentGroup).queryByRole('option', { name: /dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it('hides the recents once the user starts searching', () => {
    record('/accounts', 'a1');

    render(<CommandPalette isOpen actions={actions} onClose={vi.fn()} currentPath="/dashboard" />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), {
      target: { value: 'budget' },
    });

    expect(screen.queryByRole('group', { name: 'Recent' })).not.toBeInTheDocument();
  });

  it('prefetches a destination chunk on hover (#3672)', () => {
    record('/accounts', 'a1');

    render(<CommandPalette isOpen actions={actions} onClose={vi.fn()} currentPath="/dashboard" />);

    const recentGroup = screen.getByRole('group', { name: 'Recent' });
    fireEvent.mouseEnter(within(recentGroup).getByRole('option', { name: 'Go to Accounts' }));

    expect(prefetchAccounts).toHaveBeenCalled();
  });
});
