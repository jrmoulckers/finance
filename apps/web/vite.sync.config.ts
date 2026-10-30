// SPDX-License-Identifier: BUSL-1.1

import { mergeConfig } from 'vite';

import appConfig from './vite.config';
import { localSyncEnvironment } from './e2e-sync/environment';

const { supabaseUrl, powerSyncUrl } = localSyncEnvironment();
const powerSyncWebSocket = powerSyncUrl.replace(/^http/, 'ws');

export default mergeConfig(appConfig, {
  // Never pick up a developer's real backend or provider configuration.
  envDir: false,
  base: '/',
  preview: {
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        `connect-src 'self' ${supabaseUrl} ${powerSyncUrl} ${powerSyncWebSocket}`,
        "worker-src 'self' blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    },
  },
});
