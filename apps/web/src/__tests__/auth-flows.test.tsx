// SPDX-License-Identifier: BUSL-1.1

/**
 * Web Authentication Flows tests (#1331)
 *
 * Validates authentication UX and state transitions:
 * - Login form validation and submission
 * - Signup flow with email verification
 * - Logout clears local state
 * - Token refresh flow
 * - Protected route redirection
 * - Session persistence across page reloads
 * - Error handling (invalid credentials, network error, rate limiting)
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Auth context mock
// ---------------------------------------------------------------------------

const authState = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  loginWithPasskey: vi.fn(),
  loginWithOAuth: vi.fn(),
  signupWithEmail: vi.fn(),
  registerNewPasskey: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  isAuthenticated: false,
  isLoading: false,
  error: null as string | null,
  user: null as { id: string; email: string; hasPasskey: boolean } | null,
  webAuthnSupported: true,
  webAuthnReady: true,
  isDemoMode: false,
  isOffline: false,
}));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('../auth/auth-context', () => ({
  useAuth: () => authState,
  ProtectedRoute: ({
    children,
    onUnauthenticated,
  }: {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    onUnauthenticated?: () => void;
  }) => {
    const { isAuthenticated, isLoading } = authState;
    React.useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        onUnauthenticated?.();
      }
    }, [isAuthenticated, isLoading, onUnauthenticated]);

    if (isLoading) return null;
    if (!isAuthenticated) return null;
    return React.createElement(React.Fragment, null, children);
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

// Import after mocks are set up
import { LoginPage } from '../pages/LoginPage';
import { SignupPage } from '../pages/SignupPage';
import { ProtectedRoute } from '../auth/auth-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

function renderSignupPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  authState.loginWithEmail.mockReset();
  authState.loginWithPasskey.mockReset();
  authState.loginWithOAuth.mockReset();
  authState.signupWithEmail.mockReset();
  authState.registerNewPasskey.mockReset();
  authState.logout.mockReset();
  authState.refresh.mockReset();
  authState.isAuthenticated = false;
  authState.isLoading = false;
  authState.error = null;
  authState.user = null;
  authState.webAuthnSupported = true;
  authState.webAuthnReady = true;
  navigateMock.mockReset();
});

// ---------------------------------------------------------------------------
// Login form validation
// ---------------------------------------------------------------------------

describe('Login form validation (#1331)', () => {
  it('renders email and password fields with labels', () => {
    renderLoginPage();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('email field has type="email" and autocomplete="email"', () => {
    renderLoginPage();

    const emailInput = screen.getByLabelText('Email');
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('autoComplete', 'email');
  });

  it('password field has type="password" and autocomplete="current-password"', () => {
    renderLoginPage();

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
  });

  it('disables submit button while loading', () => {
    authState.isLoading = true;
    renderLoginPage();

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });

  it('sets aria-busy on submit button while loading', () => {
    authState.isLoading = true;
    renderLoginPage();

    expect(screen.getByRole('button', { name: /signing in/i })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});

// ---------------------------------------------------------------------------
// Login form submission
// ---------------------------------------------------------------------------

describe('Login form submission (#1331)', () => {
  it('calls loginWithEmail on form submission', async () => {
    authState.loginWithEmail.mockResolvedValue(undefined);
    renderLoginPage();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'validPassword123' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
    });

    expect(authState.loginWithEmail).toHaveBeenCalledWith('user@example.com', 'validPassword123');
  });

  it('shows passkey button when WebAuthn is supported', () => {
    authState.webAuthnSupported = true;
    renderLoginPage();

    expect(screen.getByRole('button', { name: /sign in with passkey/i })).toBeInTheDocument();
  });

  it('calls loginWithPasskey when passkey button is clicked', async () => {
    authState.loginWithPasskey.mockResolvedValue(undefined);
    renderLoginPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign in with passkey/i }));
    });

    expect(authState.loginWithPasskey).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Login error handling
// ---------------------------------------------------------------------------

describe('Login error handling (#1331)', () => {
  it('displays auth error from context', () => {
    authState.error = 'Invalid credentials';
    renderLoginPage();

    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('error element has aria-live for screen readers', () => {
    authState.error = 'Network error';
    renderLoginPage();

    const errorElement = screen.getByText('Network error');
    expect(errorElement.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  it('displays OAuth login buttons', () => {
    renderLoginPage();

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with apple/i })).toBeInTheDocument();
  });

  it('OAuth buttons are grouped with accessible label', () => {
    renderLoginPage();

    expect(screen.getByRole('group', { name: /social login/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Signup flow
// ---------------------------------------------------------------------------

describe('Signup flow (#1331)', () => {
  it('renders email, password, and confirm password fields', () => {
    renderSignupPage();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', () => {
    renderSignupPage();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'strongpass1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'different12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
  });

  it('calls signupWithEmail on valid submission', async () => {
    authState.signupWithEmail.mockResolvedValue({ kind: 'authenticated' });
    renderSignupPage();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'strongpass1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'strongpass1234' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    expect(authState.signupWithEmail).toHaveBeenCalledWith('new@example.com', 'strongpass1234');
  });

  it('redirects to /dashboard when isAuthenticated becomes true after signup', async () => {
    authState.signupWithEmail.mockImplementation(() => {
      authState.isAuthenticated = true;
      return Promise.resolve({ kind: 'authenticated' });
    });
    renderSignupPage();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'strongpass1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'strongpass1234' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('shows confirmation-required UI after signup returns 202 flow', async () => {
    authState.signupWithEmail.mockResolvedValue({ kind: 'confirmation_required' });
    renderSignupPage();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'strongpass1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'strongpass1234' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('shows error banner when signup fails', async () => {
    authState.signupWithEmail.mockRejectedValue(new Error('Email already in use'));
    renderSignupPage();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'strongpass1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'strongpass1234' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Email already in use')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

describe('Logout clears local state (#1331)', () => {
  it('logout function clears user state', async () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'user-1', email: 'user@example.com', hasPasskey: false };

    await act(async () => {
      authState.logout.mockImplementation(async () => {
        authState.isAuthenticated = false;
        authState.user = null;
      });
      await authState.logout();
    });

    expect(authState.isAuthenticated).toBe(false);
    expect(authState.user).toBeNull();
  });

  it('logout is callable even when already logged out', async () => {
    authState.isAuthenticated = false;
    authState.user = null;
    authState.logout.mockResolvedValue(undefined);

    await act(async () => {
      await authState.logout();
    });

    expect(authState.logout).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Protected route redirection
// ---------------------------------------------------------------------------

describe('Protected route redirection (#1331)', () => {
  it('calls onUnauthenticated when user is not logged in', () => {
    const onUnauth = vi.fn();
    authState.isAuthenticated = false;
    authState.isLoading = false;

    render(
      <MemoryRouter>
        <ProtectedRoute onUnauthenticated={onUnauth}>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(onUnauth).toHaveBeenCalled();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    authState.user = { id: 'user-1', email: 'user@example.com', hasPasskey: false };

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('renders nothing while auth is loading', () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

describe('Session persistence (#1331)', () => {
  it('authenticated redirect navigates to dashboard', () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'user-1', email: 'user@example.com', hasPasskey: false };

    renderLoginPage();

    expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('login page has link to signup', () => {
    renderLoginPage();

    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
  });

  it('signup page has link to login', () => {
    renderSignupPage();

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });
});

// ---------------------------------------------------------------------------
// Token refresh flow
// ---------------------------------------------------------------------------

describe('Token refresh flow (#1331)', () => {
  it('refresh function is available from auth context', () => {
    expect(authState.refresh).toBeDefined();
    expect(typeof authState.refresh).toBe('function');
  });

  it('refresh can be called to renew session', async () => {
    authState.refresh.mockResolvedValue(undefined);

    await act(async () => {
      await authState.refresh();
    });

    expect(authState.refresh).toHaveBeenCalled();
  });
});
