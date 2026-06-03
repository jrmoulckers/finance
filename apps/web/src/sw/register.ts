// SPDX-License-Identifier: BUSL-1.1

/**
 * Service worker registration (#1965).
 *
 * Chromium's PWA installability heuristic requires a service worker with
 * a `fetch` handler to be REGISTERED AND ACTIVE on the page that hosts
 * the manifest link.  Previously we registered the SW lazily from
 * `useServiceWorkerUpdate`, which is mounted inside `AppLayout` — only
 * AFTER the user signs in and navigates to an authenticated route.  As a
 * result, anonymous visits to `/`, `/login`, etc. never installed the SW,
 * so the install icon never appeared in Chrome's address bar.
 *
 * The previous registration also imported the SW via `?worker&url`, which
 * caused Vite to emit a hashed bundle under `/assets/src-<hash>.js`.
 * Browsers reject `scope: '/'` for a SW that lives at `/assets/...` unless
 * Caddy serves `Service-Worker-Allowed: /` on that path (we don't).
 * The Vite config's `rollupOptions.input.sw` already emits the canonical
 * `/sw.js` at the site root, and the dev middleware
 * (`allowServiceWorkerRootScope` plugin) attaches the right header to the
 * TS source URL.  We therefore pick the URL explicitly based on
 * `import.meta.env.DEV`.
 *
 * Registering at app boot (and pointing at the root-scoped URL) fixes
 * both issues:
 *
 *   - The SW is installed on the first page load (any route).
 *   - On reload, the existing SW controls the navigation and Chromium
 *     credits the page with the installability flag.
 *   - The Update Banner (#1330) still uses `useServiceWorkerUpdate()` to
 *     surface new-worker prompts; it now looks up the already-registered
 *     worker instead of registering one.
 *
 * The registration is a no-op in jsdom (test) environments and on
 * browsers without `serviceWorker` support.
 */

/**
 * The URL of the bundled service worker.
 *
 * - In production: `/sw.js` is emitted by Vite's `rollupOptions.input.sw`
 *   entry at the site root.  Same path as the page, so the default scope
 *   already matches `/` without any extra `Service-Worker-Allowed`
 *   header.
 * - In development: Vite serves the TS source directly; the
 *   `allowServiceWorkerRootScope` middleware in `vite.config.ts` sets
 *   `Service-Worker-Allowed: /` on that response so the dev SW can also
 *   claim the root scope.
 */
const SERVICE_WORKER_URL: string = import.meta.env.DEV ? '/src/sw/service-worker.ts' : '/sw.js';

/**
 * Track the registration so subscribers can wait for it without
 * triggering a second `navigator.serviceWorker.register()` call (which
 * would otherwise be safely deduped by the browser, but consumers need
 * the same Registration instance to attach `updatefound` listeners).
 */
let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Register the application service worker at the root scope.
 *
 * Idempotent — subsequent calls return the same in-flight promise.
 * Returns `null` (not undefined / throws) when the environment cannot
 * register a worker, so callers can write
 * `const reg = await registerAppServiceWorker(); if (!reg) ...`.
 */
export function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registrationPromise) {
    return registrationPromise;
  }

  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !navigator.serviceWorker
  ) {
    registrationPromise = Promise.resolve(null);
    return registrationPromise;
  }

  registrationPromise = navigator.serviceWorker
    .register(SERVICE_WORKER_URL, { scope: '/', type: 'module' })
    .then((registration) => registration)
    .catch((error: unknown) => {
      // SW registration is non-fatal — the app still works without it,
      // it just loses offline / installability capabilities.
      // eslint-disable-next-line no-console -- dev visibility; production users get unaffected app
      console.error('[sw] registration failed', error);
      registrationPromise = null;
      return null;
    });

  return registrationPromise;
}

/**
 * Reset registration state.  Test-only helper.
 *
 * @internal
 */
export function _resetServiceWorkerRegistrationForTesting(): void {
  registrationPromise = null;
}
