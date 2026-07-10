// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the NotificationHistory component — grouping, filtering,
 * result count, snooze, and accessible item semantics.
 *
 * @module components/notifications/NotificationHistory.test
 * References: #1659, #3792
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '../../lib/notifications';
import { NotificationHistory } from './NotificationHistory';

function daysAgo(days: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const notifications: AppNotification[] = [
  {
    id: 'today-1',
    type: 'bill_due',
    severity: 'warning',
    title: 'Rent due soon',
    message: 'Rent is due in 3 days.',
    createdAt: daysAgo(0),
    status: 'unread',
  },
  {
    id: 'yesterday-1',
    type: 'budget_threshold',
    severity: 'info',
    title: 'Groceries at 75%',
    message: 'You have used 75% of the groceries budget.',
    createdAt: daysAgo(1),
    status: 'read',
  },
  {
    id: 'older-1',
    type: 'goal_milestone',
    severity: 'success',
    title: 'Halfway to vacation',
    message: 'Your vacation goal is 50% funded.',
    createdAt: daysAgo(20),
    status: 'read',
  },
];

function renderHistory(overrides: Partial<Parameters<typeof NotificationHistory>[0]> = {}) {
  const props = {
    notifications,
    onMarkAsRead: vi.fn(),
    onDismiss: vi.fn(),
    onClearDismissed: vi.fn(),
    onAction: vi.fn(),
    onSnooze: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<NotificationHistory {...props} />) };
}

describe('NotificationHistory', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('groups notifications under date headings', () => {
    renderHistory();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Older' })).toBeInTheDocument();
  });

  it('announces the filtered result count via a status region', () => {
    renderHistory();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('3 notifications');
  });

  it('renders each item primary action as a real button with severity in its name', () => {
    renderHistory();
    expect(
      screen.getByRole('button', { name: 'Warning: Rent due soon. Rent is due in 3 days.' }),
    ).toBeInTheDocument();
  });

  it('marks unread items as read when activated', () => {
    const { props } = renderHistory();
    fireEvent.click(
      screen.getByRole('button', { name: 'Warning: Rent due soon. Rent is due in 3 days.' }),
    );
    expect(props.onMarkAsRead).toHaveBeenCalledWith('today-1');
  });

  it('filters to a single status and updates the count', () => {
    renderHistory();
    fireEvent.click(screen.getByRole('button', { name: /^Unread/ }));
    expect(screen.getByRole('status')).toHaveTextContent('1 notification match your filters');
    expect(screen.queryByText('Groceries at 75%')).toBeNull();
  });

  it('shows a clear-filters affordance when a filter yields no results', () => {
    renderHistory({ notifications: [notifications[1]] }); // read-only item
    fireEvent.click(screen.getByRole('button', { name: /^Unread/ }));
    expect(screen.getByText('No notifications match your filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Groceries at 75%')).toBeInTheDocument();
  });

  it('snoozes a notification through the snooze menu', async () => {
    const { props } = renderHistory();
    fireEvent.click(screen.getAllByRole('button', { name: 'Snooze' })[0]);
    const menu = screen.getByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: '1 hour' }));
    expect(props.onSnooze).toHaveBeenCalledTimes(1);
    expect(props.onSnooze).toHaveBeenCalledWith('today-1', expect.any(String));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('shows the snooze label and hides the snooze control for snoozed items', () => {
    renderHistory({
      notifications: [
        {
          ...notifications[0],
          status: 'snoozed',
          snoozedUntil: daysAgo(-1),
        },
      ],
    });
    expect(screen.getByText(/^Snoozed until /)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Snooze' })).toBeNull();
  });

  it('renders a machine-readable time element', () => {
    const { container } = renderHistory();
    const timeEl = container.querySelector('time');
    expect(timeEl).not.toBeNull();
    expect(timeEl?.getAttribute('datetime')).toBe(notifications[0].createdAt);
  });
});
