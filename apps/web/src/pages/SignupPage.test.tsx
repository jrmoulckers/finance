// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupPage } from './SignupPage';

const navigateMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  loginWithPasskey: vi.fn(),
  loginWithOAuth: vi.fn(),
  signupWithEmail: vi.fn(),
  isAuthenticated: false,
  isLoading: false,
  error: null as string | null,
  user: null,
  webAuthnSupported: true,
  webAuthnReady: true,
  isDemoMode: false,
  isOffline: false,
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderSignupPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  );
}

/** Fill in the signup form with valid data. */
function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'alex@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'strongpass1234' },
  });
  fireEvent.change(screen.getByLabelText('Confirm Password'), {
    target: { value: 'strongpass1234' },
  });
}

describe('SignupPage', () => {
  beforeEach(() => {
    authState.loginWithEmail.mockReset();
    authState.loginWithPasskey.mockReset();
    authState.loginWithOAuth.mockReset();
    authState.signupWithEmail.mockReset();
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.error = null;
    authState.user = null;
    authState.webAuthnSupported = true;
    authState.webAuthnReady = true;
    authState.isDemoMode = false;
    navigateMock.mockReset();
  });

  // ── Render ────────────────────────────────────────────────────────────────

  it('renders email, password, confirm password fields', () => {
    renderSignupPage();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('renders sign up button', () => {
    renderSignupPage();

    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument();
  });

  it('reveals the password via the show-password toggle', () => {
    renderSignupPage();

    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    // Password + confirm each render their own toggle; the first controls the
    // password field.
    fireEvent.click(screen.getAllByRole('button', { name: 'Show password' })[0]);
    expect(password).toHaveAttribute('type', 'text');
  });

  it('marks the email field as mobile-friendly (no auto-capitalize/correct)', () => {
    renderSignupPage();

    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('autocapitalize', 'none');
    expect(email).toHaveAttribute('autocorrect', 'off');
    expect(email).toHaveAttribute('inputmode', 'email');
  });

  it('shows link to login page', () => {
    renderSignupPage();

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('shows error when passwords do not match', () => {
    renderSignupPage();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'strongpass1234' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'different12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
  });

  // ── Submission ────────────────────────────────────────────────────────────

  it('calls signupWithEmail with trimmed email and password on valid submission', async () => {
    authState.signupWithEmail.mockResolvedValue({ kind: 'authenticated' });
    renderSignupPage();
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    expect(authState.signupWithEmail).toHaveBeenCalledOnce();
    expect(authState.signupWithEmail).toHaveBeenCalledWith('alex@example.com', 'strongpass1234');
  });

  it('redirects to /dashboard when isAuthenticated becomes true after signup', async () => {
    authState.signupWithEmail.mockImplementation(() => {
      authState.isAuthenticated = true;
      return Promise.resolve({ kind: 'authenticated' });
    });
    renderSignupPage();
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    // The component re-renders with isAuthenticated = true and navigates.
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('shows confirmation-required UI and can resend confirmation email', async () => {
    authState.signupWithEmail.mockResolvedValue({ kind: 'confirmation_required' });
    renderSignupPage();
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend confirmation email' }));
    });

    expect(authState.signupWithEmail).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Confirmation email sent again.')).toBeInTheDocument();
  });

  it('shows error banner when signup fails', async () => {
    authState.signupWithEmail.mockRejectedValue(new Error('Email already in use'));
    renderSignupPage();
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Email already in use')).toBeInTheDocument();
    });
  });

  it('shows generic error message when signup rejects with a non-Error value', async () => {
    authState.signupWithEmail.mockRejectedValue('oops');
    renderSignupPage();
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Registration failed.')).toBeInTheDocument();
    });
  });

  it('does not call signupWithEmail when form is invalid', async () => {
    renderSignupPage();

    // Submit without filling any fields.
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(authState.signupWithEmail).not.toHaveBeenCalled();
  });

  it('shows an availability message when signupWithEmail is not available', async () => {
    const original = authState.signupWithEmail;
    (authState as Record<string, unknown>).signupWithEmail = undefined;

    renderSignupPage();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'strongpass1234' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'strongpass1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(
      await screen.findByText('Account creation is not yet available. Please check back soon.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeEnabled();

    authState.signupWithEmail = original;
  });

  // ── OAuth parity (#3707) ────────────────────────────────────────────────────

  it('renders social sign-up buttons at parity with login', () => {
    renderSignupPage();

    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up with GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up with Microsoft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up with Apple' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Social signup options' })).toBeInTheDocument();
  });

  it('calls loginWithOAuth with the chosen provider', () => {
    renderSignupPage();

    fireEvent.click(screen.getByRole('button', { name: 'Sign up with Google' }));

    expect(authState.loginWithOAuth).toHaveBeenCalledWith('google');
  });

  // ── Legal transparency (#3643) ──────────────────────────────────────────────

  it('surfaces Terms and Privacy links on the signup form', () => {
    renderSignupPage();

    // Agreement line near the submit button links to the existing legal routes.
    const termsLinks = screen.getAllByRole('link', { name: 'Terms' });
    expect(termsLinks.some((link) => link.getAttribute('href') === '/legal/terms')).toBe(true);
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
    // LegalLinks footer parity with Login.
    expect(screen.getByRole('navigation', { name: 'Legal links' })).toBeInTheDocument();
  });

  // ── Autofocus (#3656) ───────────────────────────────────────────────────────

  it('autofocuses the email field on mount', async () => {
    renderSignupPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toHaveFocus();
    });
  });

  // ── Weak-password soft-gate (#3679) ─────────────────────────────────────────

  it('blocks submission of a common password and focuses the password field', async () => {
    renderSignupPage();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } });
    // A recognizably common password from the shared blocklist (score 0).
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    expect(authState.signupWithEmail).not.toHaveBeenCalled();
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('too common');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  // ── Confirmation panel focus management (#3702) ─────────────────────────────

  it('moves focus to the confirmation heading after a confirmation-required signup', async () => {
    authState.signupWithEmail.mockResolvedValue({ kind: 'confirmation_required' });
    renderSignupPage();
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    const heading = await screen.findByRole('heading', { name: 'Check your email' });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
  });
});
