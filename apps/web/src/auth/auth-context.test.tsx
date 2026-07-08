// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthProvider,
  SERVICE_UNAVAILABLE_MESSAGE,
  OAUTH_PROVIDER_UNAVAILABLE_MESSAGE,
  isBetaEmailAllowed,
  isNetworkError,
  isOAuthStartHealthy,
  isServiceUnavailableStatus,
  oauthProviderUnavailableMessage,
  parseBetaAllowedEmails,
  useAuth,
  type AuthProviderConfig,
} from './auth-context';
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

describe('beta email allowlist', () => {
  it('allows everyone when the allowlist is empty or unset', () => {
    expect(isBetaEmailAllowed('anyone@example.com', parseBetaAllowedEmails(undefined))).toBe(true);
    expect(isBetaEmailAllowed('anyone@example.com', parseBetaAllowedEmails(''))).toBe(true);
    expect(isBetaEmailAllowed('anyone@example.com', parseBetaAllowedEmails(' ,  '))).toBe(true);
  });

  it('matches allowlisted emails case-insensitively and trims whitespace', () => {
    const allowlist = parseBetaAllowedEmails(' beta@example.com, Friend@Example.com ');

    expect(isBetaEmailAllowed('BETA@example.com', allowlist)).toBe(true);
    expect(isBetaEmailAllowed('friend@example.com ', allowlist)).toBe(true);
  });

  it('denies emails that are not allowlisted', () => {
    const allowlist = parseBetaAllowedEmails('beta@example.com');

    expect(isBetaEmailAllowed('outsider@example.com', allowlist)).toBe(false);
    expect(isBetaEmailAllowed(undefined, allowlist)).toBe(false);
  });
});

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
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokens();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  function renderProvider(configOverrides: Partial<AuthProviderConfig> = {}) {
    return render(
      <AuthProvider config={{ ...config, ...configOverrides }}>
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

  it('shows the beta access required screen when a restored user is not allowlisted', async () => {
    const token = makeToken({
      sub: 'user-2',
      email: 'outsider@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: token, expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    renderProvider({ betaAllowedEmails: 'beta@example.com' });

    expect(
      await screen.findByRole('heading', { name: 'Beta access required' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('outsider@example.com');
    expect(screen.queryByTestId('auth-state')).not.toBeInTheDocument();
    expect(localStorage.getItem(LAST_USER_STORAGE_KEY)).toBeNull();
    expect(onUnauthenticated).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ credentials: 'include' }),
    );
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

  it('skips the refresh probe on a pre-auth-safe route when no session is cached (#3211)', async () => {
    // On a logged-out-safe route (e.g. /login) with no cached user there is no
    // session to restore, so the bootstrap must NOT fire POST /api/auth/refresh.
    // That request is a guaranteed 401 and only adds console noise + a wasted
    // round-trip on every unauthenticated page load.
    window.history.pushState({}, '', '/login');
    expect(localStorage.getItem(LAST_USER_STORAGE_KEY)).toBeNull();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('user-email')).toHaveTextContent('none');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('still restores a cached session on a pre-auth-safe route (#3211)', async () => {
    // A previously-authenticated user (cached user present) who lands on /login
    // must still be restored so the app can route them onward — the pre-auth
    // route skip only applies when there is no cached session.
    window.history.pushState({}, '', '/login');
    localStorage.setItem(
      LAST_USER_STORAGE_KEY,
      JSON.stringify({ id: 'cached-1', email: 'cached@example.com', hasPasskey: true }),
    );
    const token = makeToken({
      sub: 'cached-1',
      email: 'cached@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: token, expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-email')).toHaveTextContent('cached@example.com');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(onUnauthenticated).not.toHaveBeenCalled();
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

describe('backend-unreachable classification helpers', () => {
  it('treats gateway/5xx and opaque (0) statuses as service-unavailable', () => {
    expect(isServiceUnavailableStatus(0)).toBe(true);
    expect(isServiceUnavailableStatus(500)).toBe(true);
    expect(isServiceUnavailableStatus(502)).toBe(true);
    expect(isServiceUnavailableStatus(503)).toBe(true);
    expect(isServiceUnavailableStatus(504)).toBe(true);
  });

  it('does not treat client (4xx) or success statuses as service-unavailable', () => {
    expect(isServiceUnavailableStatus(200)).toBe(false);
    expect(isServiceUnavailableStatus(400)).toBe(false);
    expect(isServiceUnavailableStatus(401)).toBe(false);
    expect(isServiceUnavailableStatus(409)).toBe(false);
    expect(isServiceUnavailableStatus(429)).toBe(false);
  });

  it('recognises fetch network rejections', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource'))).toBe(
      true,
    );
    expect(isNetworkError(new Error('Load failed'))).toBe(true);
    expect(isNetworkError(new Error('The network connection was lost'))).toBe(true);
  });

  it('does not misclassify ordinary errors as network errors', () => {
    expect(isNetworkError(new Error('Incorrect password.'))).toBe(false);
    expect(isNetworkError(new Error('Beta access required'))).toBe(false);
    expect(isNetworkError('oops')).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe('signup & login surface a clear message when the backend is unreachable (#3066)', () => {
  const config: AuthProviderConfig = {
    supabaseUrl: 'https://finance-test.supabase.co',
    supabaseAnonKey: 'anon-key',
    loginEndpoint: '/api/auth/login',
    refreshEndpoint: '/api/auth/refresh',
    logoutEndpoint: '/api/auth/logout',
    signupEndpoint: '/api/auth/signup',
  };

  beforeEach(() => {
    clearTokens();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokens();
    localStorage.clear();
  });

  /** Probe that exposes the email signup/login actions plus the error state. */
  function ActionProbe() {
    const { signupWithEmail, loginWithEmail, isLoading, error } = useAuth();
    return (
      <div>
        <span data-testid="loading-state">{isLoading ? 'loading' : 'ready'}</span>
        <span data-testid="auth-error">{error ?? 'none'}</span>
        <button
          data-testid="do-signup"
          onClick={() => {
            void signupWithEmail('new@example.com', 'longenoughpassword').catch(() => {});
          }}
        >
          signup
        </button>
        <button
          data-testid="do-login"
          onClick={() => {
            void loginWithEmail('user@example.com', 'longenoughpassword').catch(() => {});
          }}
        >
          login
        </button>
      </div>
    );
  }

  /**
   * Builds a fetch mock where the initial session-restore refresh returns
   * 401 (anonymous) and the auth action under test resolves/rejects per
   * `authResponse`.
   */
  function stubFetch(matchPath: string, authResponse: () => Promise<Response>) {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(matchPath)) {
        return authResponse();
      }
      // Initial mount refresh and anything else: no session.
      return Promise.resolve(jsonResponse({ error: 'no session' }, 401));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function renderReady() {
    render(
      <AuthProvider config={config}>
        <ActionProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('ready'));
  }

  it('shows the service-unavailable message when signup returns a 502', async () => {
    stubFetch('/api/auth/signup', () =>
      Promise.resolve(new Response('', { status: 502, statusText: 'Bad Gateway' })),
    );
    await renderReady();

    fireEvent.click(screen.getByTestId('do-signup'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent(SERVICE_UNAVAILABLE_MESSAGE),
    );
  });

  it('shows the service-unavailable message when signup fetch rejects (network down)', async () => {
    stubFetch('/api/auth/signup', () => Promise.reject(new TypeError('Failed to fetch')));
    await renderReady();

    fireEvent.click(screen.getByTestId('do-signup'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent(SERVICE_UNAVAILABLE_MESSAGE),
    );
  });

  it('shows the service-unavailable message when login returns a 502', async () => {
    stubFetch('/api/auth/login', () =>
      Promise.resolve(new Response('', { status: 502, statusText: 'Bad Gateway' })),
    );
    await renderReady();

    fireEvent.click(screen.getByTestId('do-login'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent(SERVICE_UNAVAILABLE_MESSAGE),
    );
  });

  it('still shows the specific 4xx error message for a real client error', async () => {
    stubFetch('/api/auth/login', () =>
      Promise.resolve(jsonResponse({ error: 'Invalid login credentials' }, 400)),
    );
    await renderReady();

    fireEvent.click(screen.getByTestId('do-login'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent('Invalid login credentials'),
    );
  });

  it('keeps a prior error visible while a retry request is in flight (#3192)', async () => {
    // The login endpoint fails the first time (surfacing an error) and then
    // hangs on the retry so we can observe state while the request is pending.
    let loginAttempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/login')) {
        loginAttempts += 1;
        if (loginAttempts === 1) {
          return Promise.resolve(jsonResponse({ error: 'Invalid login credentials' }, 400));
        }
        // Second attempt never resolves: the request stays in flight.
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(jsonResponse({ error: 'no session' }, 401));
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderReady();

    // First attempt fails and the banner appears.
    fireEvent.click(screen.getByTestId('do-login'));
    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent('Invalid login credentials'),
    );

    // Retry: the request is in flight (loading) and the prior error is NOT
    // eagerly cleared — it must stay put until the new result resolves (#3192).
    fireEvent.click(screen.getByTestId('do-login'));
    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('loading'));
    expect(screen.getByTestId('auth-error')).toHaveTextContent('Invalid login credentials');
  });
});

describe('isOAuthStartHealthy', () => {
  function fakeResponse(init: { type?: string; redirected?: boolean; status: number }): Response {
    return init as unknown as Response;
  }

  it('accepts an opaque-redirect from a healthy redirect:manual probe', () => {
    expect(isOAuthStartHealthy(fakeResponse({ type: 'opaqueredirect', status: 0 }))).toBe(true);
  });

  it('accepts an explicit 3xx redirect', () => {
    expect(isOAuthStartHealthy(fakeResponse({ type: 'default', status: 302 }))).toBe(true);
    expect(
      isOAuthStartHealthy(fakeResponse({ type: 'default', redirected: true, status: 200 })),
    ).toBe(true);
  });

  it('rejects 5xx/502/0 outages and 4xx provider errors', () => {
    expect(isOAuthStartHealthy(fakeResponse({ type: 'default', status: 502 }))).toBe(false);
    expect(isOAuthStartHealthy(fakeResponse({ type: 'default', status: 500 }))).toBe(false);
    expect(isOAuthStartHealthy(fakeResponse({ type: 'default', status: 0 }))).toBe(false);
    expect(isOAuthStartHealthy(fakeResponse({ type: 'default', status: 400 }))).toBe(false);
  });
});

describe('oauthProviderUnavailableMessage (#3187)', () => {
  it('names each supported provider in the friendly message', () => {
    expect(oauthProviderUnavailableMessage('google')).toContain('Google sign-in');
    expect(oauthProviderUnavailableMessage('github')).toContain('GitHub sign-in');
    expect(oauthProviderUnavailableMessage('apple')).toContain('Apple sign-in');
    expect(oauthProviderUnavailableMessage('azure')).toContain('Microsoft sign-in');
  });

  it('always points the user at the email & password fallback', () => {
    for (const provider of ['google', 'github', 'apple', 'azure'] as const) {
      expect(oauthProviderUnavailableMessage(provider)).toContain('email & password');
    }
  });

  it('never leaks the raw GoTrue "provider is not enabled" string', () => {
    for (const provider of ['google', 'github', 'apple', 'azure'] as const) {
      expect(oauthProviderUnavailableMessage(provider)).not.toContain('provider is not enabled');
      expect(oauthProviderUnavailableMessage(provider)).not.toContain('validation_failed');
    }
  });

  it('is more specific than the generic fallback constant', () => {
    // The generic constant remains exported for callers that cannot resolve a
    // provider; the per-provider message is distinct and names the provider.
    expect(oauthProviderUnavailableMessage('google')).not.toBe(OAUTH_PROVIDER_UNAVAILABLE_MESSAGE);
  });
});

describe('loginWithOAuth keeps users in-app on a failed start (#3109)', () => {
  const config: AuthProviderConfig = {
    supabaseUrl: 'https://finance-test.supabase.co',
    supabaseAnonKey: 'anon-key',
    loginEndpoint: '/api/auth/login',
    refreshEndpoint: '/api/auth/refresh',
    logoutEndpoint: '/api/auth/logout',
    signupEndpoint: '/api/auth/signup',
  };

  let assignMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearTokens();
    localStorage.clear();
    assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { assign: assignMock, href: 'http://localhost/login' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokens();
    localStorage.clear();
  });

  function OAuthProbe() {
    const { loginWithOAuth, isLoading, error } = useAuth();
    return (
      <div>
        <span data-testid="loading-state">{isLoading ? 'loading' : 'ready'}</span>
        <span data-testid="auth-error">{error ?? 'none'}</span>
        <button
          data-testid="do-oauth"
          onClick={() => {
            void loginWithOAuth('google').catch(() => {});
          }}
        >
          google
        </button>
      </div>
    );
  }

  function stubStart(startResponse: () => Promise<Response>) {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/oauth-start')) {
        return startResponse();
      }
      return Promise.resolve(jsonResponse({ error: 'no session' }, 401));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function renderReady() {
    render(
      <AuthProvider config={config}>
        <OAuthProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('ready'));
  }

  it('navigates to oauth-start only after a healthy pre-flight', async () => {
    stubStart(() => Promise.resolve(new Response(null, { status: 302 })));
    await renderReady();

    fireEvent.click(screen.getByTestId('do-oauth'));

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/oauth-start?provider=google'),
      ),
    );
    expect(screen.getByTestId('auth-error')).toHaveTextContent('none');
  });

  it('keeps the user in-app with an inline error when start returns 502', async () => {
    stubStart(() => Promise.resolve(new Response('', { status: 502, statusText: 'Bad Gateway' })));
    await renderReady();

    fireEvent.click(screen.getByTestId('do-oauth'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent(SERVICE_UNAVAILABLE_MESSAGE),
    );
    expect(assignMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
  });

  it('keeps the user in-app with an inline error when the probe fetch rejects', async () => {
    stubStart(() => Promise.reject(new TypeError('Failed to fetch')));
    await renderReady();

    fireEvent.click(screen.getByTestId('do-oauth'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent(SERVICE_UNAVAILABLE_MESSAGE),
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('shows the provider-named unavailable message when start is 4xx (not configured)', async () => {
    stubStart(() => Promise.resolve(jsonResponse({ error: 'Unsupported provider' }, 400)));
    await renderReady();

    fireEvent.click(screen.getByTestId('do-oauth'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent(
        oauthProviderUnavailableMessage('google'),
      ),
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('degrades gracefully in-app when a supported-but-disabled provider is rejected (#3188)', async () => {
    // A statically-supported provider that GoTrue has NOT enabled now answers
    // the pre-flight probe with a 400 (auth-oauth-start gates on the provider
    // actually being enabled). The probe is non-healthy, so we keep the user
    // in-app with the graceful, provider-named "option unavailable" message
    // (#3187) and never hand off to a raw GoTrue "provider is not enabled"
    // page.
    stubStart(() => Promise.resolve(jsonResponse({ error: 'Provider not enabled' }, 400)));
    await renderReady();

    fireEvent.click(screen.getByTestId('do-oauth'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent(
        oauthProviderUnavailableMessage('google'),
      ),
    );
    expect(assignMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
  });
});
