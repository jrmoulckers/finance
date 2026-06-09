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

/**
 * Vite plugin that injects a precache manifest into the service worker.
 *
 * During production builds, this plugin collects all generated JS and CSS
 * asset paths from the Rollup bundle and defines `__PRECACHE_MANIFEST__`
 * as a global constant in the service worker entry, enabling offline-first
 * precaching of all route chunks during SW installation.
 */
function swPrecacheManifest(): Plugin {
  return {
    name: 'sw-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Collect all JS and CSS asset paths from the build output
      const assetPaths: string[] = [];
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName === 'sw.js') continue; // Don't precache the SW itself
        if (fileName.endsWith('.js') || fileName.endsWith('.css')) {
          assetPaths.push(`/${fileName}`);
        }
        // Also include CSS assets referenced by chunks
        if (chunk.type === 'chunk' && chunk.viteMetadata?.importedCss) {
          for (const css of chunk.viteMetadata.importedCss) {
            const cssPath = `/${css}`;
            if (!assetPaths.includes(cssPath)) {
              assetPaths.push(cssPath);
            }
          }
        }
      }

      // Inject the manifest into the service worker bundle
      const swEntry = bundle['sw.js'];
      if (swEntry && swEntry.type === 'chunk') {
        const manifest = JSON.stringify(assetPaths);
        swEntry.code = `var __PRECACHE_MANIFEST__ = ${manifest};\n${swEntry.code}`;
      }
    },
  };
}

function allowServiceWorkerRootScope(): Plugin {
  return {
    name: 'allow-service-worker-root-scope',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.includes('/src/sw/service-worker.ts')) {
          res.setHeader('Service-Worker-Allowed', '/');
        }
        next();
      });
    },
  };
}

const functionsProxyTarget = process.env.VITE_FUNCTIONS_PROXY_TARGET ?? 'http://127.0.0.1:54321';
const authProxyTarget =
  process.env.VITE_AUTH_PROXY_TARGET ?? `${functionsProxyTarget}/functions/v1`;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copySqlJsWasm(), swPrecacheManifest(), allowServiceWorkerRootScope()],

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
    // Proxy auth and Edge Function calls to the local Supabase runtime.
    // Same-origin proxying preserves cookie path matching and avoids CORS
    // preflights in dev. Production routes `/functions/v1/*` through Caddy.
    proxy: {
      '/functions/v1': {
        target: functionsProxyTarget,
        changeOrigin: true,
      },
      '/api/auth': {
        target: authProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth\//, '/auth-'),
      },
      '/api/account': {
        target: authProxyTarget,
        changeOrigin: true,
        rewrite: (path) =>
          path
            .replace(/^\/api\/account$/, '/account-delete')
            .replace(/^\/api\/account\/delete-account$/, '/account-delete')
            .replace(/^\/api\/account\//, '/account-'),
      },
      '/api/feedback': {
        target: authProxyTarget,
        changeOrigin: true,
        rewrite: () => '/feedback',
      },
    },
    headers: {
      // Strict CSP - no inline scripts, no eval
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' ws://localhost:*",
        "worker-src 'self' blob:",
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
