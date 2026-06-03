// SPDX-License-Identifier: BUSL-1.1

import { StrictMode } from 'react';
import type { FC, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/auth-context';
import { ErrorBoundary, ToastProvider } from './components/common';
import { ScrollToTop } from './components/navigation/ScrollToTop';
import { DatabaseProvider } from './db/DatabaseProvider';
import { MoneyDisplayProvider } from './lib/display-settings';
import { initMonitoring } from './lib/monitoring';
import './theme/tokens.css';
import './styles/responsive.css';
import './styles/responsive-layout.css';
import './styles/accessibility.css';
import './styles/reduced-motion.css';
import './styles/font-scaling.css';
import './styles/error-boundaries.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure <div id="root"></div> exists in index.html.');
}

// Auth configuration - in production these would come from environment variables
const authConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
  loginEndpoint: import.meta.env.VITE_LOGIN_ENDPOINT ?? '/api/auth/login',
  refreshEndpoint: import.meta.env.VITE_REFRESH_ENDPOINT ?? '/api/auth/refresh',
  logoutEndpoint: import.meta.env.VITE_LOGOUT_ENDPOINT ?? '/api/auth/logout',
  onUnauthenticated: () => {
    // Redirect to login when session expires or user is not authenticated
    const publicAuthPaths = new Set(['/login', '/signup', '/forgot-password', '/reset-password']);
    if (!publicAuthPaths.has(window.location.pathname)) {
      window.location.href = '/login';
    }
  },
};

// Configure the sync endpoint to point at the Supabase Edge Function.
// When VITE_SUPABASE_URL is set to a real project URL, mutations will be
// pushed to the `sync-push` Edge Function.  Otherwise the default
// same-origin /api/sync/push path is used (handy for local dev proxies).
//
// The sync module is loaded lazily via dynamic import() to avoid pulling the
// entire sync module tree (IndexedDB mutation queue, replay logic, conflict
// storage) into the critical startup path.  This prevents the app from
// hanging in environments where those modules' transitive dependencies
// cause issues (e.g. E2E tests under Playwright).
// NOTE: configureSyncEndpoint is only available on branches with #535 sync wiring.
// Skip sync configuration when the function doesn't exist.
const supabaseUrl = authConfig.supabaseUrl;
if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
  void import('./db/sync/replayMutations').then((mod) => {
    if ('configureSyncEndpoint' in mod) {
      (
        mod as {
          configureSyncEndpoint: (cfg: {
            baseUrl: string;
            pushEndpoint: string;
            apiKey: string;
          }) => void;
        }
      ).configureSyncEndpoint({
        baseUrl: `${supabaseUrl}/functions/v1`,
        pushEndpoint: '/sync-push',
        apiKey: authConfig.supabaseAnonKey,
      });
    }
  });
}

initMonitoring();

// ---------------------------------------------------------------------------
// Route-aware database gate
// ---------------------------------------------------------------------------

/**
 * Routes that render without waiting for SQLite-WASM initialisation.
 *
 * Pre-auth pages (login, signup, password reset) never access the database, so gating them
 * behind DatabaseProvider unnecessarily blocks rendering.  On CI especially
 * (headless Chromium + OPFS + WASM fetch), initialisation can exceed 60 s
 * and cause the E2E authenticatedPage fixture to time out before the login
 * form ever appears.
 */
const PRE_AUTH_ROUTES = new Set(['/login', '/signup', '/forgot-password', '/reset-password']);

/**
 * Conditionally wraps children in DatabaseProvider.
 *
 * - On pre-auth routes the children render immediately (no DB wait).
 * - On all other routes the DatabaseProvider loading gate applies, ensuring
 *   the shared SQLite-WASM instance is ready before page components that
 *   depend on `useDatabase()` mount.
 */
const DatabaseGate: FC<{ children: ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();

  if (PRE_AUTH_ROUTES.has(pathname)) {
    return children;
  }

  return <DatabaseProvider>{children}</DatabaseProvider>;
};

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider config={authConfig}>
          <MoneyDisplayProvider>
            <BrowserRouter>
              <ScrollToTop />
              <DatabaseGate>
                <App />
              </DatabaseGate>
            </BrowserRouter>
          </MoneyDisplayProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
