// SPDX-License-Identifier: BUSL-1.1

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/auth-context';
import { initMonitoring } from './lib/monitoring';
import './theme/tokens.css';
import './styles/responsive.css';

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
    if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
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
const supabaseUrl = authConfig.supabaseUrl;
if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
  void import('./db/sync/replayMutations').then(({ configureSyncEndpoint }) => {
    configureSyncEndpoint({
      baseUrl: `${supabaseUrl}/functions/v1`,
      pushEndpoint: '/sync-push',
      apiKey: authConfig.supabaseAnonKey,
    });
  });
}

initMonitoring();

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider config={authConfig}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
