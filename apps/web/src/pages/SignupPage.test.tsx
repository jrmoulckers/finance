// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupPage } from './SignupPage';

const navigateMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  loginWithPasskey: vi.fn(),
  signupWithEmail: vi.fn(),
  isAuthenticated: false,
  isLoading: false,
  error: null as string | null,
  user: null,
  webAuthnSupported: true,
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
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
    target: { value: 'password123' },
  });
  fireEvent.change(screen.getByLabelText('Confirm Password'), {
    target: { value: 'password123' },
  });
}

describe('SignupPage', () => {
  beforeEach(() => {
    authState.loginWithEmail.mockReset();
    authState.loginWithPasskey.mockReset();
    authState.signupWithEmail.mockReset();
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.error = null;
    authState.user = null;
    authState.webAuthnSupported = true;
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

  it('shows link to login page', () => {
    renderSignupPage();

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('shows error when passwords do not match', () => {
    renderSignupPage();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'different123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
  });

  // ── Submission ────────────────────────────────────────────────────────────

  it('calls signupWithEmail with trimmed email and password on valid submission', async () => {
    authState.signupWithEmail.mockResolvedValue(undefined);
    renderSignupPage();
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    expect(authState.signupWithEmail).toHaveBeenCalledOnce();
    expect(authState.signupWithEmail).toHaveBeenCalledWith('alex@example.com', 'password123');
  });

  it('shows success message after successful signup', async () => {
    authState.signupWithEmail.mockResolvedValue(undefined);
    renderSignupPage();
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Account created! Please sign in.')).toBeInTheDocument();
    });
  });

  it('redirects to /login after 2 seconds on successful signup', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    authState.signupWithEmail.mockResolvedValue(undefined);
    renderSignupPage();
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    });

    // Success message is visible; redirect has not fired yet.
    expect(screen.getByText('Account created! Please sign in.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();

    // Advance the 2-second redirect timer.
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(navigateMock).toHaveBeenCalledWith('/login');

    vi.useRealTimers();
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
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(
      await screen.findByText('Account creation is not yet available. Please check back soon.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeEnabled();

    authState.signupWithEmail = original;
  });
});
