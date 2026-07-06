// SPDX-License-Identifier: MIT

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NavShortcuts, buildNavShortcutCategory } from './NavShortcuts';

const items = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'accounts', label: 'Accounts', href: '/accounts' },
  { id: 'transactions', label: 'Transactions', href: '/transactions' },
] as const;

describe('NavShortcuts', () => {
  it('renders nothing (headless: no competing modal surface)', () => {
    const { container } = render(<NavShortcuts onNavigate={vi.fn()} items={items} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('navigates with Ctrl+digit shortcuts', () => {
    const onNavigate = vi.fn();
    render(<NavShortcuts onNavigate={onNavigate} items={items} />);

    fireEvent.keyDown(window, { key: '2', ctrlKey: true });

    expect(onNavigate).toHaveBeenCalledWith('/accounts');
  });

  it('ignores Ctrl+digit shortcuts while typing in an input', () => {
    const onNavigate = vi.fn();
    render(<NavShortcuts onNavigate={onNavigate} items={items} />);

    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: '1', ctrlKey: true, bubbles: true });

    expect(onNavigate).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});

describe('buildNavShortcutCategory', () => {
  it('builds a "Locked navigation" category from the nav items', () => {
    const category = buildNavShortcutCategory(items);

    expect(category).not.toBeNull();
    expect(category?.title).toBe('Locked navigation');
    expect(category?.shortcuts).toHaveLength(3);
    expect(category?.shortcuts.map((shortcut) => shortcut.keys)).toContain('Ctrl + 1');
    expect(category?.shortcuts.some((shortcut) => shortcut.description.includes('Accounts'))).toBe(
      true,
    );
  });

  it('returns null when there are no navigation items', () => {
    expect(buildNavShortcutCategory([])).toBeNull();
  });
});
