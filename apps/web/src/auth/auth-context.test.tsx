// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth, type AuthProviderConfig } from './auth-context';
import { clearTokens } from './token-storage';

const LAST_USER_STORAGE_KEY = 'finance.lastUser';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeToken(payload: Record<string, unknown>): string {
  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url(payload)}.signature`;
}

function AuthProbe() {
  const { isAuthenticated, isLoading, isOffline, user } = useAuth();
  return (
    <div>
      <span data-testid="loading-state">{isLoading ? 'loading' : 'ready'}</span>
      <span data-testid="auth-state">{isAuthenticated ? 'authenticated' : 'anonymous'}</span>
      <span data-testid="offline-state">{isOffline ? 'offline' : 'online'}</span>
      <span data-testid="user-email">{user?.email ?? 'none'}</span>
    </div>
  );
}

describe('AuthProvider refresh restoration', () => {
  const onUnauthenticated = vi.fn();
  const config: AuthProviderConfig = {
    supabaseUrl: 'https://finance-test.supabase.co',
    supabaseAnonKey: 'anon-key',
    loginEndpoint: '/api/auth/login',
    refreshEndpoint: '/api/auth/refresh',
    logoutEndpoint: '/api/auth/logout',
    signupEndpoint: '/api/auth/signup',
    onUnauthenticated,
  };

  beforeEach(() => {
    clearTokens();
    localStorage.clear();
    onUnauthenticated.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokens();
    localStorage.clear();
  });

  function renderProvider() {
    return render(
      <AuthProvider config={config}>
        <AuthProbe />
      </AuthProvider>,
    );
  }

  it('restores and caches the user on successful refresh', async () => {
    const token = makeToken({
      sub: 'user-1',
      email: 'fresh@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ access_token: token, expires_in: 3600 })),
    );

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('offline-state')).toHaveTextContent('online');
    expect(screen.getByTestId('user-email')).toHaveTextContent('fresh@example.com');
    expect(JSON.parse(localStorage.getItem(LAST_USER_STORAGE_KEY) ?? '{}')).toMatchObject({
      id: 'user-1',
      email: 'fresh@example.com',
    });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('clears the cached user and signs out on session_expired refresh', async () => {
    localStorage.setItem(
      LAST_USER_STORAGE_KEY,
      JSON.stringify({ id: 'cached-1', email: 'cached@example.com', hasPasskey: true }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'expired' }, 401)));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('user-email')).toHaveTextContent('none');
    expect(localStorage.getItem(LAST_USER_STORAGE_KEY)).toBeNull();
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('keeps the cached user offline and retries refresh when the browser comes online', async () => {
    localStorage.setItem(
      LAST_USER_STORAGE_KEY,
      JSON.stringify({ id: 'cached-1', email: 'cached@example.com', hasPasskey: true }),
    );
    const retryToken = makeToken({
      sub: 'cached-1',
      email: 'cached@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ access_token: retryToken, expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('offline-state')).toHaveTextContent('offline');
    expect(screen.getByTestId('user-email')).toHaveTextContent('cached@example.com');
    expect(onUnauthenticated).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(screen.getByTestId('offline-state')).toHaveTextContent('online'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
  });

  it('redirects to login when network refresh fails and no cached user exists', async () => {
    expect(localStorage.getItem(LAST_USER_STORAGE_KEY)).toBeNull();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('offline-state')).toHaveTextContent('online');
    expect(screen.getByTestId('user-email')).toHaveTextContent('none');
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('runs session restore exactly once under React StrictMode (#1966 regression)', async () => {
    // StrictMode mounts the provider twice in development.  Before
    // #1966 hardening this fired `tryRestoreSession()` twice (and
    // `handleSessionExpired()` twice when the refresh failed), which
    // could race the redirect-to-login flow against a still-pending
    // refresh.  The useRef guard now ensures the bootstrap runs once.
    const token = makeToken({
      sub: 'user-strict',
      email: 'strict@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: token, expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);

    const { StrictMode } = await import('react');

    render(
      <StrictMode>
        <AuthProvider config={config}>
          <AuthProbe />
        </AuthProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-email')).toHaveTextContent('strict@example.com');

    // Exactly one /api/auth/refresh call even though StrictMode mounted
    // the provider twice.  Multiple calls would indicate the useRef guard
    // is broken.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});
