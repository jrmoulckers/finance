// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the NotificationsPage full-screen view.
 *
 * The shared notification store is mocked via `useNotificationCenter` so the
 * page can be rendered in isolation (per project conventions — mock hooks, not
 * repositories).
 *
 * @module pages/NotificationsPage.test
 * References: #3539
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { AppNotification } from '../lib/notifications';
import type { UseNotificationsResult } from '../hooks/useNotifications';

vi.mock('../contexts/NotificationsContext', () => ({
  useNotificationCenter: vi.fn(),
}));

import { useNotificationCenter } from '../contexts/NotificationsContext';
import { NotificationsPage } from './NotificationsPage';

const mockedUseNotificationCenter = vi.mocked(useNotificationCenter);

const sampleNotifications: AppNotification[] = [
  {
    id: '1',
    type: 'balance_low',
    severity: 'warning',
    title: 'New merchant to review',
    message: 'We noticed a $42.00 charge from "Pixel Arcade" which is new to you.',
    actionHint: 'If you do not recognize it, call the number on your card.',
    createdAt: new Date().toISOString(),
    status: 'unread',
  },
];

function buildStore(overrides: Partial<UseNotificationsResult> = {}): UseNotificationsResult {
  return {
    notifications: sampleNotifications,
    unreadCount: 1,
    loading: false,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    dismiss: vi.fn(),
    snooze: vi.fn(),
    clearDismissed: vi.fn(),
    addNotification: vi.fn(),
    addNotifications: vi.fn(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe('NotificationsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the page title and unread summary', () => {
    mockedUseNotificationCenter.mockReturnValue(buildStore());
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeDefined();
    expect(screen.getByText('1 unread notification.')).toBeDefined();
  });

  it('shows the caught-up state when there is nothing unread', () => {
    mockedUseNotificationCenter.mockReturnValue(buildStore({ unreadCount: 0 }));
    renderPage();

    expect(screen.getByText('You are all caught up.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull();
  });

  it('marks all as read from the header action', () => {
    const markAllAsRead = vi.fn();
    mockedUseNotificationCenter.mockReturnValue(buildStore({ markAllAsRead }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(markAllAsRead).toHaveBeenCalledOnce();
  });

  it('renders the full notification history list', () => {
    mockedUseNotificationCenter.mockReturnValue(buildStore());
    renderPage();

    expect(screen.getByText('New merchant to review')).toBeDefined();
    expect(
      screen.getByText('If you do not recognize it, call the number on your card.'),
    ).toBeDefined();
  });
});
