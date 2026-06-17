// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveIdleSessionPolicy } from '../lib/session-security';
import { saveAppLockSettings } from '../lib/security/app-lock-settings';
import { SessionSecurityBoundary } from './SessionSecurityBoundary';

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isDemoMode: false,
  logout: vi.fn(),
  user: { id: 'user-1', email: 'user@example.com', hasPasskey: false } as {
    id: string;
    email: string;
    hasPasskey: boolean;
  } | null,
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => authState,
}));

describe('SessionSecurityBoundary app lock integration', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    authState.isAuthenticated = true;
    authState.isDemoMode = false;
    authState.logout.mockReset();
    authState.user = { id: 'user-1', email: 'user@example.com', hasPasskey: false };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows a privacy-safe locked shell on authenticated app load when app lock is enabled', () => {
    enableAppLock();

    renderBoundary();

    expect(screen.getByRole('heading', { name: 'Finance is locked' })).toBeInTheDocument();
    expect(screen.queryByTestId('sensitive-finance-data')).not.toBeInTheDocument();
  });

  it('locks again instead of logging out after the configured idle timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T12:00:00Z'));
    enableAppLock();
    renderBoundary();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue with current session' }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('sensitive-finance-data')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole('heading', { name: 'Finance is locked' })).toBeInTheDocument();
    expect(screen.queryByTestId('sensitive-finance-data')).not.toBeInTheDocument();
    expect(authState.logout).not.toHaveBeenCalled();
  });

  it('unlocks with a passkey challenge when the authenticated user has a passkey', async () => {
    enableAppLock();
    authState.user = { id: 'user-1', email: 'user@example.com', hasPasskey: true };
    const credential = { type: 'public-key', rawId: new ArrayBuffer(1) } as PublicKeyCredential;
    const credentialsGet = vi.fn().mockResolvedValue(credential);
    Object.defineProperty(window.navigator, 'credentials', {
      configurable: true,
      value: { get: credentialsGet },
    });
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});

    renderBoundary();

    fireEvent.click(screen.getByRole('button', { name: 'Unlock with passkey' }));

    await waitFor(() => expect(screen.getByTestId('sensitive-finance-data')).toBeInTheDocument());
    expect(credentialsGet).toHaveBeenCalledWith(
      expect.objectContaining({
        mediation: 'optional',
        publicKey: expect.objectContaining({ userVerification: 'required' }),
      }),
    );
  });
});

function enableAppLock(): void {
  saveIdleSessionPolicy({ timeoutMs: 60_000, warningMs: 10_000, lockBehavior: 'logout' });
  saveAppLockSettings({ enabled: true, idleTimeoutMs: 60_000, requirePasskey: true });
}

function renderBoundary() {
  return render(
    <SessionSecurityBoundary>
      <div data-testid="sensitive-finance-data">Balance $123.45</div>
    </SessionSecurityBoundary>,
  );
}
