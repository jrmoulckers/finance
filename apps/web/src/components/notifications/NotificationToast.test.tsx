// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for NotificationToast auto-dismiss timing behavior.
 *
 * Covers WCAG 2.2.1 Timing Adjustable: toasts pause on hover/focus and
 * critical toasts never auto-dismiss.
 *
 * @module components/notifications/NotificationToast.test
 * References: #3792
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '../../lib/notifications';
import { NotificationToast } from './NotificationToast';

function makeToast(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 't1',
    type: 'balance_low',
    severity: 'info',
    title: 'Heads up',
    message: 'Checking balance is low.',
    createdAt: new Date().toISOString(),
    status: 'unread',
    ...overrides,
  };
}

describe('NotificationToast timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it('auto-dismisses a non-critical toast after the configured delay', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationToast notification={makeToast()} onDismiss={onDismiss} autoDismissMs={5000} />,
    );

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });

  it('never auto-dismisses a critical toast', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationToast
        notification={makeToast({ severity: 'critical' })}
        onDismiss={onDismiss}
        autoDismissMs={5000}
      />,
    );

    vi.advanceTimersByTime(60_000);
    expect(onDismiss).not.toHaveBeenCalled();
    // A critical toast is announced assertively for screen readers.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('pauses the countdown while hovered', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationToast notification={makeToast()} onDismiss={onDismiss} autoDismissMs={5000} />,
    );

    const toast = screen.getByRole('status');
    vi.advanceTimersByTime(3000);
    fireEvent.mouseEnter(toast);
    // Time passes while hovered — no dismissal.
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();

    // On leave the remaining ~2s resumes.
    fireEvent.mouseLeave(toast);
    vi.advanceTimersByTime(2000);
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });
});
