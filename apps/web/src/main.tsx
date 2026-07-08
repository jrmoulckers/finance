// SPDX-License-Identifier: BUSL-1.1

import { StrictMode } from 'react';
import type { FC, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocation } from 'react-router-dom';
import { App } from './App';
import { AppBrowserRouter } from './AppBrowserRouter';
import { AuthProvider } from './auth/auth-context';
import { PRE_AUTH_ROUTE_SET, isUnauthenticatedSafeRoute } from './lib/auth/pre-auth-routes';
import { ErrorBoundary, ToastProvider, UpdateBanner } from './components/common';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import { NavigationGuard, ScrollToTop } from './components/navigation';
import { DatabaseProvider } from './db/DatabaseProvider';
import { applyStoredFontScalePreference } from './hooks/useFontScale';
import { applyStoredReducedMotionPreference } from './hooks/useReducedMotion';
import { applyStoredDisplayDensityPreference, applyStoredThemePreference } from './hooks/useTheme';
import { MoneyDisplayProvider } from './lib/display-settings';
import { applyStoredSimplifiedModePreference } from './lib/accessibility-preferences';
import { migrateLegacyDisplayCurrencyPreference } from './lib/display-currency';
import { initMonitoring } from './lib/monitoring';
import {
  isViteDevServer,
  registerAppServiceWorker,
  unregisterDevServiceWorkers,
} from './sw/register';
import './theme/tokens.css';
import './styles/responsive.css';
import './styles/responsive-layout.css';
import './styles/navigation-chrome.css';
import './styles/danger-zone.css';
import './styles/accessibility.css';
import './styles/reduced-motion.css';
import './styles/font-scaling.css';
import './styles/error-boundaries.css';
import './styles/density.css';
import './styles/microinteractions.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure <div id="root"></div> exists in index.html.');
}

applyStoredThemePreference();
applyStoredDisplayDensityPreference();
applyStoredFontScalePreference();
applyStoredReducedMotionPreference();
applyStoredSimplifiedModePreference();

// Fold any legacy per-widget display-currency copy into the single shared
// preference before React mounts, so every surface reads one source of truth (#3291).
migrateLegacyDisplayCurrencyPreference();

function requiredProductionEnv(name: string): never {
  throw new Error(`${name} is required for production builds`);
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  ? import.meta.env.VITE_SUPABASE_URL.trim()
  : import.meta.env.PROD
    ? requiredProductionEnv('VITE_SUPABASE_URL')
    : 'https://placeholder.supabase.co';

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
  : import.meta.env.PROD
    ? requiredProductionEnv('VITE_SUPABASE_ANON_KEY')
    : 'placeholder-anon-key';

const authConfig = {
  supabaseUrl,
  supabaseAnonKey,
  loginEndpoint: import.meta.env.VITE_LOGIN_ENDPOINT ?? '/api/auth/login',
  refreshEndpoint: import.meta.env.VITE_REFRESH_ENDPOINT ?? '/api/auth/refresh',
  logoutEndpoint: import.meta.env.VITE_LOGOUT_ENDPOINT ?? '/api/auth/logout',
  betaAllowedEmails: import.meta.env.VITE_BETA_ALLOWED_EMAILS,
  onUnauthenticated: () => {
    // Keep Lighthouse on the measured URL; the anonymous login shell does not need a refresh redirect.
    if (isLighthouseAudit()) {
      return;
    }
    // Redirect to login when the session expires or the user is not
    // authenticated — UNLESS they are on a route that is valid while logged out
    // (pre-auth pages or the first-run /onboarding flow). Without the
    // `/onboarding` exemption this fights App.tsx's onboarding auto-launch and
    // produces an infinite full-page reload loop (#3059).
    if (!isUnauthenticatedSafeRoute(window.location.pathname)) {
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
if (
  authConfig.supabaseUrl &&
  !authConfig.supabaseUrl.includes('placeholder') &&
  !isLighthouseAudit()
) {
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
        baseUrl: `${authConfig.supabaseUrl}/functions/v1`,
        pushEndpoint: '/sync-push',
        apiKey: authConfig.supabaseAnonKey,
      });
    }
  });
}

initMonitoring();

// ---------------------------------------------------------------------------
// Service worker registration
// ---------------------------------------------------------------------------
//
// Registered at boot (NOT inside the authenticated layout) so the SW is
// active on ALL pages, including the anonymous `/login` and `/signup`
// routes.  Chromium's PWA installability heuristic only credits the
// install icon when the page that hosts the manifest link is controlled
// by a SW with a `fetch` handler (#1965).
function isLighthouseAudit(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.location.search.includes('lhci=1') ||
      (typeof navigator !== 'undefined' && /\bLighthouse\b/i.test(navigator.userAgent)))
  );
}

if (typeof window !== 'undefined' && !isLighthouseAudit()) {
  if (isViteDevServer()) {
    // The Vite dev server must never be controlled by a service worker: its
    // production caching fights HMR / dependency re-optimization and triggers
    // an infinite full-page reload loop (the page "flashes", #3064). Proactively
    // tear down any worker left behind by a prior production build so the dev
    // session recovers without a manual "Unregister" in DevTools.
    void unregisterDevServiceWorkers();
  } else if (document.readyState === 'complete') {
    // Wait for the load event so the SW install doesn't compete with
    // critical app-shell rendering.  No await — registration is best-effort.
    void registerAppServiceWorker();
  } else {
    window.addEventListener('load', () => void registerAppServiceWorker(), { once: true });
  }
}

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

  if (PRE_AUTH_ROUTE_SET.has(pathname)) {
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
            <AccessibilityProvider>
              <AppBrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
                <NavigationGuard>
                  <ScrollToTop />
                  <UpdateBanner />
                  <DatabaseGate>
                    <App />
                  </DatabaseGate>
                </NavigationGuard>
              </AppBrowserRouter>
            </AccessibilityProvider>
          </MoneyDisplayProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
