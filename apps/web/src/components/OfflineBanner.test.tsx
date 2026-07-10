// SPDX-License-Identifier: BUSL-1.1

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const offlineStatusMock = {
  isOffline: false,
  isOnline: true,
  isDegraded: false,
  degradedMessage: 'Online',
};

vi.mock('../hooks/useOfflineStatus', () => ({
  useOfflineStatus: () => offlineStatusMock,
}));

import { OfflineBanner } from './OfflineBanner';

describe('OfflineBanner', () => {
  beforeEach(() => {
    offlineStatusMock.isOffline = false;
    offlineStatusMock.isOnline = true;
    offlineStatusMock.isDegraded = false;
    offlineStatusMock.degradedMessage = 'Online';
  });

  it('shows the banner when offline', () => {
    offlineStatusMock.isOffline = true;
    offlineStatusMock.isOnline = false;
    offlineStatusMock.isDegraded = true;
    offlineStatusMock.degradedMessage =
      'You are offline. Changes will sync when connectivity is restored.';

    render(<OfflineBanner />);

    expect(screen.getByRole('status')).not.toHaveClass('offline-banner--hidden');
    expect(
      screen.getByText('You are offline. Changes will sync when connectivity is restored.'),
    ).toBeInTheDocument();
  });

  it('hides the banner when online', () => {
    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveClass('offline-banner--hidden');
  });

  it('shows degraded slow-network copy while still online', () => {
    offlineStatusMock.isDegraded = true;
    offlineStatusMock.degradedMessage =
      'Network is slow. Showing cached data while retrying in the background.';

    render(<OfflineBanner />);

    expect(screen.getByRole('status')).not.toHaveClass('offline-banner--hidden');
    expect(screen.getByText(/network is slow/i)).toBeInTheDocument();
  });

  it('has a polite live region', () => {
    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows a transient reconnection confirmation after coming back online', () => {
    vi.useFakeTimers();
    try {
      offlineStatusMock.isOffline = true;
      offlineStatusMock.isOnline = false;
      offlineStatusMock.isDegraded = true;
      offlineStatusMock.degradedMessage = 'You are offline.';

      const { rerender } = render(<OfflineBanner />);

      // Reconnect: degraded -> online.
      offlineStatusMock.isOffline = false;
      offlineStatusMock.isOnline = true;
      offlineStatusMock.isDegraded = false;
      offlineStatusMock.degradedMessage = 'Online';
      rerender(<OfflineBanner />);

      const banner = screen.getByRole('status');
      expect(banner).not.toHaveClass('offline-banner--hidden');
      expect(banner).toHaveClass('offline-banner--reconnected');
      expect(banner).toHaveAttribute('data-network-state', 'reconnected');
      expect(screen.getByText(/back online/i)).toBeInTheDocument();

      // Auto-dismisses after the confirmation window.
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      expect(screen.getByRole('status')).toHaveClass('offline-banner--hidden');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not show a reconnection confirmation on initial online load', () => {
    render(<OfflineBanner />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveClass('offline-banner--hidden');
    expect(banner).not.toHaveClass('offline-banner--reconnected');
    expect(screen.queryByText(/back online/i)).not.toBeInTheDocument();
  });

  it('suppresses the confirmation if it degrades again before the timer elapses', () => {
    vi.useFakeTimers();
    try {
      offlineStatusMock.isDegraded = true;
      offlineStatusMock.degradedMessage = 'You are offline.';
      const { rerender } = render(<OfflineBanner />);

      offlineStatusMock.isDegraded = false;
      offlineStatusMock.degradedMessage = 'Online';
      rerender(<OfflineBanner />);
      expect(screen.getByRole('status')).toHaveClass('offline-banner--reconnected');

      // Goes degraded again — confirmation must yield to the warning state.
      offlineStatusMock.isDegraded = true;
      offlineStatusMock.degradedMessage = 'Network is slow.';
      rerender(<OfflineBanner />);

      const banner = screen.getByRole('status');
      expect(banner).not.toHaveClass('offline-banner--reconnected');
      expect(banner).toHaveAttribute('data-network-state', 'degraded');
      expect(screen.getByText('Network is slow.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
