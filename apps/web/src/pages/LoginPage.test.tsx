// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

const navigateMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  loginWithPasskey: vi.fn(),
  loginWithOAuth: vi.fn(),
  isAuthenticated: false,
  isLoading: false,
  error: null as string | null,
  user: null,
  webAuthnSupported: true,
  webAuthnReady: true,
  isDemoMode: false,
  showPasskeyPrompt: false,
  dismissPasskeyPrompt: vi.fn(),
  isSigningOut: false,
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('../components/auth/PasskeySetupPrompt', () => ({
  PasskeySetupPrompt: () => null,
}));

const passkeyPrefsMock = vi.hoisted(() => ({
  hasRegisteredPasskey: vi.fn(() => false),
}));
vi.mock('../lib/passkey-preferences', () => passkeyPrefsMock);

const preferredAuthMock = vi.hoisted(() => ({
  getPreferredAuthMethod: vi.fn(() => null as 'passkey' | 'password' | null),
  setPreferredAuthMethod: vi.fn(),
}));
vi.mock('../auth/preferred-auth-method', () => preferredAuthMock);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

/**
 * Set up the WebAuthn capability surface for tests. By default we stub
 * `isUserVerifyingPlatformAuthenticatorAvailable` to return `false` so that
 * the legacy email/password layout is the deterministic baseline. Tests can
 * opt into the biometric-first layout via `setPlatformAuthAvailable(true)`.
 */
function setPlatformAuthAvailable(available: boolean): void {
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    writable: true,
    value: {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(available),
    },
  });
}

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    authState.loginWithEmail.mockReset();
    authState.loginWithPasskey.mockReset();
    authState.loginWithOAuth.mockReset();
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.error = null;
    authState.user = null;
    authState.webAuthnSupported = true;
    authState.webAuthnReady = true;
    authState.showPasskeyPrompt = false;
    authState.isSigningOut = false;
    authState.dismissPasskeyPrompt.mockReset();
    navigateMock.mockReset();

    passkeyPrefsMock.hasRegisteredPasskey.mockReset().mockReturnValue(false);
    preferredAuthMock.getPreferredAuthMethod.mockReset().mockReturnValue(null);
    preferredAuthMock.setPreferredAuthMethod.mockReset();

    setPlatformAuthAvailable(false);
  });

  it('renders email and password fields', () => {
    renderLoginPage();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    renderLoginPage();

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows link to signup page', () => {
    renderLoginPage();

    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
  });

  it('shows forgot password link without requiring a login error', () => {
    renderLoginPage();

    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows password-updated banner from route state', () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/login', state: { message: 'Password updated.' } }]}
      >
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Password updated.');
  });

  it('shows passkey button when webAuthn supported', () => {
    authState.webAuthnSupported = true;

    renderLoginPage();

    expect(screen.getByRole('button', { name: /sign in with passkey/i })).toBeInTheDocument();
  });

  it('disables passkey button until WebAuthn is ready', () => {
    authState.webAuthnSupported = true;
    authState.webAuthnReady = false;

    renderLoginPage();

    expect(screen.getByRole('button', { name: /sign in with passkey/i })).toBeDisabled();
  });

  it('disables submit while loading', () => {
    authState.isLoading = true;

    renderLoginPage();

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });

  describe('biometric-first layout (#1983)', () => {
    beforeEach(() => {
      setPlatformAuthAvailable(true);
      preferredAuthMock.getPreferredAuthMethod.mockReturnValue('passkey');
    });

    it('promotes biometric sign-in as the primary CTA when preferred=passkey', async () => {
      renderLoginPage();

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /sign in with biometrics/i }),
        ).toBeInTheDocument(),
      );
    });

    it('collapses the email/password form behind a disclosure', async () => {
      const { container } = renderLoginPage();

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /use email & password/i })).toBeInTheDocument(),
      );

      // Form is hidden when biometric is primary and the disclosure is collapsed.
      const form = container.querySelector('#login-email-form');
      expect(form).not.toBeNull();
      expect(form).toHaveAttribute('hidden');
    });

    it('expands the email/password form when the disclosure is clicked', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      const { container } = renderLoginPage();

      const disclosure = await screen.findByRole('button', { name: /use email & password/i });
      await user.click(disclosure);

      const form = container.querySelector('#login-email-form');
      expect(form).not.toBeNull();
      expect(form).not.toHaveAttribute('hidden');
      // Toggle re-labelled
      expect(screen.getByRole('button', { name: /hide email & password/i })).toBeInTheDocument();
    });

    it('records preferred=passkey after a successful biometric sign-in', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      authState.loginWithPasskey.mockResolvedValue(undefined);

      renderLoginPage();

      const button = await screen.findByRole('button', { name: /sign in with biometrics/i });
      await user.click(button);

      await waitFor(() =>
        expect(preferredAuthMock.setPreferredAuthMethod).toHaveBeenCalledWith('passkey'),
      );
    });
  });

  describe('preferred=password (no downgrade)', () => {
    it('keeps the email/password layout when preferred=password', async () => {
      setPlatformAuthAvailable(true);
      preferredAuthMock.getPreferredAuthMethod.mockReturnValue('password');

      renderLoginPage();

      // The biometric-primary CTA should NOT be shown.
      expect(
        screen.queryByRole('button', { name: /sign in with biometrics/i }),
      ).not.toBeInTheDocument();

      // Standard email/password layout is visible.
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });

    it('does NOT call setPreferredAuthMethod on email/password sign-in', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      authState.loginWithEmail.mockResolvedValue(undefined);
      preferredAuthMock.getPreferredAuthMethod.mockReturnValue('password');

      renderLoginPage();

      await user.type(screen.getByLabelText('Email'), 'foo@example.com');
      await user.type(screen.getByLabelText('Password'), 'hunter22!');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => expect(authState.loginWithEmail).toHaveBeenCalled());
      expect(preferredAuthMock.setPreferredAuthMethod).not.toHaveBeenCalled();
    });
  });
});
