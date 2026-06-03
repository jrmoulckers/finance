// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordPage } from './ResetPasswordPage';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderResetPasswordPage(
  initialEntry = '/reset-password#access_token=recovery-token&type=recovery',
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    navigateMock.mockReset();
  });

  it('renders password fields and recovery link', () => {
    renderResetPasswordPage();

    expect(screen.getByText('Choose a new password')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request password reset' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('updates the password using the recovery access token and redirects to login', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    renderResetPasswordPage('/reset-password#type=recovery&access_token=recovery-token');

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'newStrongPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'newStrongPass123' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: 'recovery-token', password: 'newStrongPass123' }),
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith('/login', {
      replace: true,
      state: { message: 'Password updated. Sign in with your new password.' },
    });
  });

  it('validates matching passwords before calling the backend', async () => {
    renderResetPasswordPage();

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'newStrongPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'differentPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an error when the recovery token is missing', async () => {
    renderResetPasswordPage('/reset-password');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reset link is invalid or expired. Request a new password reset link.',
    );
    expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
  });

  it('shows backend reset errors', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Reset link is invalid or expired.' }), { status: 400 }),
    );
    renderResetPasswordPage();

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'newStrongPass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'newStrongPass123' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Reset link is invalid or expired.');
    });
  });
});
