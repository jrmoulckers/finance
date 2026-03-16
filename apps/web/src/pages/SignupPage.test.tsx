// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupPage } from './SignupPage';

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

function renderSignupPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  );
}

describe('SignupPage', () => {
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
});
