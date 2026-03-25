// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const swUpdateMock = {
  updateAvailable: false,
  applyUpdate: vi.fn(),
};

vi.mock('../../hooks/useServiceWorkerUpdate', () => ({
  useServiceWorkerUpdate: () => swUpdateMock,
}));

import { UpdateBanner } from './UpdateBanner';

describe('UpdateBanner', () => {
  beforeEach(() => {
    swUpdateMock.updateAvailable = false;
    swUpdateMock.applyUpdate.mockClear();
  });

  it('renders nothing when no update is available', () => {
    const { container } = render(<UpdateBanner />);

    expect(container.innerHTML).toBe('');
  });

  it('shows the update banner when an update is available', () => {
    swUpdateMock.updateAvailable = true;

    render(<UpdateBanner />);

    expect(screen.getByText('Update available')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Update the app now and reload to the latest version',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss update notification' })).toBeInTheDocument();
  });

  it('calls applyUpdate when the Update now button is clicked', () => {
    swUpdateMock.updateAvailable = true;

    render(<UpdateBanner />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Update the app now and reload to the latest version',
      }),
    );

    expect(swUpdateMock.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('hides the banner when the Dismiss button is clicked', () => {
    swUpdateMock.updateAvailable = true;

    render(<UpdateBanner />);

    expect(screen.getByText('Update available')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notification' }));

    expect(screen.queryByText('Update available')).not.toBeInTheDocument();
  });

  it('has a polite live region for screen reader announcements', () => {
    swUpdateMock.updateAvailable = true;

    render(<UpdateBanner />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveAttribute('aria-atomic', 'true');
  });
});
