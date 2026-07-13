// SPDX-License-Identifier: BUSL-1.1

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type Connect, type Plugin, type ResolvedConfig } from 'vite';

import { getRouteChunkName } from './src/lib/perf/route-chunks';
import { applyBaseToWebManifest, type WebManifest } from './src/lib/pwa/manifest-base';

/**
 * Vite plugin that generates the design-token CSS before the dev server or a
 * production build starts.
 *
 * `src/theme/tokens.css` `@import`s four generated stylesheets from
 * `packages/design-tokens/build/web/`. Those files are produced by Style
 * Dictionary (`npm run build:tokens`) and are gitignored, so a fresh clone — or
 * a tree after `npm run clean` — has none, and Vite's PostCSS aborts with
 * `ENOENT ... tokens.css`. This plugin runs the generator at `buildStart` when
 * the outputs are missing or older than their token sources, making `vite`,
 * `vite build`, and Storybook clone-to-run with no manual token build.
 */
function ensureDesignTokens(): Plugin {
  const tokensRoot = resolve(__dirname, '../../packages/design-tokens');
  const configScript = resolve(tokensRoot, 'config/style-dictionary.config.mjs');
  const sourceDir = resolve(tokensRoot, 'tokens');
  const outputs = [
    'tokens.css',
    'tokens-dark.css',
    'tokens-dark-oled.css',
    'tokens-high-contrast.css',
  ].map((file) => resolve(tokensRoot, 'build/web', file));

  const mtimeOf = (path: string): number => {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return 0;
    }
  };

  const tokensNeedBuild = (): boolean => {
    // Any missing output forces a (re)generation.
    if (outputs.some((path) => !existsSync(path))) return true;
    // Otherwise regenerate only when a token source or the generator config is
    // newer than the oldest generated output, so editing a token and restarting
    // the dev server picks up the change.
    const sourceFiles = readdirSync(sourceDir, { recursive: true }).map((rel) =>
      resolve(sourceDir, rel.toString()),
    );
    const newestSource = [configScript, ...sourceFiles].reduce(
      (newest, path) => Math.max(newest, mtimeOf(path)),
      0,
    );
    const oldestOutput = outputs.reduce(
      (oldest, path) => Math.min(oldest, mtimeOf(path)),
      Infinity,
    );
    return newestSource > oldestOutput;
  };

  return {
    name: 'ensure-design-tokens',
    // Generate before any CSS module is transformed so the @imports resolve.
    enforce: 'pre',
    buildStart() {
      if (!existsSync(configScript)) {
        this.warn('design-tokens generator not found — skipping token generation.');
        return;
      }
      if (!tokensNeedBuild()) return;
      const result = spawnSync(process.execPath, [configScript], {
        cwd: tokensRoot,
        stdio: 'inherit',
      });
      if (result.status !== 0) {
        this.error(
          'Failed to generate design tokens (packages/design-tokens). ' +
            'Run `npm run build:tokens` and retry.',
        );
      }
    },
  };
}

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
function normalizeServiceWorkerBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === '/' || trimmed === '.' || trimmed === './') {
    return '/';
  }

  let pathname = trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    pathname = new URL(trimmed).pathname;
  }

  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function withServiceWorkerBasePath(basePath: string, fileName: string): string {
  return `${basePath}${fileName.replace(/^\/+/, '')}`;
}

function swPrecacheManifest(): Plugin {
  let resolvedBasePath = '/';

  return {
    name: 'sw-precache-manifest',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      resolvedBasePath = normalizeServiceWorkerBasePath(config.base);
    },
    generateBundle(_options, bundle) {
      // Collect all JS and CSS asset paths from the build output
      const assetPaths: string[] = [];
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName === 'sw.js') continue; // Don't precache the SW itself
        if (fileName.endsWith('.js') || fileName.endsWith('.css')) {
          assetPaths.push(withServiceWorkerBasePath(resolvedBasePath, fileName));
        }
        // Also include CSS assets referenced by chunks
        if (chunk.type === 'chunk' && chunk.viteMetadata?.importedCss) {
          for (const css of chunk.viteMetadata.importedCss) {
            const cssPath = withServiceWorkerBasePath(resolvedBasePath, css);
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

function baseAwareWebManifest(): Plugin {
  let basePath = '/';
  let outDir = 'dist';

  return {
    name: 'base-aware-web-manifest',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      basePath = normalizeServiceWorkerBasePath(config.base);
      outDir = config.build.outDir;
    },
    // Run after the static `public/` copy so we rewrite the emitted manifest.
    // GitHub Pages project sites serve under a subpath (`/finance/`); the
    // checked-in manifest is root-pinned, so without this its `scope` /
    // `start_url` / icons disagree with the SW scope and break installability
    // (#2797). Root deploys are left untouched.
    closeBundle() {
      if (basePath === '/') {
        return;
      }
      const manifestPath = resolve(__dirname, outDir, 'manifest.json');
      // Read directly instead of `existsSync` + read to avoid a time-of-check
      // to time-of-use (TOCTOU) file-system race; tolerate a missing manifest.
      let raw: string;
      try {
        raw = readFileSync(manifestPath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return;
        }
        throw error;
      }
      const manifest = JSON.parse(raw) as WebManifest;
      const rewritten = applyBaseToWebManifest(manifest, basePath);
      writeFileSync(manifestPath, `${JSON.stringify(rewritten, null, 2)}\n`);
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

function stubAuthRefreshForCi(): Plugin {
  const handleAuthRefresh: Connect.NextHandleFunction = (req, res, next) => {
    if (process.env.CI !== 'true' || !req.url?.startsWith('/api/auth/refresh')) {
      next();
      return;
    }

    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'No refresh session in CI preview' }));
  };

  return {
    name: 'stub-auth-refresh-for-ci',
    configureServer(server) {
      server.middlewares.use(handleAuthRefresh);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleAuthRefresh);
    },
  };
}

const functionsProxyTarget = process.env.VITE_FUNCTIONS_PROXY_TARGET ?? 'http://127.0.0.1:54321';
const authProxyTarget =
  process.env.VITE_AUTH_PROXY_TARGET ?? `${functionsProxyTarget}/functions/v1`;

// https://vitejs.dev/config/
export default defineConfig({
  // Base public path. Defaults to '/' (root, e.g. the Azure VM / custom domain).
  // GitHub Pages project sites serve under '/<repo>/', so the Pages deploy sets
  // PUBLIC_BASE_PATH=/finance/. import.meta.env.BASE_URL reflects this at runtime.
  base: process.env.PUBLIC_BASE_PATH ?? '/',
  plugins: [
    ensureDesignTokens(),
    react(),
    copySqlJsWasm(),
    swPrecacheManifest(),
    baseAwareWebManifest(),
    allowServiceWorkerRootScope(),
    stubAuthRefreshForCi(),
  ],

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
    // Keep lazy route chunks lazy; the route prefetch policy opts in after app-shell paint.
    modulePreload: false,
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
        advancedChunks: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 100,
            },
            {
              name: 'vendor-charts',
              test: /node_modules[\\/](recharts|d3-[^\\/]+|d3|@reduxjs[\\/]toolkit|redux|immer|reselect|decimal\.js-light|victory-vendor)[\\/]/,
              priority: 100,
            },
            {
              name: 'vendor-sqlite',
              test: /node_modules[\\/](wa-sqlite|sql\.js)[\\/]/,
              priority: 100,
            },
            {
              name: 'vendor-zod',
              test: /node_modules[\\/]zod[\\/]/,
              priority: 100,
            },
            {
              name: 'vendor-ocr',
              test: /node_modules[\\/]tesseract\.js[\\/]/,
              priority: 100,
            },
            {
              // Locale catalogs (i18n message packs) are large, text-heavy, and
              // grow with every new string. Keep them in their own shared chunk
              // so cumulative catalog growth does not push the core shared-infra
              // chunk (`vendor-app`) past the lazy-chunk budget (#3478). This
              // preserves the #2983 goal of keeping db/auth/contexts unified
              // while isolating the most separable, fastest-growing contributor.
              name: 'vendor-i18n',
              test: /[\\/]src[\\/]lib[\\/]i18n[\\/]/,
              priority: 60,
            },
            {
              // Data-access repositories (one module per domain table) are the
              // fastest-growing part of the shared data layer — every web
              // feature batch adds another repository. Peel them into their own
              // shared chunk so cumulative repository growth does not push the
              // core shared-infra chunk (`vendor-app`) past the lazy-chunk
              // budget, mirroring the `vendor-i18n` split (#3478). Higher
              // priority than `vendor-app` so these paths are claimed here.
              name: 'vendor-repositories',
              test: /[\\/]src[\\/]db[\\/]repositories[\\/]/,
              priority: 60,
            },
            {
              // Shared application infrastructure (SQLite-WASM data layer,
              // repositories, auth, React contexts) is imported by nearly every
              // route. Hoist it into one shared chunk instead of letting
              // rolldown host it inside `route-dashboard`, which chronically
              // inflated that chunk past the budget (#2983). Locale catalogs are
              // split into `vendor-i18n` above (#3478); data-access repositories
              // are split into `vendor-repositories` above.
              name: 'vendor-app',
              test: /[\\/]src[\\/](db|auth|contexts)[\\/]/,
              priority: 50,
            },
            {
              name: (id: string) => getRouteChunkName(id) ?? undefined,
              priority: 10,
            },
          ],
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
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob:",
        "font-src 'self' https://fonts.gstatic.com",
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
