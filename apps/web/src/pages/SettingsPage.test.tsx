// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logoutMock = vi.fn<() => Promise<void>>();
const deleteAccountMock = vi.fn<() => Promise<void>>();
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
    isDemoMode: false,
    loginWithEmail: vi.fn(),
    loginWithPasskey: vi.fn(),
    loginWithOAuth: vi.fn(),
    registerNewPasskey: vi.fn(),
    logout: logoutMock,
    deleteAccount: deleteAccountMock,
    refresh: vi.fn(),
    signupWithEmail: vi.fn(),
  }),
}));

vi.mock('../hooks/useOfflineStatus', () => ({
  useOfflineStatus: () => offlineStatusMock,
}));

const setThemeMock = vi.fn();
vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'system',
    resolvedTheme: 'light',
    setTheme: setThemeMock,
    themes: ['system', 'light', 'dark', 'dark-oled'],
  }),
}));

// Mock the GDPR components to avoid pulling in full consent logic
vi.mock('../components/gdpr', () => ({
  PrivacySettings: () => (
    <section aria-label="Privacy & Data">
      <div>Privacy Settings Mock</div>
    </section>
  ),
  CrashReportingSettings: () => <div>Crash Reporting Settings Mock</div>,
}));

const togglePrivacyModeMock = vi.fn();
vi.mock('../contexts/PrivacyModeContext', () => ({
  PrivacyPersistenceOption: {
    OffAfterOneMinute: 'off_after_1_minute',
    OffWhenAppCloses: 'off_when_app_closes',
    ManualOnly: 'manual_only',
  },
  usePrivacyMode: () => ({
    isPrivacyMode: false,
    persistence: 'off_after_1_minute',
    firstActivationMessage: 'Privacy mode hides exact amounts.',
    togglePrivacyMode: togglePrivacyModeMock,
    setPrivacyMode: vi.fn(),
    setPersistence: vi.fn(),
    maskValue: (v: string) => v,
  }),
  useIsPrivacyModeActive: () => false,
  useEffectiveMaskingMode: () => 'Visible',
  MaskingMode: {
    Visible: 'Visible',
    Bucketed: 'Bucketed',
    Percent: 'Percent',
    Dots: 'Dots',
  },
  MASKED_AMOUNT: '•••.••',
  MASKED_LABEL: '••••',
}));

// Mock display settings hook to avoid localStorage side-effects
const mockUpdateSettings = vi.fn();
const mockResetSettings = vi.fn();
vi.mock('../lib/display-settings', () => ({
  useMoneyDisplay: () => ({
    positiveColor: '#22c55e',
    negativeColor: '#ef4444',
    zeroColor: '#6b7280',
    showDecimals: true,
    negativeFormat: 'minus',
    currencyDisplay: 'symbol',
    updateSettings: mockUpdateSettings,
    resetSettings: mockResetSettings,
  }),
  // Re-export what CurrencyDisplay needs
  formatAmountWithSettings: (amount: number) => {
    const abs = Math.abs(amount) / 100;
    const formatted = `$${abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    if (amount < 0) return `-${formatted}`;
    return formatted;
  },
  getAmountColor: (amount: number) => {
    if (amount > 0) return '#22c55e';
    if (amount < 0) return '#ef4444';
    return '#6b7280';
  },
  DEFAULT_DISPLAY_SETTINGS: {
    positiveColor: 'var(--semantic-amount-positive, var(--color-success))',
    negativeColor: 'var(--semantic-amount-negative, var(--color-danger))',
    zeroColor: 'var(--semantic-text-secondary, var(--color-text-secondary))',
    showDecimals: true,
    negativeFormat: 'minus',
    currencyDisplay: 'symbol',
  },
  MoneyDisplayProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock the CurrencyRatesSettings to avoid pulling in exchange rate logic
vi.mock('../components/settings/CurrencyRatesSettings', () => ({
  CurrencyRatesSettings: () => (
    <section aria-label="Currency Rates">
      <div>Currency Rates Mock</div>
    </section>
  ),
}));

import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    logoutMock.mockReset();
    deleteAccountMock.mockReset();
    setThemeMock.mockReset();
    mockUpdateSettings.mockReset();
    mockResetSettings.mockReset();
    logoutMock.mockResolvedValue(undefined);
    deleteAccountMock.mockResolvedValue(undefined);
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
    expect(screen.getByText('Privacy Settings Mock')).toBeInTheDocument();
    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    expect(screen.getByLabelText('Theme')).toHaveValue('system');
    expect(screen.getByRole('checkbox', { name: 'Notifications' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Hide all financial amounts and balances' }),
    ).not.toBeChecked();
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

    expect(biometricLockButton).toBeDisabled();
    expect(biometricLockButton).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
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
    expect(screen.getByRole('region', { name: /display/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /security/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /about/i })).toBeInTheDocument();
    // "Data" and "Privacy & Data" sections both exist
    const dataRegions = screen.getAllByRole('region', { name: /data/i });
    expect(dataRegions.length).toBeGreaterThanOrEqual(2);
  });

  describe('Display settings section', () => {
    it('renders the Display section with all controls', () => {
      render(<SettingsPage />);

      expect(screen.getByText('Display')).toBeInTheDocument();
      expect(screen.getByLabelText('Positive amount color')).toBeInTheDocument();
      expect(screen.getByLabelText('Negative amount color')).toBeInTheDocument();
      expect(screen.getByLabelText('Zero amount color')).toBeInTheDocument();
      expect(screen.getByLabelText('Show cents (decimal places)')).toBeInTheDocument();
      expect(screen.getByLabelText('Negative number format')).toBeInTheDocument();
      expect(screen.getByLabelText('Currency display mode')).toBeInTheDocument();
    });

    it('renders a live preview section', () => {
      render(<SettingsPage />);

      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('calls updateSettings when show decimals is toggled', () => {
      render(<SettingsPage />);

      const checkbox = screen.getByLabelText('Show cents (decimal places)');
      fireEvent.click(checkbox);

      expect(mockUpdateSettings).toHaveBeenCalledWith({ showDecimals: false });
    });

    it('calls updateSettings when negative format changes', () => {
      render(<SettingsPage />);

      const select = screen.getByLabelText('Negative number format');
      fireEvent.change(select, { target: { value: 'parentheses' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ negativeFormat: 'parentheses' });
    });

    it('calls updateSettings when currency display changes', () => {
      render(<SettingsPage />);

      const select = screen.getByLabelText('Currency display mode');
      fireEvent.change(select, { target: { value: 'code' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ currencyDisplay: 'code' });
    });

    it('calls resetSettings when reset button is clicked', () => {
      render(<SettingsPage />);

      const resetBtn = screen.getByRole('button', { name: /reset display settings/i });
      fireEvent.click(resetBtn);

      expect(mockResetSettings).toHaveBeenCalledTimes(1);
    });
  });
});
