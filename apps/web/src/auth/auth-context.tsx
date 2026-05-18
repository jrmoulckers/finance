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
}

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
  signupWithEmail: (email: string, password: string) => Promise<void>;
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

  const demoModeActive = isDemoMode(config.supabaseUrl);
  const isAuthenticated = user !== null && hasValidToken();

  // -----------------------------------------------------------------------
  // Initialisation
  // -----------------------------------------------------------------------

  useEffect(() => {
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
      onSessionExpired: () => {
        setUser(null);
        clearTokens();
        config.onUnauthenticated?.();
      },
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
    };
  }, []);

  /**
   * Try to restore an existing session by refreshing the access token
   * via the HttpOnly refresh cookie.
   */
  async function tryRestoreSession(): Promise<void> {
    try {
      const token = await refreshAccessToken();
      if (token) {
        // Decode minimal user info from the token
        const payload = parseTokenPayload(token);
        if (payload) {
          setUser({
            id: payload.sub ?? '',
            email: payload.email ?? '',
            hasPasskey: false, // Will be updated on next profile fetch
          });
        }
      }
    } catch {
      // No valid session — user needs to log in
    } finally {
      setIsLoading(false);
    }
  }

  // -----------------------------------------------------------------------
  // Auth Actions
  // -----------------------------------------------------------------------

  const loginWithEmail = useCallback(
    async (email: string, password: string): Promise<void> => {
      setError(null);
      setIsLoading(true);

      try {
        if (demoModeActive) {
          const result = await demoLogin(email, password);
          setAccessToken(result.accessToken);
          setUser({
            id: result.user.id,
            email: result.user.email,
            hasPasskey: false,
          });
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
        setUser({
          id: data.user.id,
          email: data.user.email,
          hasPasskey: data.user.has_passkey ?? false,
        });
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

  const loginWithPasskey = useCallback(async (email?: string): Promise<void> => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await authenticateWithPasskey(email);

      // The verify step returns a full Supabase session (access_token,
      // refresh_token, user). No separate session-minting call is needed —
      // binding session issuance to the WebAuthn ceremony eliminates the
      // CSRF risk of a detached session endpoint (#1310).
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        setUser({
          id: result.userId,
          email: result.email ?? email ?? '',
          hasPasskey: true,
        });
      } else {
        // Defensive fallback — should not occur with a correctly
        // configured server, but avoids a blank screen if the server
        // response shape changes.
        throw new Error('Passkey verification succeeded but no session token was returned.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey authentication failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const registerNewPasskey = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Must be authenticated to register a passkey.');
      }

      await registerPasskey(token);

      // Update user state to reflect passkey registration
      setUser((prev) => (prev ? { ...prev, hasPasskey: true } : null));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey registration failed';
      setError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      if (!demoModeActive) {
        await revokeRefreshToken(config.logoutEndpoint);
      }
    } catch {
      // Best-effort — clear local state regardless
    } finally {
      clearTokens();
      setUser(null);
      if (demoModeActive) {
        clearDemoSession();
      }
      config.onUnauthenticated?.();
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

    try {
      const token = await refreshAccessToken();
      if (!token) {
        setUser(null);
        config.onUnauthenticated?.();
      }
    } catch {
      setUser(null);
      config.onUnauthenticated?.();
    }
  }, [config, demoModeActive, user?.email]);

  const signupWithEmail = useCallback(
    async (email: string, password: string): Promise<void> => {
      setError(null);
      setIsLoading(true);

      try {
        if (demoModeActive) {
          await demoSignup(email, password);
          // Auto-login after demo signup
          const result = await demoLogin(email, password);
          setAccessToken(result.accessToken);
          setUser({
            id: result.user.id,
            email: result.user.email,
            hasPasskey: false,
          });
          // demoLogin already calls persistDemoSession
          return;
        }

        const endpoint = config.signupEndpoint ?? '/api/auth/signup';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? 'Signup failed');
        }

        // Auto-login: use the same credentials to establish a session
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
          setUser({
            id: data.user.id,
            email: data.user.email,
            hasPasskey: data.user.has_passkey ?? false,
          });
        }
        // If auto-login fails, the signup still succeeded — caller can
        // decide to redirect to login or show a message.
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
        // Redirect to Supabase OAuth flow
        const redirectTo = `${window.location.origin}/dashboard`;
        const oauthUrl = `${config.supabaseUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;
        window.location.href = oauthUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : `OAuth login with ${provider} failed`;
        setError(message);
        setIsLoading(false);
        throw err;
      }
    },
    [config.supabaseUrl, demoModeActive],
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

/**
 * Parse minimal claims from a JWT payload (without verification).
 * Only used to extract user info for the UI — all real validation
 * happens server-side.
 */
function parseTokenPayload(token: string): { sub?: string; email?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json) as { sub?: string; email?: string };
  } catch {
    return null;
  }
}
