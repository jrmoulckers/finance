// SPDX-License-Identifier: BUSL-1.1

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Vite plugin that copies sql.js WASM binaries to the public assets directory.
 *
 * sql.js uses `locateFile` to fetch its WASM binary at runtime via a network
 * request. The binary must be served as a static asset at the path specified
 * in `initIndexedDbBackend()` (`/assets/sql-wasm/<file>`).
 *
 * The browser build of sql.js (used by Vite's pre-bundler) requests
 * `sql-wasm-browser.wasm`, while the generic build requests `sql-wasm.wasm`.
 * We copy both to handle either resolution path.
 */
function copySqlJsWasm(): Plugin {
  const srcDir = resolve(__dirname, '../../node_modules/sql.js/dist');
  const destDir = resolve(__dirname, 'public/assets/sql-wasm');
  const wasmFiles = ['sql-wasm.wasm', 'sql-wasm-browser.wasm'];

  return {
    name: 'copy-sql-js-wasm',
    buildStart() {
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      for (const file of wasmFiles) {
        const src = resolve(srcDir, file);
        const dest = resolve(destDir, file);
        if (existsSync(src) && !existsSync(dest)) {
          copyFileSync(src, dest);
        }
      }
      if (!wasmFiles.some((f) => existsSync(resolve(srcDir, f)))) {
        this.warn('sql.js WASM binaries not found — IndexedDB fallback will fail at runtime.');
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copySqlJsWasm()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      react: resolve(__dirname, '../../node_modules/react'),
      'react-dom': resolve(__dirname, '../../node_modules/react-dom'),
      'react-dom/client': resolve(__dirname, '../../node_modules/react-dom/client'),
    },
  },

  build: {
    outDir: 'dist',
    // Security (#783): Disable source maps in production builds.
    // Source maps expose the full source code structure, including
    // security-relevant implementation details (auth flows, API
    // endpoints, encryption logic). Use 'hidden' during a transition
    // period if you need maps for error-reporting services (e.g.
    // Sentry) without serving them publicly.
    sourcemap: false,
    // Target modern browsers for smaller output
    target: 'es2022',
    // Chunk size warning at 250KB (aligned with budget.json)
    chunkSizeWarningLimit: 250,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sw: resolve(__dirname, 'src/sw/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          // React core (react + react-dom + react-router-dom)
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router-dom') ||
            id.includes('node_modules/react/')
          ) {
            return 'vendor-react';
          }

          // Charting libraries (recharts + d3)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
            return 'vendor-charts';
          }

          // SQLite WASM (wa-sqlite + sql.js)
          if (id.includes('node_modules/wa-sqlite') || id.includes('node_modules/sql.js')) {
            return 'vendor-sqlite';
          }

          // Validation (zod)
          if (id.includes('node_modules/zod')) {
            return 'vendor-zod';
          }
        },
      },
    },
  },

  server: {
    port: 5173,
    strictPort: false,
    headers: {
      // Strict CSP - no inline scripts, no eval
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' ws://localhost:*",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Allow service worker registered from /src/sw/ to control the entire app
      'Service-Worker-Allowed': '/',
    },
  },
});
