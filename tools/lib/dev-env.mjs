// @ts-check
//
// dev-env.mjs — shared helpers for the local dev tooling (dev-full.mjs + doctor.mjs).
//
// Detects whether workspace dependencies need (re)installing. Uses a content
// hash of package-lock.json rather than file mtimes, because git does not
// preserve mtimes — a plain `git checkout`/`reset` would otherwise look like a
// dependency change and trigger spurious reinstalls.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MARKER = '.dev-full-install'; // written under node_modules/ (gitignored)

/**
 * SHA-1 of the repo's package-lock.json, or null if it doesn't exist.
 * @param {string} repoRoot
 * @returns {string|null}
 */
export function lockfileHash(repoRoot) {
  const lock = path.join(repoRoot, 'package-lock.json');
  if (!fs.existsSync(lock)) return null;
  return crypto.createHash('sha1').update(fs.readFileSync(lock)).digest('hex');
}

/**
 * Absolute path of the install marker that records the lockfile hash of the
 * last install performed by dev-full.mjs.
 * @param {string} repoRoot
 */
export function installMarkerPath(repoRoot) {
  return path.join(repoRoot, 'node_modules', MARKER);
}

/**
 * Classify the dependency state of the workspace.
 * - `missing`: no node_modules (fresh clone) — install required.
 * - `stale`:   node_modules exists and was installed by this tool, but the
 *              lockfile has since changed — reinstall recommended.
 * - `ok`:      node_modules exists and is current (or was installed by a plain
 *              `npm install` with no marker — we trust it and don't reinstall).
 * @param {string} repoRoot
 * @returns {{state:'missing'|'stale'|'ok', reason?:string}}
 */
export function dependencyState(repoRoot) {
  const modules = path.join(repoRoot, 'node_modules');
  if (!fs.existsSync(modules)) {
    return { state: 'missing', reason: 'node_modules is missing (fresh clone)' };
  }
  const marker = installMarkerPath(repoRoot);
  let recorded;
  try {
    recorded = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '';
  } catch {
    recorded = '';
  }
  // No marker → dependencies were installed outside this tool (e.g. a prior
  // `npm install`). Trust them rather than forcing a redundant reinstall.
  if (!recorded) return { state: 'ok' };

  const current = lockfileHash(repoRoot);
  if (current && recorded !== current) {
    return { state: 'stale', reason: 'package-lock.json changed since the last install' };
  }
  return { state: 'ok' };
}

/**
 * Record the current lockfile hash after a successful install. Best-effort.
 * @param {string} repoRoot
 */
export function recordInstall(repoRoot) {
  try {
    const hash = lockfileHash(repoRoot);
    if (hash) fs.writeFileSync(installMarkerPath(repoRoot), hash);
  } catch {
    // Non-fatal: the marker is an optimization, not a correctness requirement.
  }
}

/**
 * @typedef {'rate-limit'|'image'|'migration'|'unknown'} SupabaseFailureKind
 * @typedef {{kind:SupabaseFailureKind, signal?:string}} SupabaseFailure
 */

/**
 * Classify a failed `supabase start` from its combined stdout+stderr so the
 * caller can react correctly instead of blaming everything on a Docker Hub
 * rate-limit (the bug this fixes).
 *
 * Precedence is deliberate: **terminal, non-retryable** failures win over a
 * transient rate-limit, because a cold pull can hit a rate-limit on one image
 * (which then succeeds on retry) yet still fail fatally later — e.g. a migration
 * error. Reporting the fatal cause is what the developer needs.
 *
 *  - `image`      — corrupt / unrunnable local image layers (truncated entrypoint
 *                   scripts → ENOEXEC). Retrying never helps; the images must be
 *                   re-pulled. Signals: `exec format error`, `corrupted` shared
 *                   library, or `error running container: exit 255`.
 *  - `migration`  — a database/SQL error while applying migrations (e.g.
 *                   `permission denied for schema … (SQLSTATE 42501)`). Terminal;
 *                   the migration itself must be fixed. Signals: `SQLSTATE`,
 *                   `permission denied for`, `syntax error at or near`.
 *  - `rate-limit` — a transient registry pull limit. Safe to retry with backoff.
 *                   Signals: `Rate exceeded`, `toomanyrequests`, `Too Many
 *                   Requests`, `pull rate limit`.
 *  - `unknown`    — none of the above; caller may retry once but should surface
 *                   the raw output.
 *
 * @param {string} output combined stdout+stderr from `supabase start`
 * @returns {SupabaseFailure}
 */
export function classifySupabaseStartFailure(output) {
  const lower = String(output || '').toLowerCase();
  const has = (s) => lower.includes(s);

  // 1. Corrupt local image layers — not fixable by retrying.
  const imageSignals = ['exec format error', 'corrupted shared library', 'corrupted'];
  const containerExec255 = has('error running container') && has('exit 255');
  const imageHit = imageSignals.find(has);
  if (imageHit || containerExec255) {
    return { kind: 'image', signal: imageHit || 'error running container: exit 255' };
  }

  // 2. Migration / SQL error — terminal; surface the real DB error. Use
  //    Postgres-specific phrasing so a Docker "permission denied while trying to
  //    connect to the daemon socket" is NOT misread as a migration failure.
  const migrationSignals = ['sqlstate', 'permission denied for', 'syntax error at or near'];
  const migrationHit = migrationSignals.find(has);
  if (migrationHit) {
    return { kind: 'migration', signal: migrationHit };
  }

  // 3. Transient registry pull rate-limit — safe to retry with backoff.
  const rateSignals = ['rate exceeded', 'toomanyrequests', 'too many requests', 'pull rate limit'];
  const rateHit = rateSignals.find(has);
  if (rateHit) {
    return { kind: 'rate-limit', signal: rateHit };
  }

  return { kind: 'unknown' };
}

/**
 * HTTP statuses that mean the API gateway (Kong) has no healthy Edge Functions
 * upstream — the runtime is down, wedged, or still booting. A 500/501 is treated
 * as "runtime up, but the function itself errored" and is NOT a reason to
 * recreate the stack.
 */
const RUNTIME_DOWN_STATUSES = new Set([502, 503, 504]);

/**
 * @typedef {{healthy: boolean, detail: string}} EdgeHealth
 */

/**
 * Interpret a single Edge Functions health probe (pure; no IO).
 *
 * The local Supabase stack can be "running" (Kong + Postgres up, `supabase
 * status` prints an API URL) while its Edge Functions runtime is dead — a stale
 * or orphaned `supabase_edge_runtime_*` container that Docker's restart policy
 * keeps "Up" but which fails to bootstrap any function and answers every
 * `/functions/v1/*` call with HTTP 503. That state silently breaks edge auth
 * (signup, login, refresh) even though the stack looks healthy, so dev-full.mjs
 * probes a known function and heals (stop → start) when this returns unhealthy.
 *
 * - Healthy: the runtime booted a worker and produced a response we can read
 *   (any status outside {502,503,504} — e.g. a 400 "email and password are
 *   required" from auth-signup, a 401 from Kong, or even a 500 from the function
 *   body). The function ran; the runtime is alive.
 * - Unhealthy: a gateway 502/503/504 (the dead-runtime signature is 503) OR a
 *   transport error (connection refused/reset, timeout) — nothing served the
 *   request.
 *
 * @param {{status?: number|null, errorCode?: string|null}} [probe]
 *   `status`: the HTTP status code if a response was received, else null.
 *   `errorCode`: a transport error code/name (e.g. 'ECONNREFUSED', 'timeout')
 *   when the request threw, else null.
 * @returns {EdgeHealth}
 */
export function interpretEdgeProbe({ status = null, errorCode = null } = {}) {
  if (typeof status === 'number') {
    if (RUNTIME_DOWN_STATUSES.has(status)) {
      return { healthy: false, detail: `HTTP ${status}` };
    }
    return { healthy: true, detail: `HTTP ${status}` };
  }
  return { healthy: false, detail: errorCode ? String(errorCode) : 'no response' };
}
