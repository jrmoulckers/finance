// SPDX-License-Identifier: BUSL-1.1
/* global window, navigator */

// Auto-apply waiting service-worker updates (#2023); externalized for CSP (#3210).
//
// Externalized from an inline <script> in index.html so it complies with the
// deployed Content-Security-Policy. Staging and production (deploy/Caddyfile,
// deploy/Caddyfile.staging) serve `script-src 'self' 'wasm-unsafe-eval'` with
// NO 'unsafe-inline', which blocked the previous inline script and left users
// pinned to stale bundles after a deploy. As a same-origin static file it is
// allowed by `script-src 'self'` — no CSP change required.
//
// Caddy serves this non-hashed /sw-update.js through the SPA fallback with
// `Cache-Control: no-cache, must-revalidate`, so — like the no-cache
// index.html that references it — every page load runs the latest copy.
//
// When a new build is deployed, the browser detects the changed /sw.js and
// installs a new SW which enters the "waiting" state until the old SW's clients
// close. Without manual intervention (clicking an "Update available" banner),
// users can stay pinned to the old bundle indefinitely — see the
// demo-mode-stuck bug from #2021 where the banner only rendered inside the
// authenticated layout, so users stuck on /login could never trigger the
// update.
//
// This script runs on every page load and immediately tells any waiting SW to
// skipWaiting. It also listens for `updatefound` so newly-installed waiting SWs
// are activated as soon as they're ready (handles the race where the browser is
// still fetching /sw.js when this script runs).
//
// The reload guard prevents an infinite loop if controllerchange fires for an
// unrelated reason.
(function () {
  var isLighthouseAudit =
    window.location.search.indexOf('lhci=1') !== -1 || /\bLighthouse\b/i.test(navigator.userAgent);
  if ('serviceWorker' in navigator && !isLighthouseAudit) {
    var reloaded = false;
    var hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    var activateWaiting = function (reg) {
      if (reg && reg.waiting && navigator.serviceWorker.controller) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    };
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return;
      activateWaiting(reg);
      reg.addEventListener('updatefound', function () {
        var installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', function () {
          if (installing.state === 'installed') {
            activateWaiting(reg);
          }
        });
      });
    });
  }
})();
