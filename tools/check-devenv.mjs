#!/usr/bin/env node
// @ts-check
//
// check-devenv.mjs — "open the repo and it sets itself up" bootstrap.
//
// Runs automatically when the folder opens in VS Code (see the
// "Setup: Check & heal dev environment" task in .vscode/tasks.json, which uses
// runOn: folderOpen) and is also available on demand as `npm run check-devenv`.
//
// Philosophy: auto-heal what is safe, guide for what is not.
//   - AUTO-HEALS npm dependencies when node_modules is missing or stale (the #1
//     fresh-clone gap) — no admin, no network surprises beyond a normal install.
//   - DETECTS but never force-installs the system tools that need elevation or a
//     reboot (Node.js, a JDK, Docker) — it prints the exact fix instead.
//   - Stays quiet when everything is healthy (one line) and never interrupts
//     opening the folder: a merely-missing system tool is advisory (exit 0). The
//     process only exits non-zero when an auto-heal it actually attempted failed.
//
// For the heavyweight path (full validate -> install -> hooks -> first build) use
// `npm run setup`. For the runtime preflight (Docker daemon, disk, ports, Supabase
// CLI) use `npm run doctor`.
//
// Usage:
//   node tools/check-devenv.mjs            # check + auto-heal deps (folder-open default)
//   node tools/check-devenv.mjs --quiet    # print only when action is needed
//   node tools/check-devenv.mjs --dry-run  # report what it would do; never installs
//   node tools/check-devenv.mjs --help

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import { dependencyState, recordInstall } from './lib/dev-env.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const QUIET = args.includes('--quiet');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Finance — open-and-go dev environment bootstrap (check-devenv)

Verifies the prerequisites needed to work in this repo and auto-installs npm
dependencies when they are missing. Anything it cannot safely install itself
(Node.js, a JDK, Docker) is reported with the exact command to fix it.

Runs automatically on folder open in VS Code; also available as \`npm run check-devenv\`.

Usage:
  node tools/check-devenv.mjs [options]

Options:
  --quiet     Print only when action is needed (silent when healthy).
  --dry-run   Report what would happen; do not install anything.
  -h, --help  Show this help.

Related:
  npm run setup    Full setup: validate -> install -> git hooks -> first build.
  npm run doctor   Runtime preflight: Docker daemon, disk, ports, Supabase CLI.

Exit code: 0 when healthy or when only guidance was printed; 1 only when an
attempted auto-heal (npm install) failed.`);
  process.exit(0);
}

// JDK major required for the Kotlin/KMP/Android/Windows builds. Mirrors
// tools/setup.js and the .devcontainer java feature (:21).
const REQUIRED_JDK_MAJOR = 21;

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = {
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

/**
 * Run a native executable probe (e.g. `git --version`). Never throws. Merges
 * stdout+stderr because some JDKs print `javac -version` to stderr.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {number} [timeoutMs]
 * @returns {{ ok: boolean, out: string }}
 */
function probe(cmd, cmdArgs, timeoutMs = 6000) {
  const res = spawnSync(cmd, cmdArgs, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
  return { ok: res.status === 0 && !res.error, out };
}

/**
 * Run a probe through a shell — needed for the npm `.cmd` shim on Windows.
 * Passing a single command line (not an args array) avoids the DEP0190 warning.
 * @param {string} commandLine
 * @param {number} [timeoutMs]
 * @returns {{ ok: boolean, out: string }}
 */
function probeShell(commandLine, timeoutMs = 8000) {
  const res = spawnSync(commandLine, {
    encoding: 'utf8',
    timeout: timeoutMs,
    shell: true,
    windowsHide: true,
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
  return { ok: res.status === 0 && !res.error, out };
}

/**
 * First integer found in a string, or null.
 * @param {string} s
 * @returns {number | null}
 */
function firstInt(s) {
  const m = s && s.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Minimum required Node major version, read from package.json `engines.node`
 * so there is a single source of truth (falls back to 22).
 * @returns {number}
 */
function requiredNodeMajor() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    return firstInt(pkg?.engines?.node || '') ?? 22;
  } catch {
    return 22;
  }
}

/** @typedef {{ name: string, ok: boolean, detail: string, fix?: string }} Item */

/** @type {Item[]} */
const items = [];
/** @type {Item[]} */
const actions = []; // required items that need a human to install something

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {string} detail
 * @param {string} [fix]
 */
function record(name, ok, detail, fix) {
  const item = { name, ok, detail, ...(fix ? { fix } : {}) };
  items.push(item);
  if (!ok && fix) actions.push(item);
}

// ── System tools (detect + guide; never auto-install) ────────────────────────

function checkNode() {
  const min = requiredNodeMajor();
  const cur = process.versions.node;
  const ok = (firstInt(cur) ?? 0) >= min;
  record(
    'Node.js',
    ok,
    ok ? cur : `${cur} — need >= ${min}`,
    ok ? undefined : `Update Node.js (>= ${min}): https://nodejs.org/`,
  );
}

function checkNpm() {
  const r = probeShell('npm --version');
  record(
    'npm',
    r.ok,
    r.ok ? r.out : 'not found',
    r.ok ? undefined : 'Reinstall Node.js — npm ships with it: https://nodejs.org/',
  );
  return r.ok;
}

/**
 * Locate a usable JDK. Tries `javac`/`java` on PATH first, then falls back to
 * $JAVA_HOME/bin — many Windows setups (and the VS Code Java extensions) read
 * JAVA_HOME without ever putting the JDK on PATH, so a PATH-only check would
 * false-alarm.
 * @returns {{ ok: boolean, out: string }}
 */
function jdkProbe() {
  // Prefer javac (a real JDK, not just a JRE); fall back to java.
  let r = probe('javac', ['-version']);
  if (r.ok) return r;
  r = probe('java', ['-version']);
  if (r.ok) return r;

  const home = process.env.JAVA_HOME;
  if (home) {
    const exe = process.platform === 'win32' ? '.exe' : '';
    const bin = path.join(home, 'bin');
    r = probe(path.join(bin, `javac${exe}`), ['-version']);
    if (r.ok) return r;
    r = probe(path.join(bin, `java${exe}`), ['-version']);
    if (r.ok) return r;
  }
  return { ok: false, out: '' };
}

function checkJdk() {
  const jv = jdkProbe();
  const found = firstInt(jv.out);
  const ok = jv.ok && found === REQUIRED_JDK_MAJOR;
  record(
    'JDK 21',
    ok,
    ok
      ? jv.out.split(/\r?\n/)[0] || `JDK ${REQUIRED_JDK_MAJOR}`
      : jv.ok
        ? `JDK ${found} detected — need JDK ${REQUIRED_JDK_MAJOR}`
        : 'JDK not found',
    ok
      ? undefined
      : `Install Eclipse Temurin ${REQUIRED_JDK_MAJOR} (Kotlin/KMP/Android/Windows): https://adoptium.net/temurin/releases/?version=${REQUIRED_JDK_MAJOR}`,
  );
}

function checkDocker() {
  // Presence only — the daemon/ports/disk live in `npm run doctor` (slower).
  const r = probe('docker', ['--version']);
  record(
    'Docker',
    r.ok,
    r.ok ? r.out : 'Docker not found',
    r.ok
      ? undefined
      : 'Install Docker Desktop (local Supabase backend): https://www.docker.com/products/docker-desktop/',
  );
}

// ── Dependencies (auto-heal) ─────────────────────────────────────────────────

/**
 * Ensure npm dependencies are installed. Returns one of:
 *  - 'ok'        already installed and current — nothing to do
 *  - 'healed'    were missing/stale and `npm install` succeeded
 *  - 'would'     --dry-run: would have installed
 *  - 'failed'    `npm install` was attempted and failed
 *  - 'skipped'   npm itself is unavailable, so install is impossible
 * @param {boolean} npmAvailable
 * @returns {'ok' | 'healed' | 'would' | 'failed' | 'skipped'}
 */
function ensureDependencies(npmAvailable) {
  const { state, reason } = dependencyState(REPO_ROOT);
  if (state === 'ok') {
    record('Dependencies', true, 'node_modules present');
    return 'ok';
  }

  const why =
    reason || (state === 'missing' ? 'node_modules is missing' : 'dependencies are stale');

  if (!npmAvailable) {
    record(
      'Dependencies',
      false,
      why,
      'Install Node.js (which provides npm), then reopen the folder.',
    );
    return 'skipped';
  }
  if (DRY_RUN) {
    record('Dependencies', false, `${why} — would run \`npm install\``);
    return 'would';
  }

  console.log(`${c.cyan('›')} ${why} — installing dependencies (${c.dim('npm install')})...\n`);
  const res = spawnSync('npm install', {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
  });
  const ok = res.status === 0 && !res.error;
  if (ok) {
    recordInstall(REPO_ROOT); // remember the lockfile hash so future opens see 'ok'
    record('Dependencies', true, 'installed just now');
    return 'healed';
  }
  record(
    'Dependencies',
    false,
    'npm install failed — see the output above',
    'Re-run `npm install` manually.',
  );
  return 'failed';
}

// ── Run ──────────────────────────────────────────────────────────────────────

checkNode();
const npmOk = checkNpm();
checkJdk();
checkDocker();
const depResult = ensureDependencies(npmOk);

// ── Report ───────────────────────────────────────────────────────────────────

const healthy = actions.length === 0 && depResult !== 'failed';

if (healthy && QUIET) {
  process.exit(0); // nothing to say
}

const icon = (ok) => (ok ? c.green('✓') : c.red('✗'));

if (healthy) {
  const summary = items
    .filter((i) => i.ok)
    .map((i) => i.name)
    .join(', ');
  console.log(`${c.green('✓')} Dev environment ready ${c.dim(`— ${summary} OK`)}`);
  if (depResult === 'healed') {
    console.log(`  ${c.dim('Dependencies were installed on open.')}`);
  }
  process.exit(0);
}

console.log(`\n${c.bold('Finance — dev environment check')}\n`);
for (const i of items) {
  console.log(`  ${icon(i.ok)} ${i.name}: ${i.detail}`);
}

if (actions.length > 0) {
  console.log(`\n${c.bold(c.yellow('Action needed'))} ${c.dim('(cannot auto-install these):')}`);
  for (const a of actions) {
    console.log(`  ${c.yellow('•')} ${a.name}: ${a.fix}`);
  }
  console.log(
    `\n  ${c.dim('Full setup + first build:')} ${c.cyan('npm run setup')}   ${c.dim('Runtime preflight:')} ${c.cyan('npm run doctor')}`,
  );
}

// Exit non-zero ONLY when an auto-heal we attempted failed — a merely-missing
// system tool is advisory and must not flag the folder-open task as failed.
process.exit(depResult === 'failed' ? 1 : 0);
