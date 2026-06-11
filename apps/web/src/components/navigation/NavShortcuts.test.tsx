// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NavShortcuts } from './NavShortcuts';

vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
}));

const items = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'accounts', label: 'Accounts', href: '/accounts' },
  { id: 'transactions', label: 'Transactions', href: '/transactions' },
] as const;

describe('NavShortcuts', () => {
  it('renders the locked shortcut order in the overlay', () => {
    render(<NavShortcuts isOpen={true} onClose={vi.fn()} onNavigate={vi.fn()} items={items} />);

    expect(screen.getByRole('dialog', { name: 'Navigation shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  it('navigates with Ctrl+digit shortcuts', () => {
    const onNavigate = vi.fn();
    render(<NavShortcuts isOpen={false} onClose={vi.fn()} onNavigate={onNavigate} items={items} />);

    fireEvent.keyDown(window, { key: '2', ctrlKey: true });

    expect(onNavigate).toHaveBeenCalledWith('/accounts');
  });

  it('ignores Ctrl+digit shortcuts while typing in an input', () => {
    const onNavigate = vi.fn();
    render(<NavShortcuts isOpen={false} onClose={vi.fn()} onNavigate={onNavigate} items={items} />);

    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: '1', ctrlKey: true, bubbles: true });

    expect(onNavigate).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
