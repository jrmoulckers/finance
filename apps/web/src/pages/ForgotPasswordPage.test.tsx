// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordPage } from './ForgotPasswordPage';

function renderForgotPasswordPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the email form and sign-in link', () => {
    renderForgotPasswordPage();

    expect(screen.getByRole('heading', { name: 'Finance' })).toBeInTheDocument();
    expect(screen.getByText('Reset your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('requests a reset email with an absolute reset redirect URL', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    renderForgotPasswordPage();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' alex@example.com ' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/request-password-reset',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'alex@example.com',
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      }),
    );
    expect(
      await screen.findByText(
        "If an account exists for that email, you'll receive a reset link shortly.",
      ),
    ).toBeInTheDocument();
  });

  it('does not call the backend for an invalid email', async () => {
    renderForgotPasswordPage();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a non-account-specific error when the request fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Could not send reset email.' }), { status: 502 }),
    );
    renderForgotPasswordPage();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not send reset email.');
    });
  });
});
