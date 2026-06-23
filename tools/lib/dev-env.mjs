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
