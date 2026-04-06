// SPDX-License-Identifier: BUSL-1.1

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/auth-context';
import { DatabaseProvider } from './db/DatabaseProvider';
import { configureSyncEndpoint } from './db/sync';
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
const supabaseUrl = authConfig.supabaseUrl;
if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
  configureSyncEndpoint({
    baseUrl: `${supabaseUrl}/functions/v1`,
    pushEndpoint: '/sync-push',
    apiKey: authConfig.supabaseAnonKey,
  });
}

initMonitoring();

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider config={authConfig}>
      <DatabaseProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DatabaseProvider>
    </AuthProvider>
  </StrictMode>,
);
