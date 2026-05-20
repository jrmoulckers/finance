// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the NotificationCenter component.
 *
 * Tests mock hooks (not repositories) per project conventions.
 *
 * @module components/notifications/NotificationCenter.test
 * References: #1646
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '../../lib/notifications';
import { NotificationCenter } from './NotificationCenter';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockNotifications: AppNotification[] = [
  {
    id: '1',
    type: 'budget_threshold',
    severity: 'warning',
    title: 'Budget nearing limit',
    message: 'Groceries is at 80% ($400 of $500).',
    createdAt: new Date().toISOString(),
    status: 'unread',
    entityId: 'b1',
    entityType: 'budget',
    actionLabel: 'View budget',
    deduplicationKey: 'budget-b1-75',
  },
  {
    id: '2',
    type: 'goal_milestone',
    severity: 'success',
    title: 'Goal achieved! 🎉',
    message: 'Emergency Fund has been fully funded.',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    status: 'read',
    entityId: 'g1',
    entityType: 'goal',
    actionLabel: 'View goal',
    deduplicationKey: 'goal-g1-100',
  },
  {
    id: '3',
    type: 'transaction_confirmation',
    severity: 'success',
    title: 'Expense recorded',
    message: '$42.00 — Coffee Shop in Checking',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    status: 'dismissed',
    entityId: 't1',
    entityType: 'transaction',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationCenter', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the bell button with unread count', () => {
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const bell = screen.getByRole('button', {
      name: 'Notifications, 1 unread',
    });
    expect(bell).toBeDefined();
  });

  it('renders bell without badge when no unread', () => {
    render(
      <NotificationCenter
        notifications={[]}
        unreadCount={0}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toBeDefined();
  });

  it('opens the notification panel when bell is clicked', () => {
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const bell = screen.getByRole('button', {
      name: 'Notifications, 1 unread',
    });
    fireEvent.click(bell);

    expect(screen.getByText('Notifications')).toBeDefined();
  });

  it('does not show dismissed notifications in the panel', () => {
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));

    // Dismissed notification should not be visible
    expect(screen.queryByText('Expense recorded')).toBeNull();
    // Non-dismissed should be visible
    expect(screen.getByText('Budget nearing limit')).toBeDefined();
  });

  it('calls onMarkAllAsRead when "Mark all read" is clicked', () => {
    const onMarkAllAsRead = vi.fn();
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={onMarkAllAsRead}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    fireEvent.click(screen.getByText('Mark all read'));

    expect(onMarkAllAsRead).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));

    const dismissButtons = screen.getAllByLabelText(/^Dismiss notification:/);
    fireEvent.click(dismissButtons[0]);

    expect(onDismiss).toHaveBeenCalledWith('1');
  });

  it('shows empty state when there are no notifications', () => {
    render(
      <NotificationCenter
        notifications={[]}
        unreadCount={0}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByText('No notifications yet')).toBeDefined();
  });

  it('closes panel on Escape key', () => {
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));

    // Panel should be open
    expect(screen.getByText('Budget nearing limit')).toBeDefined();

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' });

    // Panel should be closed
    expect(screen.queryByText('Budget nearing limit')).toBeNull();
  });

  it('has proper ARIA attributes on the bell button', () => {
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const bell = screen.getByRole('button', {
      name: 'Notifications, 1 unread',
    });
    expect(bell.getAttribute('aria-haspopup')).toBe('true');
    expect(bell.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(bell);
    expect(bell.getAttribute('aria-expanded')).toBe('true');
  });

  it('announces unread count via live region', () => {
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    // The sr-only live region should contain the count
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toContain('1 unread notification');
  });
});
