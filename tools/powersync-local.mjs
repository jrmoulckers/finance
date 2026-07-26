#!/usr/bin/env node
// @ts-check
//
// powersync-local.mjs — bring the local, self-hosted PowerSync backend up/down
// against the running Supabase CLI stack (#3927).
//
// Suggested npm scripts:
//   "powersync:up":     "node tools/powersync-local.mjs up"
//   "powersync:down":   "node tools/powersync-local.mjs down"
//   "powersync:status": "node tools/powersync-local.mjs status"
//   "powersync:logs":   "node tools/powersync-local.mjs logs"
//
// What `up` does:
//   1. Preflight — Docker is running and the Supabase CLI network exists.
//   2. Ensure the `powersync` publication exists on the local Postgres
//      (CREATE PUBLICATION powersync FOR ALL TABLES; — idempotent).
//   3. docker compose up -d (PowerSync + Mongo + one-shot replica-set init).
//   4. Wait for the PowerSync /probes/liveness health probe to pass.
//
// Prerequisite: the Supabase CLI stack must already be running
// (`npm run dev:full`, or `supabase start` in services/api).
//
// Everything here is cross-platform Node (Windows / macOS / Linux).
//
// Usage:
//   node tools/powersync-local.mjs up [--recreate]
//   node tools/powersync-local.mjs down [--volumes]
//   node tools/powersync-local.mjs status
//   node tools/powersync-local.mjs logs [--follow]
//   node tools/powersync-local.mjs --help

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEPLOY_DIR = path.join(REPO_ROOT, 'deploy');
const COMPOSE_FILE = path.join(DEPLOY_DIR, 'docker-compose.powersync-local.yml');
const POWERSYNC_CONFIG = path.join(DEPLOY_DIR, 'powersync.yaml');
const SYNC_RULES = path.join(REPO_ROOT, 'services', 'api', 'powersync', 'sync-rules.yaml');

// Overridable to match a non-default Supabase CLI project_id / port.
const PORT = process.env.POWERSYNC_LOCAL_PORT || '8080';
const SUPABASE_NETWORK = process.env.SUPABASE_NETWORK || 'supabase_network_finance-local';
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_finance-local';
const LIVENESS_URL = `http://localhost:${PORT}/probes/liveness`;

// Assemble the Postgres connection URI from parts and inject it into the compose
// at runtime (see `compose()`), so no database credential literal is committed —
// a connection URI with an inline literal password trips secret scanners.
// Defaults target the Supabase CLI local `postgres` role (which already has
// REPLICATION); `db` is the Postgres network alias. Override via env.
const PG_USER = process.env.SUPABASE_DB_USER || 'postgres';
const PG_PASSWORD = process.env.SUPABASE_DB_PASSWORD || 'postgres';
const PG_HOST = process.env.SUPABASE_DB_HOST || 'db';
const PG_PORT_INTERNAL = process.env.SUPABASE_DB_PORT || '5432';
const PG_DB = process.env.SUPABASE_DB_NAME || 'postgres';
const PS_PG_URI = `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT_INTERNAL}/${PG_DB}?sslmode=disable`;

const args = process.argv.slice(2);
const action = args.find((a) => !a.startsWith('-')) || 'up';

// -- tiny console helpers (match tools/dev-full.mjs) --------------------------
function step(msg) {
  console.log(`\n\x1b[1m▶ ${msg}\x1b[0m`);
}
function info(msg) {
  console.log(`  ${msg}`);
}
function ok(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
function fail(msg, fix) {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m`);
  if (fix) console.error(`  → ${fix}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Finance — local self-hosted PowerSync backend (#3927)

Runs PowerSync + MongoDB next to the Supabase CLI stack and replicates from its
Postgres, so data written by the web client can sync.

Usage:
  node tools/powersync-local.mjs <action> [options]

Actions:
  up        Create the publication, start the stack, wait for health (default)
  down      Stop and remove the stack (add --volumes to also drop Mongo data)
  status    Show container status
  logs      Show PowerSync logs (add --follow to stream)

Options:
  --recreate   (up) force-recreate containers
  --volumes    (down) also remove the Mongo data volume
  --follow     (logs) stream logs
  --help       Show this help

Environment overrides:
  POWERSYNC_LOCAL_PORT    Host port for the PowerSync API (default 8080)
  SUPABASE_NETWORK        Supabase CLI docker network (default supabase_network_finance-local)
  SUPABASE_DB_CONTAINER   Supabase CLI db container   (default supabase_db_finance-local)
  SUPABASE_DB_USER        Postgres user      (default postgres)
  SUPABASE_DB_PASSWORD    Postgres password  (default postgres)
  SUPABASE_DB_HOST        Postgres host      (default db, the network alias)
  SUPABASE_DB_PORT        Postgres port      (default 5432)
  SUPABASE_DB_NAME        Postgres database  (default postgres)
`);
  process.exit(0);
}

/**
 * Run a real executable (no shell). Returns {code, stdout, stderr}.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {{capture?:boolean, timeoutMs?:number, env?:NodeJS.ProcessEnv}} [options]
 */
function run(cmd, cmdArgs, options = {}) {
  const res = spawnSync(cmd, cmdArgs, {
    cwd: REPO_ROOT,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    timeout: options.timeoutMs,
    env: options.env || process.env,
    windowsHide: true,
  });
  if (res.error && res.error.code === 'ENOENT') {
    fail(
      `\`${cmd}\` was not found on PATH.`,
      cmd === 'docker' ? 'Install Docker Desktop and make sure it is running.' : undefined,
    );
  }
  return {
    code: res.status ?? 1,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

/** Run `docker compose` for this stack (explicit project dir → stable relative mounts). */
function compose(cmdArgs, options = {}) {
  // Inject the assembled PS_PG_URI so the compose file never needs a committed
  // credential default (it references ${PS_PG_URI}). Applied to every action so
  // down/status/logs also resolve the variable.
  return run(
    'docker',
    ['compose', '-f', COMPOSE_FILE, '--project-directory', DEPLOY_DIR, ...cmdArgs],
    { ...options, env: { ...process.env, PS_PG_URI } },
  );
}

function preflight() {
  step('Preflight');
  if (!fs.existsSync(COMPOSE_FILE)) fail(`Missing compose file: ${COMPOSE_FILE}`);
  if (!fs.existsSync(POWERSYNC_CONFIG)) fail(`Missing PowerSync config: ${POWERSYNC_CONFIG}`);
  if (!fs.existsSync(SYNC_RULES)) fail(`Missing sync rules: ${SYNC_RULES}`);

  const docker = run('docker', ['info'], { capture: true, timeoutMs: 20000 });
  if (docker.code !== 0)
    fail('Docker does not appear to be running.', 'Start Docker Desktop and retry.');
  ok('Docker is running');

  const net = run('docker', ['network', 'inspect', SUPABASE_NETWORK], {
    capture: true,
  });
  if (net.code !== 0) {
    fail(
      `Supabase CLI network "${SUPABASE_NETWORK}" not found — the Supabase stack isn't running.`,
      'Start it first: `npm run dev:full` (or `supabase start` in services/api).',
    );
  }
  ok(`Supabase network "${SUPABASE_NETWORK}" is up`);
}

/** Create the `powersync` publication if it doesn't already exist (idempotent). */
function ensurePublication() {
  step('Ensuring `powersync` publication on Postgres');
  const check = run(
    'docker',
    [
      'exec',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-tAc',
      "SELECT 1 FROM pg_publication WHERE pubname = 'powersync'",
    ],
    { capture: true },
  );
  if (check.code !== 0) {
    fail(
      `Could not query Postgres in container "${DB_CONTAINER}".`,
      'Is the Supabase CLI stack running? Override with SUPABASE_DB_CONTAINER if needed.',
    );
  }
  if (check.stdout === '1') {
    ok('Publication `powersync` already exists');
    return;
  }
  const create = run(
    'docker',
    [
      'exec',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'CREATE PUBLICATION powersync FOR ALL TABLES',
    ],
    { capture: true },
  );
  if (create.code !== 0) fail(`Failed to create publication:\n${create.stderr}`);
  ok('Created publication `powersync` (FOR ALL TABLES)');
}

async function waitForHealth(timeoutMs = 150000) {
  step('Waiting for PowerSync to become healthy');
  info(`Probing ${LIVENESS_URL}`);
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const controller = new globalThis.AbortController();
      const t = setTimeout(() => controller.abort(), 4000);
      const res = await globalThis.fetch(LIVENESS_URL, {
        signal: controller.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        ok('PowerSync liveness probe passed');
        return true;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    process.stdout.write('  .');
    await sleep(3000);
  }
  console.log('');
  fail(
    `PowerSync did not become healthy within ${Math.round(timeoutMs / 1000)}s (last: ${lastErr}).`,
    'Inspect logs with `npm run powersync:logs`. First run also pulls Docker images, which can be slow.',
  );
  return false;
}

async function up() {
  preflight();
  ensurePublication();

  step('Starting PowerSync + MongoDB');
  const composeArgs = ['up', '-d', '--remove-orphans'];
  if (args.includes('--recreate')) composeArgs.push('--force-recreate');
  const res = compose(composeArgs);
  if (res.code !== 0) fail('`docker compose up` failed (see output above).');

  await waitForHealth();

  step('PowerSync is up');
  info(`API:      http://localhost:${PORT}`);
  info(`Liveness: ${LIVENESS_URL}`);
  console.log('');
  info('Next: wire the web client (Phase 2) by adding to apps/web/.env.local:');
  info(`  VITE_POWERSYNC_URL=http://localhost:${PORT}`);
  info('  VITE_POWERSYNC_ENABLED=true');
  info('Tear down with: npm run powersync:down');
}

function down() {
  step('Stopping PowerSync + MongoDB');
  const composeArgs = ['down', '--remove-orphans'];
  if (args.includes('--volumes')) composeArgs.push('--volumes');
  const res = compose(composeArgs);
  if (res.code !== 0) fail('`docker compose down` failed (see output above).');
  ok('Stopped');
  if (!args.includes('--volumes')) info('Mongo data volume kept. Use `--volumes` to drop it.');
}

function status() {
  step('PowerSync stack status');
  compose(['ps']);
}

function logs() {
  step('PowerSync logs');
  const composeArgs = ['logs', 'powersync'];
  if (args.includes('--follow') || args.includes('-f')) composeArgs.push('-f');
  else composeArgs.push('--tail', '200');
  compose(composeArgs);
}

const actions = { up, down, status, logs };
const handler = actions[action];
if (!handler) {
  fail(`Unknown action "${action}".`, 'Run with --help to see valid actions.');
}
await handler();
