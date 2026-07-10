// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the snooze behavior of the useNotifications hook.
 *
 * @module hooks/useNotifications.test
 * References: #3792
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '../lib/notifications';
import { useNotifications } from './useNotifications';

const STORAGE_KEY = 'finance-notifications';

function seed(notifications: AppNotification[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
}

const baseNotification: AppNotification = {
  id: 'n1',
  type: 'bill_due',
  severity: 'warning',
  title: 'Rent due',
  message: 'Rent is due in 3 days.',
  createdAt: '2025-01-01T00:00:00.000Z',
  status: 'unread',
};

describe('useNotifications snooze', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('marks a notification snoozed with a wake time and drops it from the unread count', () => {
    seed([baseNotification]);
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.snooze('n1', '2999-01-01T00:00:00.000Z');
    });

    const snoozed = result.current.notifications.find((n) => n.id === 'n1');
    expect(snoozed?.status).toBe('snoozed');
    expect(snoozed?.snoozedUntil).toBe('2999-01-01T00:00:00.000Z');
    expect(result.current.unreadCount).toBe(0);
  });

  it('restores an already-expired snooze to unread on mount', () => {
    seed([{ ...baseNotification, status: 'snoozed', snoozedUntil: '2000-01-01T00:00:00.000Z' }]);
    const { result } = renderHook(() => useNotifications());

    const woken = result.current.notifications.find((n) => n.id === 'n1');
    expect(woken?.status).toBe('unread');
    expect(woken?.snoozedUntil).toBeUndefined();
    expect(result.current.unreadCount).toBe(1);
  });
});
