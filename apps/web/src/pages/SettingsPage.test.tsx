// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logoutMock = vi.fn<() => Promise<void>>();
const offlineStatusMock = {
  isOffline: false,
  isOnline: true,
};

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: 'user-1',
      email: 'alex@example.com',
      hasPasskey: true,
    },
    error: null,
    webAuthnSupported: true,
    loginWithEmail: vi.fn(),
    loginWithPasskey: vi.fn(),
    registerNewPasskey: vi.fn(),
    logout: logoutMock,
    refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/useOfflineStatus', () => ({
  useOfflineStatus: () => offlineStatusMock,
}));

import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    logoutMock.mockReset();
    logoutMock.mockResolvedValue(undefined);
    offlineStatusMock.isOffline = false;
    offlineStatusMock.isOnline = true;

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders the settings sections and persisted preferences', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Data')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    expect(screen.getByLabelText('Theme')).toHaveValue('system');
    expect(screen.getByRole('checkbox', { name: 'Notifications' })).toBeChecked();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
  });

  it('shows authenticated user info and online sync status', () => {
    render(<SettingsPage />);

    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByText('Online — synced')).toBeInTheDocument();
    expect(screen.getByText('✓ Registered')).toBeInTheDocument();
  });

  it('renders future features as disabled buttons with accessible labels', () => {
    render(<SettingsPage />);

    const biometricLockButton = screen.getByRole('button', {
      name: 'Biometric lock — available in a future update',
    });
    const accountDeletionButton = screen.getByRole('button', {
      name: 'Account deletion — available in a future update',
    });

    expect(biometricLockButton).toBeDisabled();
    expect(biometricLockButton).toHaveAttribute('aria-disabled', 'true');
    expect(accountDeletionButton).toBeDisabled();
    expect(accountDeletionButton).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
  });

  it('shows offline sync messaging when the app is offline', () => {
    offlineStatusMock.isOffline = true;
    offlineStatusMock.isOnline = false;

    render(<SettingsPage />);

    expect(screen.getByText('Offline — changes saved locally')).toBeInTheDocument();
  });

  it('confirms before signing out', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to sign out?');
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('has accessible section landmarks', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('region', { name: /preferences/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /security/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /data/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /danger zone/i })).toBeInTheDocument();
  });
});
