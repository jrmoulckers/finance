#!/usr/bin/env node
// @ts-check
//
// Usage:
//   node tools/check-runtime-node-version.mjs
//   node tools/check-runtime-node-version.mjs --help
//
// Exits non-zero when the running Node major differs from `.nvmrc`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareNodeMajor } from './lib/node-runtime.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Finance — Node runtime version check

Verifies that the running Node major matches the version declared by .nvmrc.
Matching versions produce no output; mismatches fail with setup guidance.

Usage:
  node tools/check-runtime-node-version.mjs`);
  process.exit(0);
}

let nvmrc;
try {
  nvmrc = fs.readFileSync(path.join(REPO_ROOT, '.nvmrc'), 'utf8');
} catch (error) {
  console.error(`Could not read .nvmrc: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const result = compareNodeMajor(nvmrc, process.versions.node);
if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}
