// SPDX-License-Identifier: BUSL-1.1

import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      react: resolve(__dirname, '../../node_modules/react'),
      'react-dom': resolve(__dirname, '../../node_modules/react-dom'),
      'react-dom/client': resolve(__dirname, '../../node_modules/react-dom/client'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Cap concurrent worker processes. The merged suite is large and each
    // jsdom worker can grow to the Node heap limit (NODE_OPTIONS
    // --max-old-space-size in CI). Without a cap, a high-core machine/runner
    // spawns enough forks that their combined heap exceeds available RAM and
    // workers are OOM-killed ("Worker exited unexpectedly"). Two forks keeps
    // total memory bounded while still parallelising; CI further parallelises
    // via the 4-way shard matrix.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
        minForks: 1,
      },
    },
  },
});
