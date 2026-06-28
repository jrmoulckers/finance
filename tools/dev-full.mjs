#!/usr/bin/env node
// @ts-check
//
// dev-full.mjs — One command to run the Finance web app end-to-end on a real
// local edge backend (Supabase via Docker), the way a developer would.
//
// Suggested npm script: "dev:full": "node tools/dev-full.mjs"
//
// Pipeline:
//   0. Install dependencies (npm install)      — on a fresh/stale clone only;
//                                                skip with --skip-install,
//                                                force with --install
//   1. Preflight (tools/doctor.mjs)            — skip with --skip-doctor
//   2. supabase start (services/api)           — reused only if it is genuinely
//                                                healthy AND bound to THIS
//                                                worktree. The Edge Functions
//                                                runtime is probed; a "running"
//                                                stack whose functions are dead
//                                                (every /functions/v1/* call 503s
//                                                — a stale/orphaned edge-runtime
//                                                container Docker keeps "Up" but
//                                                broken), OR a stack bound to a
//                                                different worktree (the shared
//                                                project_id trap), is healed by a
//                                                forced recreate: stop → docker rm
//                                                -f the project containers → start
//                                                (data volumes are preserved).
//                                                Retries with backoff on a true
//                                                registry rate-limit, but fails
//                                                fast (with the right fix) on a
//                                                corrupt image or migration error.
//                                                Force a clean restart with
//                                                --recreate.
//   3. supabase db reset (optional)            — only with --reset
//   4. Write apps/web/.env.local               — from `supabase status -o env`,
//                                                so the web app leaves demo mode
//   5. Launch the web app                      — `vite` dev (default) or the live
//                                                e2e suite (--e2e)
//   6. Open the browser at :5173               — unless --no-open / --e2e
//
// Usage:
//   node tools/dev-full.mjs                 # bring up stack + web app, open browser
//   node tools/dev-full.mjs --reset         # also reset the DB (migrations + seed)
//   node tools/dev-full.mjs --recreate      # force-recreate the stack (heal a broken/stale one)
//   node tools/dev-full.mjs --e2e           # bring up stack, run the live e2e suite
//   node tools/dev-full.mjs --no-open       # don't auto-open the browser
//   node tools/dev-full.mjs --skip-install  # skip the automatic dependency install
//   node tools/dev-full.mjs --install       # force a dependency (re)install
//   node tools/dev-full.mjs --skip-doctor   # skip preflight (e.g. in CI)
//   node tools/dev-full.mjs --help
//
// Everything here is cross-platform Node (Windows / macOS / Linux) and uses
// `npx --yes supabase`, so no global Supabase CLI is required. A fresh clone
// needs no manual `npm install` — step 0 handles it, so VS Code F5 is truly
// clone-to-run.

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import {
  dependencyState,
  recordInstall,
  classifySupabaseStartFailure,
  interpretEdgeProbe,
} from './lib/dev-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(REPO_ROOT, 'services', 'api');
const WEB_ENV_LOCAL = path.join(REPO_ROOT, 'apps', 'web', '.env.local');

// Default local API gateway (config.toml [api] port = 54321) and the function we
// probe to tell a healthy Edge Functions runtime from a dead one.
const DEFAULT_API_URL = 'http://127.0.0.1:54321';
const FUNCTIONS_PROBE_PATH = '/functions/v1/auth-signup';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Finance — one-command local full-stack web e2e (on edge)

Brings up the local Supabase edge stack, wires the web app to it, and launches
the web app — a single command for the full developer loop.

Usage:
  node tools/dev-full.mjs [options]

Options:
  --reset         Reset the database (apply all migrations + seed) before launch.
  --recreate      Force-recreate the Supabase stack before launch (heals a stack
                  whose Edge Functions runtime is dead OR bound to another worktree).
  --e2e           Run the live Playwright e2e suite instead of the dev server.
  --no-open       Do not auto-open the browser (dev mode only).
  --skip-doctor   Skip the preflight health check.
  --skip-install  Skip the automatic dependency install.
  --install       Force a dependency install even if it looks up to date.
  -h, --help      Show this help.

On a fresh clone this installs dependencies automatically (so VS Code F5 works
clone-to-run with no manual npm install). Requires Docker Desktop running.
No global Supabase CLI needed (uses npx).`);
  process.exit(0);
}

const opts = {
  reset: args.includes('--reset'),
  recreate: args.includes('--recreate'),
  e2e: args.includes('--e2e'),
  noOpen: args.includes('--no-open'),
  skipDoctor: args.includes('--skip-doctor'),
  skipInstall: args.includes('--skip-install'),
  install: args.includes('--install'),
};

const isWin = process.platform === 'win32';

function step(msg) {
  console.log(`\n\x1b[1m▶ ${msg}\x1b[0m`);
}
function info(msg) {
  console.log(`  ${msg}`);
}
function fail(msg, fix) {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m`);
  if (fix) console.error(`  → ${fix}`);
  process.exit(1);
}

/**
 * npm/npx are `.cmd` shims on Windows and must go through a shell; passing a
 * single joined command string (no separate args array) avoids the DEP0190
 * shell-args deprecation warning. `node` and other real executables run without
 * a shell.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @returns {{viaShell:boolean, command:string, args:string[]}}
 */
function resolve(cmd, cmdArgs) {
  if (cmd === 'npm' || cmd === 'npx') {
    return { viaShell: true, command: [cmd, ...cmdArgs].join(' '), args: [] };
  }
  return { viaShell: false, command: cmd, args: cmdArgs };
}

/**
 * Run a command to completion, inheriting stdio so the user sees live output.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {{cwd?:string, timeoutMs?:number}} [options]
 * @returns {number} exit code
 */
function runInherit(cmd, cmdArgs, options = {}) {
  const r = resolve(cmd, cmdArgs);
  const res = spawnSync(r.command, r.args, {
    cwd: options.cwd || REPO_ROOT,
    stdio: 'inherit',
    shell: r.viaShell,
    timeout: options.timeoutMs,
    windowsHide: true,
  });
  if (res.error) fail(`Failed to run ${cmd}: ${res.error.message}`);
  return res.status ?? 1;
}

/**
 * Run a command and capture stdout (used for `supabase status`).
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {{cwd?:string, timeoutMs?:number}} [options]
 */
function runCapture(cmd, cmdArgs, options = {}) {
  const r = resolve(cmd, cmdArgs);
  const res = spawnSync(r.command, r.args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 60000,
    shell: r.viaShell,
    windowsHide: true,
  });
  return {
    ok: res.status === 0 && !res.error,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a command, streaming its output live (like runInherit) **and** capturing a
 * copy so the caller can inspect it — a "tee". Used for `supabase start`, whose
 * failure cause (rate-limit vs. corrupt image vs. migration error) can only be
 * told apart by reading the output.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {{cwd?:string}} [options]
 * @returns {Promise<{code:number, output:string}>}
 */
function runTee(cmd, cmdArgs, options = {}) {
  const r = resolve(cmd, cmdArgs);
  return new Promise((done) => {
    const child = spawn(r.command, r.args, {
      cwd: options.cwd || REPO_ROOT,
      shell: r.viaShell,
      windowsHide: true,
    });
    let output = '';
    const tee = (stream, sink) => {
      if (!stream) return;
      stream.on('data', (chunk) => {
        sink.write(chunk);
        output += chunk.toString();
      });
    };
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);
    child.on('error', (err) => done({ code: 1, output: `${output}\n${err.message}` }));
    child.on('close', (code) => done({ code: code ?? 1, output }));
  });
}

/**
 * Remediation text for corrupt local Supabase image layers — the failure mode
 * that masquerades as a rate-limit. Retrying never fixes it; the images have to
 * be re-pulled fresh.
 * @param {string} signal
 * @returns {string}
 */
function dockerCorruptionRemedy(signal) {
  return [
    `Corrupt local Docker image layers ("${signal}") — retrying will not help; they must be re-pulled.`,
    '  1. Stop the stack:        npm --prefix services/api run supabase:stop',
    '  2. Remove the corrupt Supabase images with `docker rmi` (keep your data volumes —',
    '     never pass --volumes). Tip: protect known-good images with a placeholder',
    '     container first so a prune cannot evict them.',
    '  3. Force a real image GC:  docker desktop restart',
    '     (on the containerd image store, `docker image prune` alone reclaims 0 B).',
    '  4. Re-pull fresh:          npm run dev:full',
    '  See the "Docker image corruption (exit 255 / exec format error)" section in',
    '  docs/guides/full-stack-local.md.',
  ].join('\n');
}

// --- 0. Dependencies (auto-install on a fresh / stale clone) ------------------
function ensureDependencies() {
  if (opts.skipInstall) {
    info('Skipping dependency install (--skip-install).');
    return;
  }
  const { state, reason } = dependencyState(REPO_ROOT);
  if (state === 'ok' && !opts.install) {
    info('Dependencies present.');
    return;
  }
  step('Installing dependencies (npm install)');
  info(`${opts.install ? 'Forced by --install' : reason} — running npm install…`);
  const code = runInherit('npm', ['install']);
  if (code !== 0) {
    fail('npm install failed.', 'Fix the errors above, then re-run `npm run dev:full`.');
  }
  recordInstall(REPO_ROOT);
  info('Dependencies installed.');
}

// --- 1. Preflight ------------------------------------------------------------
function preflight() {
  if (opts.skipDoctor) {
    info('Skipping preflight (--skip-doctor).');
    return;
  }
  step('Preflight check (tools/doctor.mjs)');
  const code = runInherit(process.execPath, [path.join(__dirname, 'doctor.mjs'), '--quiet']);
  if (code !== 0) {
    fail(
      'Preflight failed — the environment is not ready for the full stack.',
      'Resolve the ✗ items above (run `npm run doctor` for the full report), then retry. Use --skip-doctor to bypass.',
    );
  }
  info('Preflight passed.');
}

// --- 2. Supabase start (idempotent, with rate-limit backoff + self-heal) ------
function isSupabaseRunning() {
  // `supabase status` exits 0 and prints "API URL" only when the stack is up.
  const res = runCapture('npx', ['--yes', 'supabase', 'status'], {
    cwd: API_DIR,
    timeoutMs: 30000,
  });
  return res.ok && /API URL/i.test(res.stdout);
}

/**
 * Best-effort API URL of the running stack, read from `supabase status -o env`
 * (the same source writeEnvLocal uses). Falls back to the local default
 * (config.toml [api] port 54321) when status can't be read.
 * @returns {string}
 */
function readApiUrl() {
  const res = runCapture('npx', ['--yes', 'supabase', 'status', '-o', 'env'], {
    cwd: API_DIR,
    timeoutMs: 30000,
  });
  if (res.ok) {
    const m = res.stdout.match(/^\s*API_URL\s*=\s*"?(.*?)"?\s*$/m);
    if (m && m[1]) return m[1];
  }
  return DEFAULT_API_URL;
}

/**
 * Probe the Edge Functions runtime once. POSTs an intentionally-invalid body to
 * a known auth function: a healthy runtime validates and returns 400 (no user is
 * created — validation fails before any GoTrue call), while a dead runtime makes
 * the gateway answer 503. The pure pass/fail interpretation lives in
 * interpretEdgeProbe (dev-env.mjs); this only does the IO.
 * @param {string} fnUrl
 * @param {number} [timeoutMs]
 * @returns {Promise<import('./lib/dev-env.mjs').EdgeHealth>}
 */
async function probeEdgeOnce(fnUrl, timeoutMs = 8000) {
  if (typeof globalThis.fetch !== 'function') {
    // Node without global fetch — skip rather than break dev:full. (engines
    // requires Node >= 22, where fetch is always present, so this is belt-and-
    // braces for an unusually old runtime.)
    return { healthy: true, detail: 'probe skipped (no global fetch)' };
  }
  const controller = new globalThis.AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await globalThis.fetch(fnUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    });
    return interpretEdgeProbe({ status: res.status });
  } catch (err) {
    const code =
      err && err.name === 'AbortError'
        ? 'timeout'
        : err?.cause?.code || err?.code || err?.message || 'request failed';
    return interpretEdgeProbe({ errorCode: String(code) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Poll the Edge Functions runtime until it is healthy or the attempts run out.
 * Healthy responses return on the first attempt; the retry budget only elapses
 * when the runtime is down or still booting.
 * @param {string} fnUrl
 * @param {{attempts:number, delayMs:number}} budget
 * @returns {Promise<import('./lib/dev-env.mjs').EdgeHealth>}
 */
async function waitForEdgeHealth(fnUrl, { attempts, delayMs }) {
  let last = { healthy: false, detail: 'not probed' };
  for (let i = 1; i <= attempts; i++) {
    last = await probeEdgeOnce(fnUrl);
    if (last.healthy) return last;
    if (i < attempts) await sleep(delayMs);
  }
  return last;
}

/**
 * Stop the local Supabase stack so the next `supabase start` recreates its
 * containers from scratch. Never passes --volumes (that would wipe local data —
 * a human-gated operation); the database volume is preserved across the restart.
 * @returns {void}
 */
function stopSupabase() {
  const code = runInherit('npx', ['--yes', 'supabase', 'stop'], { cwd: API_DIR });
  if (code !== 0) {
    info('`supabase stop` returned a non-zero exit code — continuing to start anyway.');
  }
}

/**
 * The Supabase CLI project id (config.toml `project_id`). Every local container is
 * labelled `com.supabase.cli.project=<id>` and named `supabase_<svc>_<id>`, so this
 * is how container operations are scoped to THIS project. Falls back to the known
 * local default if config.toml can't be read.
 * @returns {string}
 */
function readSupabaseProjectId() {
  try {
    const toml = fs.readFileSync(path.join(API_DIR, 'supabase', 'config.toml'), 'utf8');
    const m = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
    if (m && m[1]) return m[1];
  } catch {
    // fall through to the default below
  }
  return 'finance-local';
}

/**
 * The worktree-unique tail of this checkout's functions path, e.g.
 *   /jrmoulckers-upgraded-robot/services/api/supabase/functions
 * Used to tell whether the running edge-runtime container is bind-mounted to THIS
 * worktree's functions or to a different/stale one — the shared `project_id`
 * cross-worktree trap, where one Docker stack is shared by every worktree and the
 * edge runtime stays bound to whichever worktree first ran `supabase start`.
 * @returns {string}
 */
function functionsTailNeedle() {
  const fnDir = path.join(API_DIR, 'supabase', 'functions').replace(/\\/g, '/').toLowerCase();
  const base = path.basename(REPO_ROOT).toLowerCase();
  const idx = fnDir.lastIndexOf(`/${base}/`);
  return idx >= 0 ? fnDir.slice(idx) : `/${base}/services/api/supabase/functions`;
}

/**
 * Inspect the edge-runtime container's functions bind-mount to see whether it
 * points at THIS worktree. Works on stopped containers too (`docker inspect`), so
 * it also catches a stopped stack bound to another worktree that `supabase start`
 * would otherwise restart in place. When the container or docker is unavailable it
 * reports `exists:false` (nothing stale to heal — `supabase start` will create it).
 * @param {string} projectId
 * @returns {{exists:boolean, source:string, matchesWorktree:boolean}}
 */
function inspectEdgeFunctionsMount(projectId) {
  const container = `supabase_edge_runtime_${projectId}`;
  const res = runCapture('docker', ['inspect', container], { timeoutMs: 20000 });
  if (!res.ok) return { exists: false, source: '', matchesWorktree: true };
  let mounts;
  try {
    mounts = JSON.parse(res.stdout)[0]?.Mounts ?? [];
  } catch {
    return { exists: false, source: '', matchesWorktree: true };
  }
  const fnMounts = mounts.filter(
    (m) => /functions/i.test(m.Source || '') || /functions/i.test(m.Destination || ''),
  );
  // A container with no functions mount cannot be serving this worktree's functions.
  if (fnMounts.length === 0) return { exists: true, source: '', matchesWorktree: false };
  const needle = functionsTailNeedle();
  const matchesWorktree = fnMounts.some((m) => {
    const s = String(m.Source || '')
      .replace(/\\/g, '/')
      .toLowerCase();
    const d = String(m.Destination || '')
      .replace(/\\/g, '/')
      .toLowerCase();
    return s.includes(needle) || d.includes(needle);
  });
  return {
    exists: true,
    source: fnMounts[0].Source || fnMounts[0].Destination || '',
    matchesWorktree,
  };
}

/**
 * Force-remove every container for this Supabase project (scoped by the
 * `com.supabase.cli.project` label). This is the part of the heal that `supabase
 * stop` alone does not reliably do across worktrees: it guarantees the stale
 * containers are gone so the next `supabase start` recreates them — and crucially
 * the edge-runtime functions bind-mount — bound to THIS worktree. Container removal
 * only: named data volumes are preserved (never passes `--volumes`/`-v`), so local
 * database state survives the heal.
 * @param {string} projectId
 * @returns {void}
 */
function forceRemoveProjectContainers(projectId) {
  const list = runCapture(
    'docker',
    ['ps', '-aq', '--filter', `label=com.supabase.cli.project=${projectId}`],
    { timeoutMs: 20000 },
  );
  if (!list.ok) {
    info('Could not list Supabase containers via docker — continuing to start anyway.');
    return;
  }
  const ids = list.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return;
  info(
    `Force-removing ${ids.length} "${projectId}" container(s) so the stack rebinds to THIS worktree…`,
  );
  info('(Containers only — named data volumes are preserved; --volumes is never used.)');
  runInherit('docker', ['rm', '-f', ...ids], { timeoutMs: 120000 });
}

/**
 * Heal a stale / cross-worktree Supabase stack: stop it gracefully, then
 * force-remove any container `supabase stop` left behind, so the next
 * `supabase start` recreates the stack (and its edge-runtime functions mount) bound
 * to THIS worktree. Data volumes are preserved throughout.
 * @param {string} projectId
 * @returns {void}
 */
function healStack(projectId) {
  stopSupabase();
  forceRemoveProjectContainers(projectId);
}

async function startSupabase() {
  step('Starting the local Supabase edge stack');

  const projectId = readSupabaseProjectId();
  const fnUrl = `${readApiUrl()}${FUNCTIONS_PROBE_PATH}`;
  const running = isSupabaseRunning();
  // Detect a container set bound to a DIFFERENT worktree (works on stopped
  // containers too), so the shared project_id cross-worktree trap is healed even
  // when the stale stack looks healthy or is merely stopped.
  const mount = inspectEdgeFunctionsMount(projectId);
  const boundElsewhere = mount.exists && !mount.matchesWorktree;

  if (opts.recreate) {
    if (running || mount.exists) {
      info('--recreate given — tearing the existing stack down for a clean restart…');
      healStack(projectId);
    }
  } else if (running) {
    info('Supabase is already running — checking the Edge Functions runtime…');
    const health = await waitForEdgeHealth(fnUrl, { attempts: 4, delayMs: 2000 });
    if (health.healthy && !boundElsewhere) {
      info(
        `Edge Functions runtime is healthy (probe: ${health.detail}). Reusing the running stack.`,
      );
      return;
    }
    if (boundElsewhere) {
      info('The running edge runtime is bound to a DIFFERENT worktree, so it serves that');
      info("worktree's functions (or none at all) — not this checkout's. Mounted path:");
      info(`    ${mount.source || '(no functions mount)'}`);
      info('This is the shared project_id cross-worktree trap (one Docker stack is shared by');
      info('every worktree). Recreating the stack bound to THIS worktree now…');
    } else {
      info(`Edge Functions runtime is UNHEALTHY (probe: ${health.detail}).`);
      info('A "running" stack with dead functions (every /functions/v1/* call 503s) is what a');
      info('stale or orphaned edge-runtime container causes — and a plain container restart does');
      info('not fix it. Recreating the stack to heal it now (your database volume is preserved)…');
    }
    healStack(projectId);
  } else if (boundElsewhere) {
    info('A stopped Supabase stack bound to a DIFFERENT worktree was found — a plain start would');
    info('restart those (wrong) containers in place. Mounted path:');
    info(`    ${mount.source || '(no functions mount)'}`);
    info('Removing it so the stack rebinds to THIS worktree on start…');
    healStack(projectId);
  }

  const maxAttempts = 3;
  let started = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    info(`supabase start (attempt ${attempt}/${maxAttempts})…`);
    const { code, output } = await runTee('npx', ['--yes', 'supabase', 'start'], { cwd: API_DIR });
    if (code === 0 || isSupabaseRunning()) {
      info('Supabase is up.');
      started = true;
      break;
    }

    // Work out *why* it failed instead of assuming a rate-limit. Terminal causes
    // (corrupt images, migration errors) are not worth retrying — fail fast with
    // the right fix so the developer doesn't wait out three pointless retries.
    const { kind, signal } = classifySupabaseStartFailure(output);

    if (kind === 'image') {
      fail(
        'supabase start failed: corrupt local Docker image layers.',
        dockerCorruptionRemedy(signal),
      );
    }
    if (kind === 'migration') {
      fail(
        'supabase start failed while applying migrations — a database/SQL error, not a transient issue.',
        'Find the "ERROR: … (SQLSTATE …)" line in the output above and fix that migration; retrying will not help. See docs/guides/full-stack-local.md.',
      );
    }

    if (attempt < maxAttempts) {
      const backoff = attempt * 15;
      if (kind === 'rate-limit') {
        info(`Docker registry pull limit ("${signal}"). Retrying in ${backoff}s…`);
        info('Tip: `docker login` raises Docker Hub pull limits.');
      } else {
        info(`supabase start failed (cause unclear from output). Retrying in ${backoff}s…`);
      }
      await sleep(backoff * 1000);
    }
  }

  if (!started) {
    fail(
      'Could not start Supabase after multiple attempts.',
      'Read the output above for the real cause. Common ones: Docker not running; a Docker Hub pull limit (`docker login`); or corrupt image layers (see the "exit 255 / exec format error" section in docs/guides/full-stack-local.md).',
    );
  }

  // The stack reports "up" as soon as Kong/Postgres bind, but the Edge Functions
  // runtime boots separately and can come up dead (the bug this guards against).
  // Verify it actually serves a function before we wire the web app to it, so a
  // broken runtime fails loudly here instead of silently breaking signup/login.
  step('Verifying the Edge Functions runtime');
  const health = await waitForEdgeHealth(fnUrl, { attempts: 20, delayMs: 3000 });
  if (!health.healthy) {
    fail(
      `Supabase started but its Edge Functions runtime is not serving requests (probe: ${health.detail}).`,
      [
        'Every /functions/v1/* call is failing, so edge auth (signup/login) will not work.',
        'Force-recreate the stack from scratch:',
        '  npm run dev:full -- --recreate',
        'If it persists, inspect the edge runtime logs:',
        `  docker logs supabase_edge_runtime_${projectId} --tail 50`,
        'See docs/guides/full-stack-local.md.',
      ].join('\n'),
    );
  }
  info(`Edge Functions runtime is healthy (probe: ${health.detail}).`);
}

// --- 3. Optional DB reset ----------------------------------------------------
function resetDatabase() {
  if (!opts.reset) return;
  step('Resetting the database (migrations + seed)');
  const code = runInherit('npx', ['--yes', 'supabase', 'db', 'reset'], { cwd: API_DIR });
  if (code !== 0)
    fail('Database reset failed.', 'Inspect the output above; ensure the stack is healthy.');
  info('Database reset complete.');
}

// --- 4. Write apps/web/.env.local --------------------------------------------
function writeEnvLocal() {
  step('Wiring the web app to the local stack (apps/web/.env.local)');
  const res = runCapture('npx', ['--yes', 'supabase', 'status', '-o', 'env'], {
    cwd: API_DIR,
    timeoutMs: 30000,
  });
  if (!res.ok) {
    fail(
      'Could not read `supabase status -o env`.',
      'Ensure the stack started cleanly, then re-run `npm run dev:full`.',
    );
  }

  /** @type {Record<string,string>} */
  const envMap = {};
  for (const line of res.stdout.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) envMap[m[1]] = m[2];
  }
  const apiUrl = envMap.API_URL || 'http://localhost:54321';
  const anonKey = envMap.ANON_KEY;
  if (!anonKey) {
    fail(
      'No anon key found in `supabase status` output.',
      'The stack may not be fully up. Re-run after it settles.',
    );
  }

  const contents = `# Generated by tools/dev-full.mjs — local full-stack (edge) profile.
# Points the web app at the local Supabase CLI stack so it exercises real edge
# auth (GoTrue + auth-* edge functions + Postgres/RLS) instead of demo mode.
# Safe to delete and regenerate: npm run dev:full
VITE_SUPABASE_URL=${apiUrl}
VITE_SUPABASE_ANON_KEY=${anonKey}
VITE_FUNCTIONS_PROXY_TARGET=${apiUrl}
`;
  fs.writeFileSync(WEB_ENV_LOCAL, contents, 'utf8');
  info(`Wrote ${path.relative(REPO_ROOT, WEB_ENV_LOCAL)} (VITE_SUPABASE_URL=${apiUrl}).`);
}

// --- 6. Open browser ---------------------------------------------------------
function openBrowser(url) {
  try {
    if (isWin) {
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Opening the browser is a convenience, never fatal.
  }
}

// --- 5. Launch web app (or live e2e) -----------------------------------------
function launchWeb() {
  if (opts.e2e) {
    step('Running the live e2e suite (edge auth → authenticated app)');
    const code = runInherit('npm', ['run', 'test:e2e:live', '-w', 'apps/web']);
    process.exit(code);
  }

  step('Launching the web app (http://localhost:5173)');
  info('Press Ctrl+C to stop the web app. The Supabase stack keeps running —');
  info('stop it later with: npm --prefix services/api run supabase:stop');

  const child = spawn('npm run dev -w apps/web', [], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
  });

  if (!opts.noOpen) {
    // Give Vite a moment to bind the port before opening the browser.
    setTimeout(() => openBrowser('http://localhost:5173'), 4000);
  }

  // Mirror the child's exit; forward Ctrl+C so the dev server shuts down cleanly.
  child.on('exit', (code) => process.exit(code ?? 0));
  const forward = () => child.kill('SIGINT');
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);
}

async function main() {
  console.log('Finance — local full-stack web e2e (on edge)');
  ensureDependencies();
  preflight();
  await startSupabase();
  resetDatabase();
  writeEnvLocal();
  launchWeb();
}

main().catch((err) => {
  fail(`Unexpected error: ${err?.message || err}`);
});
