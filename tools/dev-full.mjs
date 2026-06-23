#!/usr/bin/env node
// @ts-check
//
// dev-full.mjs — One command to run the Finance web app end-to-end on a real
// local edge backend (Supabase via Docker), the way a developer would.
//
// Suggested npm script: "dev:full": "node tools/dev-full.mjs"
//
// Pipeline:
//   1. Preflight (tools/doctor.mjs)            — skip with --skip-doctor
//   2. supabase start (services/api)           — skipped if already running;
//                                                retries with backoff on the
//                                                Docker Hub "Rate exceeded" stall
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
//   node tools/dev-full.mjs --e2e           # bring up stack, run the live e2e suite
//   node tools/dev-full.mjs --no-open       # don't auto-open the browser
//   node tools/dev-full.mjs --skip-doctor   # skip preflight (e.g. in CI)
//   node tools/dev-full.mjs --help
//
// Everything here is cross-platform Node (Windows / macOS / Linux) and uses
// `npx --yes supabase`, so no global Supabase CLI is required.

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(REPO_ROOT, 'services', 'api');
const WEB_ENV_LOCAL = path.join(REPO_ROOT, 'apps', 'web', '.env.local');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Finance — one-command local full-stack web e2e (on edge)

Brings up the local Supabase edge stack, wires the web app to it, and launches
the web app — a single command for the full developer loop.

Usage:
  node tools/dev-full.mjs [options]

Options:
  --reset         Reset the database (apply all migrations + seed) before launch.
  --e2e           Run the live Playwright e2e suite instead of the dev server.
  --no-open       Do not auto-open the browser (dev mode only).
  --skip-doctor   Skip the preflight health check.
  -h, --help      Show this help.

Requires Docker Desktop running. No global Supabase CLI needed (uses npx).`);
  process.exit(0);
}

const opts = {
  reset: args.includes('--reset'),
  e2e: args.includes('--e2e'),
  noOpen: args.includes('--no-open'),
  skipDoctor: args.includes('--skip-doctor'),
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
 * @param {{cwd?:string}} [options]
 * @returns {number} exit code
 */
function runInherit(cmd, cmdArgs, options = {}) {
  const r = resolve(cmd, cmdArgs);
  const res = spawnSync(r.command, r.args, {
    cwd: options.cwd || REPO_ROOT,
    stdio: 'inherit',
    shell: r.viaShell,
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

// --- 2. Supabase start (idempotent, with rate-limit backoff) -----------------
function isSupabaseRunning() {
  // `supabase status` exits 0 and prints "API URL" only when the stack is up.
  const res = runCapture('npx', ['--yes', 'supabase', 'status'], {
    cwd: API_DIR,
    timeoutMs: 30000,
  });
  return res.ok && /API URL/i.test(res.stdout);
}

async function startSupabase() {
  step('Starting the local Supabase edge stack');
  if (isSupabaseRunning()) {
    info('Supabase is already running — reusing it.');
    return;
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    info(`supabase start (attempt ${attempt}/${maxAttempts})…`);
    const code = runInherit('npx', ['--yes', 'supabase', 'start'], { cwd: API_DIR });
    if (code === 0 || isSupabaseRunning()) {
      info('Supabase is up.');
      return;
    }
    if (attempt < maxAttempts) {
      const backoff = attempt * 15;
      info(
        `supabase start failed (often a Docker Hub "Rate exceeded" pull limit). Retrying in ${backoff}s…`,
      );
      info('If this keeps failing, run `docker login` to raise the pull limit.');
      await sleep(backoff * 1000);
    }
  }
  fail(
    'Could not start Supabase after multiple attempts.',
    'Check Docker is running and has disk/quota. Try `docker login` for Docker Hub rate limits, then re-run. See docs/guides/full-stack-local.md.',
  );
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
  preflight();
  await startSupabase();
  resetDatabase();
  writeEnvLocal();
  launchWeb();
}

main().catch((err) => {
  fail(`Unexpected error: ${err?.message || err}`);
});
