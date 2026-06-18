// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
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
});
