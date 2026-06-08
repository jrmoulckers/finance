// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logoutMock = vi.fn<() => Promise<void>>();
const deleteAccountMock = vi.fn<() => Promise<void>>();
const offlineStatusMock = {
  isOffline: false,
  isOnline: true,
};
const { clearLocalAccountDataMock, householdImpactMock } = vi.hoisted(() => ({
  clearLocalAccountDataMock: vi.fn<() => Promise<void>>(),
  householdImpactMock: vi.fn(() => ({
    soloOwnedHouseholds: 1,
    memberHouseholds: 2,
    pendingInvites: 3,
  })),
}));

vi.mock('../lib/account/account-deletion', () => ({
  clearLocalAccountData: clearLocalAccountDataMock,
  getHouseholdDeletionImpact: householdImpactMock,
}));

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

// Mock the GDPR components to avoid pulling in full consent logic.
vi.mock('../components/gdpr', () => ({
  PrivacySettings: ({ onDeleteAccount }: { onDeleteAccount?: () => void }) => (
    <section aria-label="Privacy & Data Mock">
      <div>Privacy Settings Mock</div>
      <button type="button" onClick={onDeleteAccount}>
        Delete My Account & Data
      </button>
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

// Mock display settings hook to avoid localStorage side-effects.
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
  formatAmountWithSettings: (
    amount: number,
    settings: { currencyDisplay?: string; negativeFormat?: string } = {},
  ) => {
    const abs = Math.abs(amount) / 100;
    const formattedNumber = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted =
      settings.currencyDisplay === 'code' ? `USD ${formattedNumber}` : `$${formattedNumber}`;
    if (amount >= 0) return formatted;
    if (settings.negativeFormat === 'parentheses') return `(${formatted})`;
    if (settings.negativeFormat === 'color-only') return formatted;
    return `-${formatted}`;
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

// Mock the CurrencyRatesSettings to avoid pulling in exchange rate logic.
vi.mock('../components/settings/CurrencyRatesSettings', () => ({
  CurrencyRatesSettings: () => (
    <section aria-label="Currency Rates">
      <div>Currency Rates Mock</div>
    </section>
  ),
}));

import { SettingsPage } from './SettingsPage';
import { SettingsAccountPage } from './settings/SettingsAccountPage';
import { SettingsAdvancedPage } from './settings/SettingsAdvancedPage';
import { SettingsPreferencesPage } from './settings/SettingsPreferencesPage';
import { SettingsPrivacyPage } from './settings/SettingsPrivacyPage';
import { SettingsSyncPage } from './settings/SettingsSyncPage';

/**
 * Mount the Settings shell + all nested sub-routes at `path`. Mirrors the
 * registration in `routes.tsx` so behaviour stays in lock-step with prod.
 */
function renderSettingsAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />}>
          <Route index element={<Navigate to="account" replace />} />
          <Route path="account" element={<SettingsAccountPage />} />
          <Route path="preferences" element={<SettingsPreferencesPage />} />
          <Route path="privacy" element={<SettingsPrivacyPage />} />
          <Route path="sync" element={<SettingsSyncPage />} />
          <Route path="advanced" element={<SettingsAdvancedPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    logoutMock.mockReset();
    deleteAccountMock.mockReset();
    setThemeMock.mockReset();
    mockUpdateSettings.mockReset();
    mockResetSettings.mockReset();
    clearLocalAccountDataMock.mockReset();
    clearLocalAccountDataMock.mockResolvedValue(undefined);
    householdImpactMock.mockClear();
    householdImpactMock.mockReturnValue({
      soloOwnedHouseholds: 1,
      memberHouseholds: 2,
      pendingInvites: 3,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
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

  describe('shell', () => {
    it('renders the page title and section navigation rail', () => {
      renderSettingsAt('/settings/account');

      expect(screen.getByRole('heading', { name: 'Settings', level: 2 })).toBeInTheDocument();
      const nav = screen.getByRole('navigation', { name: /settings sections/i });
      expect(nav).toBeInTheDocument();
      // Each section is a real <a> link inside <nav> for keyboard nav.
      ['Account', 'Preferences', 'Privacy & Data', 'Sync & Devices', 'Advanced'].forEach(
        (label) => {
          expect(nav.querySelector(`a[href$='${label.toLowerCase().split(' ')[0]}']`)).toBeTruthy();
        },
      );
    });

    it('redirects /settings (bare) to /settings/account', () => {
      renderSettingsAt('/settings');

      // Account sub-page heading present after redirect.
      expect(screen.getByRole('heading', { name: 'Account', level: 2 })).toBeInTheDocument();
      // The Account sub-page renders the Profile section.
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });

    it('marks the active sub-page link with aria-current="page"', () => {
      renderSettingsAt('/settings/preferences');

      const link = screen.getByRole('link', { name: /^Preferences/i });
      expect(link).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('Account sub-page', () => {
    it('shows authenticated user info', () => {
      renderSettingsAt('/settings/account');

      expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    });

    it('confirms before signing out', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderSettingsAt('/settings/account');
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to sign out?');
      expect(logoutMock).toHaveBeenCalledTimes(1);
    });

    it('gates account deletion behind typed confirmation and shows household impact', async () => {
      renderSettingsAt('/settings/account');

      fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }));

      const dialog = await screen.findByRole('dialog', { name: /delete account and all data/i });
      // Copy per #1962 — only renders bullets when the count is non-zero
      // so the wording stays accurate for users with no households at all.
      expect(dialog).toHaveTextContent('1 household you solely own will be deleted entirely');
      expect(dialog).toHaveTextContent('You will be removed from 2 shared households');
      expect(dialog).toHaveTextContent(
        'every transaction, budget, goal, account, and category you contributed there is deleted',
      );
      expect(dialog).toHaveTextContent('3 pending invitations you sent will be revoked');
      expect(dialog).toHaveTextContent(/sign-in identity.*unlinked/i);
      expect(dialog).toHaveTextContent(/cannot be undone/i);

      const destructiveButton = screen.getByRole('button', { name: /yes, delete everything/i });
      const cancelButton = screen.getByRole('button', { name: /cancel/i });

      // Issue #1961 — destructive button must be both visually disabled AND
      // announced as disabled to screen readers via aria-disabled.
      expect(destructiveButton).toBeDisabled();
      expect(destructiveButton).toHaveAttribute('aria-disabled', 'true');
      expect(destructiveButton).toHaveClass('settings-account-delete__confirm-button--danger');
      expect(cancelButton).toHaveClass('settings-account-delete__cancel-button--secondary');

      // Bypass attempt — click the disabled button. The native disabled
      // attribute already blocks the click, but defense-in-depth means the
      // handler also early-returns. Either way, no fetch must fire.
      fireEvent.click(destructiveButton);
      expect(fetch).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
        target: { value: 'delete' }, // wrong case
      });
      expect(destructiveButton).toBeDisabled();
      expect(destructiveButton).toHaveAttribute('aria-disabled', 'true');

      fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
        target: { value: 'DELETE' },
      });

      expect(destructiveButton).toBeEnabled();
      expect(destructiveButton).toHaveAttribute('aria-disabled', 'false');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('treats an HTML 200 response from the delete endpoint as a failure (#1960)', async () => {
      // Production Caddy used to be missing the /api/account/* proxy rule,
      // so this fetch silently returned 200 OK + index.html. The client
      // must NOT treat that as a successful deletion.
      const htmlResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse));
      const assignSpy = vi.fn();
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { ...window.location, assign: assignSpy },
      });

      renderSettingsAt('/settings/account');
      fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }));
      await screen.findByRole('dialog', { name: /delete account and all data/i });

      fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
        target: { value: 'DELETE' },
      });
      fireEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }));

      // Yield to the in-flight async handler.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(clearLocalAccountDataMock).not.toHaveBeenCalled();
      expect(assignSpy).not.toHaveBeenCalled();
      expect(await screen.findByText(/couldn't delete account/i)).toBeInTheDocument();
    });
  });

  describe('Preferences sub-page', () => {
    it('renders persisted preferences and section landmarks', () => {
      renderSettingsAt('/settings/preferences');

      expect(screen.getByLabelText('Currency')).toHaveValue('USD');
      expect(screen.getByLabelText('Theme')).toHaveValue('system');
      expect(screen.getByRole('checkbox', { name: 'Notifications' })).toBeChecked();
      expect(screen.getByRole('region', { name: /preferences/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /display/i })).toBeInTheDocument();
    });

    it('renders the Display section with all controls', () => {
      renderSettingsAt('/settings/preferences');

      expect(screen.getByText('Display')).toBeInTheDocument();
      expect(screen.getByLabelText('Positive amount color')).toBeInTheDocument();
      expect(screen.getByLabelText('Negative amount color')).toBeInTheDocument();
      expect(screen.getByLabelText('Zero amount color')).toBeInTheDocument();
      expect(screen.getByLabelText('Show cents (decimal places)')).toBeInTheDocument();
      expect(screen.getByLabelText('Negative number format')).toBeInTheDocument();
      expect(screen.getByLabelText('Currency display mode')).toBeInTheDocument();
    });

    it('renders a live preview section', () => {
      renderSettingsAt('/settings/preferences');

      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('renders accurate negative format examples', () => {
      renderSettingsAt('/settings/preferences');

      const examples = screen.getByLabelText('Negative format examples');
      expect(examples).toHaveTextContent('Standard-$1,234.56');
      expect(examples).toHaveTextContent('Accounting($1,234.56)');
      expect(examples).toHaveTextContent('Color Only$1,234.56');
    });

    it('calls updateSettings when show decimals is toggled', () => {
      renderSettingsAt('/settings/preferences');

      const checkbox = screen.getByLabelText('Show cents (decimal places)');
      fireEvent.click(checkbox);

      expect(mockUpdateSettings).toHaveBeenCalledWith({ showDecimals: false });
    });

    it('calls updateSettings when negative format changes', () => {
      renderSettingsAt('/settings/preferences');

      const select = screen.getByLabelText('Negative number format');
      fireEvent.change(select, { target: { value: 'parentheses' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ negativeFormat: 'parentheses' });
    });

    it('calls updateSettings when currency display changes', () => {
      renderSettingsAt('/settings/preferences');

      const select = screen.getByLabelText('Currency display mode');
      fireEvent.change(select, { target: { value: 'code' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ currencyDisplay: 'code' });
    });

    it('calls resetSettings when reset button is clicked', () => {
      renderSettingsAt('/settings/preferences');

      const resetBtn = screen.getByRole('button', { name: /reset display settings/i });
      fireEvent.click(resetBtn);

      expect(mockResetSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('Privacy sub-page', () => {
    it('renders the privacy mode toggle and the GDPR PrivacySettings mock', () => {
      renderSettingsAt('/settings/privacy');

      expect(
        screen.getByRole('checkbox', { name: 'Hide all financial amounts and balances' }),
      ).not.toBeChecked();
      expect(screen.getByText('Privacy Settings Mock')).toBeInTheDocument();
    });
  });

  describe('Sync sub-page', () => {
    it('shows online sync status and passkey registration state', () => {
      renderSettingsAt('/settings/sync');

      expect(screen.getByText('Online — synced')).toBeInTheDocument();
      expect(screen.getByText('✓ Registered')).toBeInTheDocument();
    });

    it('shows offline sync messaging when the app is offline', () => {
      offlineStatusMock.isOffline = true;
      offlineStatusMock.isOnline = false;

      renderSettingsAt('/settings/sync');

      expect(screen.getByText('Offline — changes saved locally')).toBeInTheDocument();
    });

    it('renders future features as disabled buttons with accessible labels', () => {
      renderSettingsAt('/settings/sync');

      const biometricLockButton = screen.getByRole('button', {
        name: 'Biometric lock — available in a future update',
      });

      expect(biometricLockButton).toBeDisabled();
      expect(biometricLockButton).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByText('Coming soon')).toBeInTheDocument();
    });
  });

  describe('Advanced sub-page', () => {
    it('renders the version and experimental mood-tags controls', () => {
      renderSettingsAt('/settings/advanced');

      expect(screen.getByText('0.1.0')).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: 'Allow mood tags on transactions' }),
      ).toBeInTheDocument();
    });
  });
});
