// SPDX-License-Identifier: BUSL-1.1

/**
 * React Auth Context (#97, #99)
 *
 * Provides authentication state and actions to the React component tree:
 *   - `AuthProvider` — wraps the app and manages login/logout/refresh lifecycle.
 *   - `useAuth()` — hook to access auth state and actions from any component.
 *   - `ProtectedRoute` — wrapper that redirects unauthenticated users.
 *
 * Integrates with:
 *   - `webauthn.ts` for passkey-based authentication
 *   - `token-storage.ts` for secure in-memory token management
 *
 * SECURITY:
 *   - Tokens are NEVER exposed via React state or context values.
 *   - Only boolean `isAuthenticated` and user metadata are shared.
 *   - Token operations go through the token-storage module.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  authenticateWithPasskey,
  initWebAuthn,
  isWebAuthnSupported,
  registerPasskey,
  type WebAuthnConfig,
} from './webauthn';

import {
  clearTokens,
  getAccessToken,
  hasValidToken,
  initTokenManager,
  refreshAccessToken,
  revokeRefreshToken,
  setAccessToken,
} from './token-storage';

import {
  clearDemoSession,
  demoDeleteAccount,
  demoLogin,
  demoRefreshToken,
  demoSignup,
  isDemoMode,
  restoreDemoSession,
} from './demo-auth';
import { getPasskeyErrorMessage } from './passkey-errors';

import {
  incrementLoginCount,
  setHasRegisteredPasskey,
  shouldShowPasskeyPrompt as shouldShowPasskeyPromptLegacy,
} from '../lib/passkey-preferences';
import {
  setPreferredAuthMethod,
  shouldShowPasskeyPrompt as shouldShowPasskeyPromptByPreference,
} from './preferred-auth-method';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal user information exposed to the UI. */
export interface AuthUser {
  /** The user's unique identifier. */
  id: string;
  /** The user's email address. */
  email: string;
  /** Whether the user has a registered passkey. */
  hasPasskey: boolean;
  /**
   * Best-effort display name derived from OAuth claims
   * (`name`, `full_name`, `given_name`, or `user_metadata.full_name`).
   * Empty when no name was supplied (e.g. email/password signup).
   *
   * Issue #1931: never render a raw UUID for a logged-in user.
   */
  name?: string;
}

/** Result of creating a new email/password account. */
export type SignupResult = { kind: 'authenticated' } | { kind: 'confirmation_required' };

/** Actions available through the auth context. */
export interface AuthActions {
  /** Sign in with email and password. */
  loginWithEmail: (email: string, password: string) => Promise<void>;
  /** Sign in with a registered passkey. */
  loginWithPasskey: (email?: string) => Promise<void>;
  /** Sign in with an OAuth provider (opens popup/redirect). */
  loginWithOAuth: (provider: OAuthProvider) => Promise<void>;
  /** Register a new passkey for the current user. */
  registerNewPasskey: () => Promise<void>;
  /** Sign out and clear all tokens. */
  logout: () => Promise<void>;
  /** Permanently delete the account and all local data. */
  deleteAccount: () => Promise<void>;
  /** Manually trigger a token refresh. */
  refresh: () => Promise<void>;
  /** Create a new account with email and password. */
  signupWithEmail: (email: string, password: string) => Promise<SignupResult>;
}

/** Supported OAuth providers. */
export type OAuthProvider = 'google' | 'github' | 'apple';

/** The shape of the auth context value. */
export interface AuthContextValue extends AuthActions {
  /** Whether the user is currently authenticated. */
  isAuthenticated: boolean;
  /** Whether the auth state is still being determined (initial load). */
  isLoading: boolean;
  /** The current authenticated user, or `null`. */
  user: AuthUser | null;
  /** The last authentication error, or `null`. */
  error: string | null;
  /** Whether WebAuthn is supported in the current browser. */
  webAuthnSupported: boolean;
  /** Whether the app is running in demo mode (no backend configured). */
  isDemoMode: boolean;
  /** Whether auth is preserving the last known user while refresh is offline/unreachable. */
  isOffline: boolean;
  /** Whether the passkey setup prompt should be shown. */
  showPasskeyPrompt: boolean;
  /** Dismiss the passkey setup prompt. */
  dismissPasskeyPrompt: () => void;
  /**
   * Whether a sign-out is currently in progress (#1983).
   *
   * Components mounted in the authenticated tree (e.g. the passkey setup
   * prompt) should suppress themselves while this is `true` so that they
   * don't briefly flash during the redirect to `/login`.
   */
  isSigningOut: boolean;
}

/** Configuration for the AuthProvider. */
export interface AuthProviderConfig {
  /** Supabase project URL. */
  supabaseUrl: string;
  /** Supabase anon/public API key. */
  supabaseAnonKey: string;
  /** Backend endpoint for email/password login. */
  loginEndpoint: string;
  /** Backend endpoint for token refresh. */
  refreshEndpoint: string;
  /** Backend endpoint for logout. */
  logoutEndpoint: string;
  /** Backend endpoint for account registration. Defaults to '/api/auth/signup'. */
  signupEndpoint?: string;
  /** Callback when the user should be redirected to login. */
  onUnauthenticated?: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);
const LAST_USER_STORAGE_KEY = 'finance.lastUser';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthProviderProps {
  config: AuthProviderConfig;
  children: ReactNode;
}

/**
 * AuthProvider — manages authentication lifecycle.
 *
 * Wraps the application and provides auth state + actions via context.
 * Initialises the token manager and WebAuthn module on mount.
 *
 * @example
 * ```tsx
 * <AuthProvider config={authConfig}>
 *   <App />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({ config, children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webAuthnSupported] = useState(() => isWebAuthnSupported());
  const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const onlineRetryHandlerRef = useRef<(() => void) | null>(null);
  /**
   * Tracks whether the initial session-restore effect has already run for
   * this provider instance (#1966).  React 19 StrictMode mounts the
   * provider twice in development, which previously fired
   * `tryRestoreSession()` twice and could redirect the user to /login
   * mid-restore via duplicate `handleSessionExpired` calls.
   *
   * `useRef` survives StrictMode's mount → unmount → re-mount cycle
   * because React keeps the underlying fiber's ref object alive across
   * the simulated remount.  Gating the effect body on this ref ensures
   * the auth bootstrap runs exactly once per page load.
   */
  const initStartedRef = useRef(false);

  const demoModeActive = isDemoMode(config.supabaseUrl);
  const isAuthenticated = user !== null && (hasValidToken() || isOffline);

  /** Dismiss the passkey prompt (hides it without changing preferences). */
  const dismissPasskeyPrompt = useCallback(() => {
    setShowPasskeyPrompt(false);
  }, []);

  function rememberUser(nextUser: AuthUser): void {
    setUser(nextUser);
    cacheLastUser(nextUser);
  }

  function handleSessionExpired(): void {
    clearTokens();
    clearCachedUser();
    cancelOnlineRestoreRetry();
    setIsOffline(false);
    setUser(null);
    config.onUnauthenticated?.();
  }

  function scheduleOnlineRestoreRetry(): void {
    if (onlineRetryHandlerRef.current) {
      return;
    }

    const handleOnline = () => {
      cancelOnlineRestoreRetry();
      void tryRestoreSession();
    };

    onlineRetryHandlerRef.current = handleOnline;
    window.addEventListener('online', handleOnline, { once: true });
  }

  function cancelOnlineRestoreRetry(): void {
    if (!onlineRetryHandlerRef.current) {
      return;
    }

    window.removeEventListener('online', onlineRetryHandlerRef.current);
    onlineRetryHandlerRef.current = null;
  }

  // -----------------------------------------------------------------------
  // Initialisation
  // -----------------------------------------------------------------------

  useEffect(() => {
    // StrictMode mounts this effect twice in dev.  The second invocation
    // would re-fire `tryRestoreSession()` and any side-effecting
    // `handleSessionExpired()` calls — including the hard
    // `window.location.href = '/login'` navigation registered by
    // `config.onUnauthenticated`.  Gating on the module-/instance-scoped
    // ref ensures the auth bootstrap runs exactly once per page load
    // (#1966).
    if (initStartedRef.current) {
      return;
    }
    initStartedRef.current = true;

    if (demoModeActive) {
      // In demo mode, skip WebAuthn and use localStorage-based session
      // persistence instead of the HttpOnly cookie refresh flow.
      initTokenManager({
        refreshEndpoint: '',
        onSessionExpired: () => {
          setUser(null);
          clearTokens();
          clearDemoSession();
          config.onUnauthenticated?.();
        },
      });

      // Attempt to restore demo session from localStorage (#1506)
      const savedEmail = restoreDemoSession();
      if (savedEmail) {
        const token = demoRefreshToken(savedEmail);
        if (token) {
          setAccessToken(token);
          const payload = parseTokenPayload(token);
          if (payload) {
            setUser({
              id: payload.sub ?? '',
              email: payload.email ?? '',
              hasPasskey: false,
            });
          }
        }
      }

      setIsLoading(false);
      return;
    }

    // Initialise token manager
    // NOTE: In production (Supabase configured), the backend sets an HttpOnly
    // refresh cookie on login. `tryRestoreSession` calls `executeRefresh()`
    // which posts to the refresh endpoint with credentials: 'include', allowing
    // the browser to send the cookie. This correctly restores the session on
    // page refresh without storing tokens in localStorage.
    initTokenManager({
      refreshEndpoint: config.refreshEndpoint,
      onSessionExpired: handleSessionExpired,
    });

    // Initialise WebAuthn
    const webAuthnConfig: WebAuthnConfig = {
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey,
    };
    initWebAuthn(webAuthnConfig);

    // Attempt to restore session via cookie-based refresh
    void tryRestoreSession();

    // Clear in-memory token on tab close (defence-in-depth)
    const handleBeforeUnload = () => {
      // NOTE: We intentionally do NOT clear tokens here to allow
      // session persistence across page reloads. The HttpOnly cookie
      // handles refresh on next load. The in-memory token is
      // naturally cleared when the JS context is destroyed.
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cancelOnlineRestoreRetry();
    };
  }, []);

  /**
   * Try to restore an existing session by refreshing the access token
   * via the HttpOnly refresh cookie.
   */
  async function tryRestoreSession(): Promise<void> {
    const result = await refreshAccessToken();

    switch (result.kind) {
      case 'success': {
        const restoredUser = userFromToken(result.token) ?? readCachedUser();
        if (restoredUser) {
          rememberUser(restoredUser);
        }
        setIsOffline(false);
        cancelOnlineRestoreRetry();
        break;
      }
      case 'session_expired':
        handleSessionExpired();
        break;
      case 'network_error': {
        const cachedUser = readCachedUser();
        if (cachedUser) {
          setUser((current) => current ?? cachedUser);
          setIsOffline(true);
          scheduleOnlineRestoreRetry();
        } else {
          // No cached user — there is no session to keep alive offline.
          // Treat as session_expired so the app redirects to login instead of
          // leaving the user stranded on a protected route.
          handleSessionExpired();
        }
        break;
      }
    }

    setIsLoading(false);
  }

  // -----------------------------------------------------------------------
  // Auth Actions
  // -----------------------------------------------------------------------

  /**
   * Check whether the passkey setup prompt should appear after login/signup.
   * Increments the login counter and evaluates the prompt state.
   */
  function triggerPasskeyPromptCheck(): void {
    incrementLoginCount();
    // Suppress the prompt when:
    //   - WebAuthn isn't supported, or
    //   - the legacy "show / remind / skip" state says no (back-compat), or
    //   - the user already has a recorded preference, or dismissed within the
    //     30-day cooldown window (#1983).
    if (
      webAuthnSupported &&
      shouldShowPasskeyPromptLegacy() &&
      shouldShowPasskeyPromptByPreference()
    ) {
      setShowPasskeyPrompt(true);
    }
  }

  const loginWithEmail = useCallback(
    async (email: string, password: string): Promise<void> => {
      setError(null);
      setIsLoading(true);

      try {
        if (demoModeActive) {
          const result = await demoLogin(email, password);
          setAccessToken(result.accessToken);
          rememberUser({
            id: result.user.id,
            email: result.user.email,
            hasPasskey: false,
          });
          setIsOffline(false);
          triggerPasskeyPromptCheck();
          return;
        }

        const response = await fetch(config.loginEndpoint, {
          method: 'POST',
          credentials: 'include', // Receive Set-Cookie
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? 'Login failed');
        }

        const data = (await response.json()) as {
          access_token: string;
          user: { id: string; email: string; has_passkey?: boolean };
        };

        setAccessToken(data.access_token);
        rememberUser({
          id: data.user.id,
          email: data.user.email,
          hasPasskey: data.user.has_passkey ?? false,
        });
        setIsOffline(false);
        triggerPasskeyPromptCheck();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [config.loginEndpoint, demoModeActive],
  );

  const loginWithPasskey = useCallback(
    async (email?: string): Promise<void> => {
      setError(null);

      // Hard guard for demo mode (#2011). The initialisation `useEffect`
      // returns early in demo mode and never calls `initWebAuthn()`, so a
      // call into `authenticateWithPasskey` here would throw the cryptic
      // developer-facing "WebAuthn not initialised. Call initWebAuthn()
      // first." error. The UI is supposed to hide passkey controls in demo
      // mode, but defence-in-depth in case some surface forgets.
      if (demoModeActive) {
        const message = 'Passkey sign-in is not available in demo mode.';
        setError(message);
        throw new Error(message);
      }

      setIsLoading(true);

      try {
        const result = await authenticateWithPasskey(email);

        // The verify step returns a full Supabase session (access_token,
        // refresh_token, user). No separate session-minting call is needed —
        // binding session issuance to the WebAuthn ceremony eliminates the
        // CSRF risk of a detached session endpoint (#1310).
        if (result.accessToken) {
          setAccessToken(result.accessToken);
          rememberUser({
            id: result.userId,
            email: result.email ?? email ?? '',
            hasPasskey: true,
          });
          setIsOffline(false);
          // A successful passkey sign-in reaffirms the user's preference
          // (#1983). Idempotent — safe to call on every login.
          setPreferredAuthMethod('passkey');
        } else {
          // Defensive fallback — should not occur with a correctly
          // configured server, but avoids a blank screen if the server
          // response shape changes.
          throw new Error('Passkey verification succeeded but no session token was returned.');
        }
      } catch (err) {
        setError(getPasskeyErrorMessage(err, 'authentication'));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [demoModeActive],
  );

  const registerNewPasskey = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Must be authenticated to register a passkey.');
      }

      await registerPasskey(token);

      // Update user state and localStorage to reflect passkey registration
      setUser((prev) => {
        const nextUser = prev ? { ...prev, hasPasskey: true } : null;
        if (nextUser) {
          cacheLastUser(nextUser);
        }
        return nextUser;
      });
      setHasRegisteredPasskey();
      // Recording a passkey implies the user prefers it as their primary
      // sign-in method (#1983). Idempotent.
      setPreferredAuthMethod('passkey');
      setShowPasskeyPrompt(false);
    } catch (err) {
      setError(getPasskeyErrorMessage(err, 'registration'));
      throw err;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setError(null);
    // Flip the sign-out flag immediately so any mounted authenticated-tree
    // components (e.g. PasskeySetupPrompt) can suppress themselves and avoid
    // flashing as the redirect to /login resolves (#1983).
    setIsSigningOut(true);
    setShowPasskeyPrompt(false);

    try {
      if (!demoModeActive) {
        await revokeRefreshToken(config.logoutEndpoint);
      }
    } catch {
      // Best-effort — clear local state regardless
    } finally {
      clearTokens();
      clearCachedUser();
      cancelOnlineRestoreRetry();
      setIsOffline(false);
      setUser(null);
      if (demoModeActive) {
        clearDemoSession();
      }
      config.onUnauthenticated?.();
      setIsSigningOut(false);
    }
  }, [config, demoModeActive]);

  const deleteAccount = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      if (demoModeActive) {
        // Remove user from demo user store
        if (user?.email) {
          demoDeleteAccount(user.email);
        }
      } else {
        // TODO(#1443): In production, call a backend endpoint to request
        // server-side account deletion (e.g. POST /api/auth/delete-account).
        // For now, we clear local state only.
        await revokeRefreshToken(config.logoutEndpoint);
      }
    } catch {
      // Best-effort — clear local state regardless
    } finally {
      // Clear all local data
      clearTokens();
      localStorage.clear();
      sessionStorage.clear();
      cancelOnlineRestoreRetry();
      setIsOffline(false);
      setUser(null);
      config.onUnauthenticated?.();
    }
  }, [config, demoModeActive, user?.email]);

  const refresh = useCallback(async (): Promise<void> => {
    if (demoModeActive) {
      // In demo mode, generate a fresh token if we have a user
      if (user?.email) {
        const newToken = demoRefreshToken(user.email);
        if (newToken) {
          setAccessToken(newToken);
        }
      }
      return;
    }

    const result = await refreshAccessToken();
    switch (result.kind) {
      case 'success': {
        const refreshedUser = userFromToken(result.token);
        if (refreshedUser) {
          rememberUser(refreshedUser);
        }
        setIsOffline(false);
        cancelOnlineRestoreRetry();
        break;
      }
      case 'session_expired':
        handleSessionExpired();
        break;
      case 'network_error': {
        const cachedUser = readCachedUser();
        if (cachedUser) {
          setUser((current) => current ?? cachedUser);
        }
        setIsOffline(true);
        scheduleOnlineRestoreRetry();
        break;
      }
    }
  }, [demoModeActive, user?.email]);

  const signupWithEmail = useCallback(
    async (email: string, password: string): Promise<SignupResult> => {
      setError(null);
      setIsLoading(true);

      try {
        if (demoModeActive) {
          await demoSignup(email, password);
          // Auto-login after demo signup
          const result = await demoLogin(email, password);
          setAccessToken(result.accessToken);
          rememberUser({
            id: result.user.id,
            email: result.user.email,
            hasPasskey: false,
          });
          setIsOffline(false);
          // demoLogin already calls persistDemoSession
          triggerPasskeyPromptCheck();
          return { kind: 'authenticated' };
        }

        const endpoint = config.signupEndpoint ?? '/api/auth/signup';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          confirmation_required?: boolean;
          error?: string;
          access_token?: string;
          user?: { id: string; email: string; has_passkey?: boolean };
        };

        if (response.status === 202) {
          if (body.confirmation_required) {
            return { kind: 'confirmation_required' };
          }
          throw new Error('Signup requires email confirmation, but the response was invalid.');
        }

        if (!response.ok) {
          throw new Error(body.error ?? 'Signup failed');
        }

        if (response.status === 201 && body.access_token && body.user) {
          setAccessToken(body.access_token);
          rememberUser({
            id: body.user.id,
            email: body.user.email,
            hasPasskey: body.user.has_passkey ?? false,
          });
          setIsOffline(false);
          triggerPasskeyPromptCheck();
          return { kind: 'authenticated' };
        }

        // Auto-login: use the same credentials to establish a session when the
        // signup endpoint does not return a session directly.
        const loginResponse = await fetch(config.loginEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (loginResponse.ok) {
          const data = (await loginResponse.json()) as {
            access_token: string;
            user: { id: string; email: string; has_passkey?: boolean };
          };
          setAccessToken(data.access_token);
          rememberUser({
            id: data.user.id,
            email: data.user.email,
            hasPasskey: data.user.has_passkey ?? false,
          });
          setIsOffline(false);
          triggerPasskeyPromptCheck();
        }
        return { kind: 'authenticated' };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [config.loginEndpoint, config.signupEndpoint, demoModeActive],
  );

  const loginWithOAuth = useCallback(
    async (provider: OAuthProvider): Promise<void> => {
      setError(null);

      if (demoModeActive) {
        setError(`OAuth (${provider}) is not available in demo mode. Use email/password instead.`);
        return;
      }

      setIsLoading(true);

      try {
        // Drive OAuth through our Edge Function (#1886). The function
        // generates PKCE + state in HttpOnly cookies, redirects to
        // Supabase, and on return sets the refresh cookie at
        // Path=/api/auth before bouncing to /dashboard.
        const params = new URLSearchParams({
          provider,
          redirect_to: '/dashboard',
        });
        window.location.href = `/api/auth/oauth-start?${params.toString()}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : `OAuth login with ${provider} failed`;
        setError(message);
        setIsLoading(false);
        throw err;
      }
    },
    [demoModeActive],
  );

  // -----------------------------------------------------------------------
  // Context Value (memoised to prevent unnecessary re-renders)
  // -----------------------------------------------------------------------

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      user,
      error,
      webAuthnSupported,
      isDemoMode: demoModeActive,
      isOffline,
      showPasskeyPrompt,
      dismissPasskeyPrompt,
      isSigningOut,
      loginWithEmail,
      loginWithPasskey,
      loginWithOAuth,
      registerNewPasskey,
      logout,
      deleteAccount,
      refresh,
      signupWithEmail,
    }),
    [
      isAuthenticated,
      isLoading,
      user,
      error,
      webAuthnSupported,
      demoModeActive,
      isOffline,
      showPasskeyPrompt,
      dismissPasskeyPrompt,
      isSigningOut,
      loginWithEmail,
      loginWithPasskey,
      loginWithOAuth,
      registerNewPasskey,
      logout,
      deleteAccount,
      refresh,
      signupWithEmail,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the auth context from any component inside an `AuthProvider`.
 *
 * @returns The current auth state and actions.
 * @throws If used outside of an `AuthProvider`.
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { user, isAuthenticated, logout } = useAuth();
 *
 *   if (!isAuthenticated) return <LoginPage />;
 *
 *   return (
 *     <main>
 *       <p>Welcome, {user?.email}</p>
 *       <button onClick={logout}>Sign Out</button>
 *     </main>
 *   );
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Protected Route Wrapper
// ---------------------------------------------------------------------------

interface ProtectedRouteProps {
  /** Content to render when authenticated. */
  children: ReactNode;
  /** Content to render while checking authentication (optional). */
  fallback?: ReactNode;
  /** Callback invoked when the user is not authenticated (e.g. redirect). */
  onUnauthenticated?: () => void;
}

/**
 * ProtectedRoute — renders children only when authenticated.
 *
 * While auth state is loading, renders the `fallback` (or nothing).
 * When the user is not authenticated, calls `onUnauthenticated` and
 * renders nothing.
 *
 * @example
 * ```tsx
 * <ProtectedRoute
 *   fallback={<LoadingSpinner />}
 *   onUnauthenticated={() => navigate('/login')}
 * >
 *   <DashboardPage />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
  children,
  fallback = null,
  onUnauthenticated,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      onUnauthenticated?.();
    }
  }, [isAuthenticated, isLoading, onUnauthenticated]);

  if (isLoading) {
    return <>{fallback}</>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cacheLastUser(nextUser: AuthUser): void {
  try {
    localStorage.setItem(LAST_USER_STORAGE_KEY, JSON.stringify(nextUser));
  } catch {
    // Best-effort only; auth cookies remain the source of truth.
  }
}

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string') {
      return null;
    }

    const user: AuthUser = {
      id: parsed.id,
      email: parsed.email,
      hasPasskey: parsed.hasPasskey === true,
    };
    if (typeof parsed.name === 'string' && parsed.name.trim().length > 0) {
      user.name = parsed.name.trim();
    }
    return user;
  } catch {
    return null;
  }
}

function clearCachedUser(): void {
  try {
    localStorage.removeItem(LAST_USER_STORAGE_KEY);
  } catch {
    // Best-effort only.
  }
}

function userFromToken(token: string): AuthUser | null {
  const payload = parseTokenPayload(token);
  if (!payload || (!payload.sub && !payload.email)) {
    return null;
  }

  const cachedUser = readCachedUser();
  const name = pickDisplayName(payload);
  const user: AuthUser = {
    id: payload.sub ?? cachedUser?.id ?? '',
    email: payload.email ?? cachedUser?.email ?? '',
    hasPasskey: cachedUser?.hasPasskey ?? false,
  };
  if (name) {
    user.name = name;
  } else if (cachedUser?.name) {
    user.name = cachedUser.name;
  }
  return user;
}

/**
 * Pick the best human-readable display name from JWT claims.
 *
 * Supabase / OAuth providers expose the name under any of:
 *   - `name`              (Google OIDC standard)
 *   - `full_name`         (Supabase user_metadata projection)
 *   - `user_metadata.full_name` / `user_metadata.name`
 *   - first + last combined
 *
 * We return `undefined` if none is available so callers can fall back
 * to email.
 *
 * Issue #1931.
 */
function pickDisplayName(payload: TokenPayload): string | undefined {
  const candidates: Array<string | undefined> = [
    payload.name,
    payload.full_name,
    payload.user_metadata?.full_name,
    payload.user_metadata?.name,
  ];

  const first = payload.given_name ?? payload.user_metadata?.given_name;
  const last = payload.family_name ?? payload.user_metadata?.family_name;
  if (first || last) {
    candidates.push([first, last].filter(Boolean).join(' '));
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

interface TokenPayload {
  sub?: string;
  email?: string;
  name?: string;
  full_name?: string;
  given_name?: string;
  family_name?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
  };
}

/**
 * Parse minimal claims from a JWT payload (without verification).
 * Only used to extract user info for the UI — all real validation
 * happens server-side.
 */
function parseTokenPayload(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}
