// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

const navigateMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  loginWithPasskey: vi.fn(),
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
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.error = null;
    authState.user = null;
    authState.webAuthnSupported = true;
    navigateMock.mockReset();
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

  it('shows passkey button when webAuthn supported', () => {
    authState.webAuthnSupported = true;

    renderLoginPage();

    expect(screen.getByRole('button', { name: /sign in with passkey/i })).toBeInTheDocument();
  });

  it('disables submit while loading', () => {
    authState.isLoading = true;

    renderLoginPage();

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });
});
