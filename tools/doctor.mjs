#!/usr/bin/env node
// @ts-check
//
// doctor.mjs — Preflight health check for local full-stack web-on-edge dev.
//
// Suggested npm script: "doctor": "node tools/doctor.mjs"
//
// Verifies the conditions that actually break `supabase start` + `vite` — the
// real-world failures we hit bringing the stack up on a fresh machine:
//   - Docker daemon reachable (installed AND running, not wedged)
//   - Enough free disk to extract the Supabase images (the #1 silent killer)
//   - Required ports free (54321 Supabase API gateway, 5173 Vite dev server)
//   - Supabase CLI resolvable (global or via npx)
// It also prints the Docker Hub anonymous-pull rate-limit tip, since that is the
// other thing that stalls a cold `supabase start`.
//
// Usage:
//   node tools/doctor.mjs              # human-readable report
//   node tools/doctor.mjs --json       # machine-readable JSON report
//   node tools/doctor.mjs --quiet      # only print warnings/failures
//   node tools/doctor.mjs --min-disk-gb=30   # override the recommended-disk threshold
//   node tools/doctor.mjs --help
//
// Exit code: 0 when every hard check passes (warnings allowed); 1 when any hard
// check fails. Safe to call from other scripts (dev-full.mjs runs it first).

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { dependencyState } from './lib/dev-env.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Finance — local full-stack dev preflight (doctor)

Checks the host for everything needed to run the web app against a real local
edge backend (Supabase via Docker) before you start it.

Usage:
  node tools/doctor.mjs [options]

Options:
  --json              Emit a JSON report instead of human-readable text.
  --quiet             Only print warnings and failures (hide passing checks).
  --min-disk-gb=<n>   Recommended free-disk threshold in GB (default 30; the
                      hard-fail floor stays at 10 GB).
  -h, --help          Show this help.

Exit code: 0 if all hard checks pass, 1 otherwise.`);
  process.exit(0);
}

const asJson = args.includes('--json');
const quiet = args.includes('--quiet');
const minDiskArg = args.find((a) => a.startsWith('--min-disk-gb='));
const RECOMMENDED_DISK_GB = minDiskArg ? Number(minDiskArg.split('=')[1]) : 30;
const CRITICAL_DISK_GB = 10; // below this, image extraction reliably fails

const GB = 1024 * 1024 * 1024;

/** @typedef {{name:string, level:'pass'|'warn'|'fail', detail:string, fix?:string}} Check */
/** @type {Check[]} */
const checks = [];

/**
 * Run a command with a hard timeout; never throws.
 * npm/npx are `.cmd` shims on Windows and need a shell; passing them as a single
 * joined string (rather than command + args array) avoids the DEP0190
 * shell-args deprecation warning. Everything else runs without a shell.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {number} timeoutMs
 * @returns {{ok:boolean, stdout:string, stderr:string, timedOut:boolean, code:number|null}}
 */
function run(cmd, cmdArgs, timeoutMs) {
  const viaShell = cmd === 'npx' || cmd === 'npm';
  const res = viaShell
    ? spawnSync([cmd, ...cmdArgs].join(' '), {
        timeout: timeoutMs,
        encoding: 'utf8',
        shell: true,
        windowsHide: true,
      })
    : spawnSync(cmd, cmdArgs, {
        timeout: timeoutMs,
        encoding: 'utf8',
        windowsHide: true,
      });
  return {
    ok: res.status === 0 && !res.error,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    timedOut: res.error?.code === 'ETIMEDOUT' || res.signal === 'SIGTERM',
    code: res.status,
  };
}

/**
 * Is a TCP port already bound on localhost?
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function portInUse(port) {
  return new Promise((resolve) => {
    const server = net
      .createServer()
      .once('error', (err) => {
        resolve(/** @type {NodeJS.ErrnoException} */ (err).code === 'EADDRINUSE');
      })
      .once('listening', () => {
        server.close(() => resolve(false));
      })
      .listen(port, '127.0.0.1');
  });
}

/** Best-effort free bytes on the volume that holds Docker's data. */
function freeDiskBytes() {
  // Docker Desktop stores its VM disk under LOCALAPPDATA on Windows; on
  // macOS/Linux the daemon root lives on the same volume as $HOME in the
  // common case. Checking that volume is the right signal for image pulls.
  const probe =
    process.platform === 'win32' ? process.env.LOCALAPPDATA || os.homedir() : os.homedir();
  try {
    // fs.statfsSync is available on Node 18.15+ (present on this repo's Node 22+).
    const stat = fs.statfsSync(probe);
    return { bytes: stat.bsize * stat.bavail, volume: path.parse(probe).root || probe };
  } catch {
    return { bytes: null, volume: path.parse(probe).root || probe };
  }
}

function add(name, level, detail, fix) {
  checks.push({ name, level, detail, ...(fix ? { fix } : {}) });
}

// --- Check: Docker daemon ----------------------------------------------------
function checkDocker() {
  const version = run('docker', ['--version'], 8000);
  if (!version.ok) {
    add(
      'Docker installed',
      'fail',
      'The `docker` command was not found on PATH.',
      'Install Docker Desktop: https://www.docker.com/products/docker-desktop/',
    );
    return;
  }
  add('Docker installed', 'pass', version.stdout);

  // `docker info` is what hangs when the daemon is wedged — the timeout turns
  // that hang into a clear failure instead of a stuck preflight.
  const info = run('docker', ['info', '--format', '{{.ServerVersion}}'], 20000);
  if (info.ok && info.stdout) {
    add('Docker daemon running', 'pass', `server ${info.stdout}`);
  } else if (info.timedOut) {
    add(
      'Docker daemon running',
      'fail',
      'Docker daemon did not respond within 20s (likely starting or wedged).',
      'Open Docker Desktop and wait for "Engine running", then retry. If it stays stuck, restart Docker Desktop.',
    );
  } else {
    add(
      'Docker daemon running',
      'fail',
      'Docker is installed but the daemon is not reachable.',
      'Start Docker Desktop (or `sudo systemctl start docker` on Linux), then retry.',
    );
  }
}

// --- Check: free disk --------------------------------------------------------
function checkDisk() {
  const { bytes, volume } = freeDiskBytes();
  if (bytes == null) {
    add(
      'Free disk space',
      'warn',
      `Could not determine free space on ${volume}.`,
      `Ensure at least ${RECOMMENDED_DISK_GB} GB is free for the Supabase images.`,
    );
    return;
  }
  const gb = bytes / GB;
  const human = `${gb.toFixed(1)} GB free on ${volume}`;
  if (gb < CRITICAL_DISK_GB) {
    add(
      'Free disk space',
      'fail',
      `${human} — below the ${CRITICAL_DISK_GB} GB floor; Supabase image extraction will fail.`,
      `Free up disk (target ≥ ${RECOMMENDED_DISK_GB} GB). Reclaim Docker space with \`docker system prune -a\` (removes unused images/containers — review first).`,
    );
  } else if (gb < RECOMMENDED_DISK_GB) {
    add(
      'Free disk space',
      'warn',
      `${human} — below the recommended ${RECOMMENDED_DISK_GB} GB; a cold image pull may run tight.`,
      'Free some space or run `docker system prune` if a pull fails midway.',
    );
  } else {
    add('Free disk space', 'pass', human);
  }
}

// --- Check: ports ------------------------------------------------------------
async function checkPorts() {
  const ports = [
    { port: 54321, who: 'Supabase API gateway' },
    { port: 5173, who: 'Vite dev server' },
  ];
  for (const { port, who } of ports) {
    const busy = await portInUse(port);
    if (busy) {
      add(
        `Port ${port} free`,
        'warn',
        `Port ${port} (${who}) is already in use — the stack may already be running, or another process holds it.`,
        `If this is a stale process, stop it. Supabase: \`npm --prefix services/api run supabase:stop\`. Vite: stop the other dev server.`,
      );
    } else {
      add(`Port ${port} free`, 'pass', `${who} port is available`);
    }
  }
}

// --- Check: Supabase CLI -----------------------------------------------------
function checkSupabaseCli() {
  const global = run('supabase', ['--version'], 8000);
  if (global.ok && global.stdout) {
    add('Supabase CLI', 'pass', `global supabase ${global.stdout}`);
    return;
  }
  // No global CLI — confirm npx can resolve a cached copy. We use --no-install
  // so this stays fast; if absent, dev-full's `npx --yes` will fetch it.
  const viaNpx = run('npx', ['--no-install', 'supabase', '--version'], 12000);
  if (viaNpx.ok && viaNpx.stdout) {
    add('Supabase CLI', 'pass', `via npx (cached): ${viaNpx.stdout}`);
  } else {
    add(
      'Supabase CLI',
      'warn',
      'No global Supabase CLI and none cached for npx.',
      'No action needed — `npm run dev:full` runs `npx --yes supabase`, which downloads and caches it on first use.',
    );
  }
}

// --- Check: dependencies installed -------------------------------------------
function checkDependencies() {
  const { state, reason } = dependencyState(REPO_ROOT);
  if (state === 'missing') {
    add(
      'Dependencies installed',
      'warn',
      reason || 'node_modules is missing (fresh clone).',
      'Run `npm install`. `npm run dev:full` and VS Code F5 do this automatically on first run.',
    );
    return;
  }
  if (state === 'stale') {
    add(
      'Dependencies installed',
      'warn',
      reason || 'dependencies may be stale.',
      'Run `npm install` (or `npm run dev:full`, which reinstalls automatically when the lockfile changes).',
    );
    return;
  }
  add('Dependencies installed', 'pass', 'node_modules present');
}

async function main() {
  checkDocker();
  checkDisk();
  await checkPorts();
  checkSupabaseCli();
  checkDependencies();

  const failed = checks.filter((c) => c.level === 'fail');
  const warned = checks.filter((c) => c.level === 'warn');
  const ok = failed.length === 0;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok,
          summary: {
            pass: checks.filter((c) => c.level === 'pass').length,
            warn: warned.length,
            fail: failed.length,
          },
          checks,
          thresholds: { criticalDiskGb: CRITICAL_DISK_GB, recommendedDiskGb: RECOMMENDED_DISK_GB },
        },
        null,
        2,
      ),
    );
    process.exit(ok ? 0 : 1);
  }

  const icon = { pass: '✓', warn: '!', fail: '✗' };
  console.log('\nFinance — local full-stack dev preflight (doctor)\n');
  for (const c of checks) {
    if (quiet && c.level === 'pass') continue;
    console.log(`  ${icon[c.level]} ${c.name}: ${c.detail}`);
    if (c.fix && c.level !== 'pass') console.log(`      → ${c.fix}`);
  }

  console.log(
    `\n  ${checks.filter((c) => c.level === 'pass').length} passed, ${warned.length} warning(s), ${failed.length} failure(s)`,
  );

  // Always surface the rate-limit tip — it is the other cold-start stall and is
  // not detectable without actually pulling.
  console.log(
    '\n  Tip: if `supabase start` stalls on "Rate exceeded", run `docker login`\n' +
      '       (anonymous Docker Hub pulls are rate-limited).',
  );

  if (ok) {
    console.log('\n  Ready. Start the full stack with:  npm run dev:full\n');
  } else {
    console.log('\n  Fix the ✗ failures above, then re-run:  npm run doctor\n');
  }
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('doctor: unexpected error —', err?.message || err);
  process.exit(1);
});
