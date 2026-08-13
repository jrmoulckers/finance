#!/usr/bin/env node
/**
 * Run the vendored citation checker and, on failure, append the resolution context it
 * omits: which checker version ran, which index it resolved against, whether that index
 * is pinned, and how to find out if a newer one exists.
 *
 * The wrapper adds no checks and changes no verdict. It passes every argument through,
 * streams the checker's own output unmodified, and exits with the checker's exit code.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { contextLines, extractIndexUrl } from './citations-context.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = path.join(repoRoot, 'config', 'engineering', 'citations', 'check-citations.mjs');
const LOCK = path.join(repoRoot, 'engineering-configs.lock.json');

/** Ask the checker its version rather than reading it out of the source. */
function checkerVersion() {
  const probe = spawnSync(process.execPath, [CHECKER, '--version'], { encoding: 'utf8' });
  if (probe.status !== 0) return null;
  return (probe.stdout ?? '').trim() || null;
}

/** Read the recorded vendor pin, which is the version of the authority this repo agreed to. */
function vendorPin() {
  try {
    return JSON.parse(readFileSync(LOCK, 'utf8')).ref ?? null;
  } catch {
    return null;
  }
}

const result = spawnSync(process.execPath, [CHECKER, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (result.status !== 0) {
  let source;
  try {
    source = readFileSync(CHECKER, 'utf8');
  } catch {
    source = '';
  }
  const { url, matches } = extractIndexUrl(source);
  const lines = contextLines({
    version: checkerVersion(),
    url,
    matches,
    pin: vendorPin(),
  });
  console.error('');
  for (const line of lines) console.error(line);
}

process.exit(result.status ?? 1);
