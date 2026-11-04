// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordPage } from './ForgotPasswordPage';

vi.mock('../auth/auth-context', () => ({
  useOptionalAuth: () => ({ isDemoMode: true }),
}));

describe('ForgotPasswordPage in demo mode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('is honest that no reset email can be sent and makes no request', () => {
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Demo Mode\. No backend configured/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(screen.getByText(/can't be sent in demo mode/)).toBeInTheDocument();
    expect(screen.queryByText(/you'll receive a reset link/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
