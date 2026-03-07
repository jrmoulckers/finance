/**
 * Secure Token Storage (#99)
 *
 * Handles access and refresh tokens with defence-in-depth:
 *
 *   1. **HttpOnly + Secure + SameSite cookies** — The backend sets tokens via
 *      `Set-Cookie` headers. The client NEVER reads or writes token cookies
 *      directly. This protects against XSS token exfiltration.
 *
 *   2. **In-memory fallback** — The current access token is held in a
 *      module-scoped variable (closure) so it can be attached to API requests.
 *      It is NEVER persisted to localStorage, sessionStorage, or IndexedDB.
 *
 *   3. **Auto-refresh** — When the access token is within 2 minutes of expiry,
 *      a proactive refresh is triggered so requests never use an expired token.
 *
 * SECURITY INVARIANTS:
 *   - Tokens are NEVER stored in localStorage or sessionStorage.
 *   - Tokens are NEVER written to IndexedDB or any web-accessible storage.
 *   - Cookie-based tokens rely on the backend setting HttpOnly flags.
 *   - The in-memory token is cleared on logout and tab close.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Decoded JWT payload (minimal fields we inspect). */
interface JwtPayload {
  exp?: number;
  sub?: string;
  iat?: number;
}

/** Configuration for the token manager. */
export interface TokenManagerConfig {
  /**
   * Backend endpoint that accepts a refresh token (via cookie) and returns
   * a new access token in the response body + sets a new refresh cookie.
   */
  refreshEndpoint: string;

  /**
   * Called when a refresh attempt fails (e.g. refresh token expired).
   * The application should redirect to the login page.
   */
  onSessionExpired: () => void;
}

/** Shape of the refresh endpoint response. */
interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

// ---------------------------------------------------------------------------
// Module State (in-memory only — never persisted)
// ---------------------------------------------------------------------------

/** The current access token. Lives only in JS heap memory. */
let accessToken: string | null = null;

/** The token’s expiry time in milliseconds since epoch. */
let tokenExpiresAt = 0;

/** Timer handle for proactive refresh. */
let refreshTimerId: ReturnType<typeof setTimeout> | null = null;

/** Whether a refresh request is currently in-flight. */
let isRefreshing = false;

/** Queued callers waiting for a refresh to complete. */
let refreshSubscribers: Array<(token: string | null) => void> = [];

/** Module configuration. */
let managerConfig: TokenManagerConfig | null = null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum remaining lifetime (in ms) before a proactive refresh is triggered.
 * Set to 2 minutes as specified in the requirements.
 */
const REFRESH_THRESHOLD_MS = 2 * 60 * 1000;

/**
 * Safety margin subtracted from the scheduled refresh time to account for
 * clock skew and network latency.
 */
const REFRESH_SAFETY_MARGIN_MS = 10 * 1000;

// ---------------------------------------------------------------------------
// JWT Helpers (decode only — NEVER verify on the client)
// ---------------------------------------------------------------------------

/**
 * Decode a JWT payload without verification.
 *
 * Client-side JWTs are verified by the backend. We only decode to read
 * the expiry time for scheduling proactive refresh.
 */
function decodeJwtPayload(token: string): JwtPayload {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {};
    }

    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    );
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Refresh Logic
// ---------------------------------------------------------------------------

/**
 * Notify all queued subscribers after a refresh completes (or fails).
 */
function notifyRefreshSubscribers(token: string | null): void {
  const subscribers = refreshSubscribers;
  refreshSubscribers = [];
  for (const callback of subscribers) {
    callback(token);
  }
}

/**
 * Perform the token refresh by calling the backend refresh endpoint.
 *
 * The backend is expected to:
 *   1. Read the refresh token from the HttpOnly cookie.
 *   2. Validate it and issue a new access token.
 *   3. Set a new HttpOnly refresh cookie.
 *   4. Return `{ access_token, expires_in }` in the response body.
 */
async function executeRefresh(): Promise<string | null> {
  if (!managerConfig) {
    return null;
  }

  try {
    const response = await fetch(managerConfig.refreshEndpoint, {
      method: 'POST',
      credentials: 'include', // Sends HttpOnly cookies
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Refresh failed — session is expired
      clearTokens();
      managerConfig.onSessionExpired();
      return null;
    }

    const data = (await response.json()) as RefreshResponse;
    setAccessToken(data.access_token);
    return data.access_token;
  } catch {
    // Network error — don't clear tokens, retry will happen
    return null;
  }
}

/**
 * Schedule a proactive token refresh before the current token expires.
 */
function scheduleRefresh(): void {
  if (refreshTimerId !== null) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }

  if (!accessToken || tokenExpiresAt === 0) {
    return;
  }

  const now = Date.now();
  const timeUntilExpiry = tokenExpiresAt - now;
  const refreshIn = Math.max(
    timeUntilExpiry - REFRESH_THRESHOLD_MS - REFRESH_SAFETY_MARGIN_MS,
    0,
  );

  refreshTimerId = setTimeout(() => {
    void refreshAccessToken();
  }, refreshIn);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the token manager.
 *
 * Must be called once during app bootstrap (e.g. in the AuthProvider).
 *
 * @param config Token manager configuration.
 */
export function initTokenManager(config: TokenManagerConfig): void {
  managerConfig = config;
}

/**
 * Store a new access token in memory and schedule its refresh.
 *
 * This is called after a successful login or token refresh.
 * The token is stored ONLY in memory — never persisted.
 *
 * @param token The JWT access token.
 */
export function setAccessToken(token: string): void {
  accessToken = token;

  const payload = decodeJwtPayload(token);
  if (payload.exp) {
    tokenExpiresAt = payload.exp * 1000; // Convert seconds to ms
  } else {
    // If no exp claim, assume 1 hour
    tokenExpiresAt = Date.now() + 60 * 60 * 1000;
  }

  scheduleRefresh();
}

/**
 * Get the current access token.
 *
 * If the token is expired or within the refresh threshold, a refresh
 * is triggered automatically. Callers can `await` to get a fresh token.
 *
 * @returns The current valid access token, or `null` if not authenticated.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!accessToken) {
    return null;
  }

  const now = Date.now();
  const timeUntilExpiry = tokenExpiresAt - now;

  // Token is still valid and not near expiry
  if (timeUntilExpiry > REFRESH_THRESHOLD_MS) {
    return accessToken;
  }

  // Token is near expiry or expired — refresh
  return refreshAccessToken();
}

/**
 * Get the current access token synchronously (without triggering refresh).
 *
 * Use this when you need the token immediately and can tolerate it being
 * near expiry. The proactive refresh timer will handle renewal.
 *
 * @returns The current access token or `null`.
 */
export function getAccessTokenSync(): string | null {
  return accessToken;
}

/**
 * Refresh the access token.
 *
 * Deduplicates concurrent refresh requests — if a refresh is already
 * in-flight, subsequent callers wait for the same result.
 *
 * @returns The new access token, or `null` if refresh failed.
 */
export async function refreshAccessToken(): Promise<string | null> {
  // If already refreshing, queue this caller
  if (isRefreshing) {
    return new Promise<string | null>((resolve) => {
      refreshSubscribers.push(resolve);
    });
  }

  isRefreshing = true;

  try {
    const newToken = await executeRefresh();
    notifyRefreshSubscribers(newToken);
    return newToken;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Clear all in-memory tokens and cancel scheduled refreshes.
 *
 * Called on logout or when the session expires.
 */
export function clearTokens(): void {
  accessToken = null;
  tokenExpiresAt = 0;

  if (refreshTimerId !== null) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }

  refreshSubscribers = [];
}

/**
 * Check whether the user currently has a valid (non-expired) access token.
 *
 * @returns `true` if an access token exists and is not expired.
 */
export function hasValidToken(): boolean {
  return accessToken !== null && Date.now() < tokenExpiresAt;
}

/**
 * Get the remaining time until the access token expires.
 *
 * @returns Milliseconds until expiry, or 0 if no token / already expired.
 */
export function getTokenTimeRemaining(): number {
  if (!accessToken) return 0;
  return Math.max(tokenExpiresAt - Date.now(), 0);
}

/**
 * Invalidate the server-side refresh token by calling the logout endpoint.
 *
 * The backend should:
 *   1. Clear the HttpOnly refresh cookie.
 *   2. Invalidate the refresh token in the database.
 *
 * @param logoutEndpoint The backend logout URL.
 */
export async function revokeRefreshToken(
  logoutEndpoint: string,
): Promise<void> {
  try {
    await fetch(logoutEndpoint, {
      method: 'POST',
      credentials: 'include', // Send the HttpOnly cookie for server-side invalidation
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch {
    // Best-effort — token will expire naturally
  } finally {
    clearTokens();
  }
}
