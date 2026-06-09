#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const PLACEHOLDERS = ['https://placeholder.supabase.co', 'placeholder-anon-key'];
const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);

const args = process.argv.slice(2);
const checkEnv = args.includes('--check-env');
const paths = args.filter((arg) => arg !== '--check-env');
const distDir = resolve(process.cwd(), paths[0] ?? 'apps/web/dist');
const errors = [];

if (checkEnv) {
  for (const name of REQUIRED_ENV) {
    const value = process.env[name]?.trim();
    if (!value) {
      errors.push(`${name} is required for production web builds.`);
      continue;
    }

    if (PLACEHOLDERS.some((placeholder) => value.includes(placeholder))) {
      errors.push(`${name} must not use a placeholder value.`);
    }
  }
}

if (!existsSync(distDir)) {
  errors.push(`Build output directory does not exist: ${distDir}`);
} else {
  for (const file of walk(distDir)) {
    const content = readFileSync(file, 'utf8');
    for (const placeholder of PLACEHOLDERS) {
      if (content.includes(placeholder)) {
        errors.push(
          `Built bundle contains placeholder ${JSON.stringify(placeholder)} in ${relative(process.cwd(), file)}`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`::error::${error}`);
  }
  process.exit(1);
}

console.log('Verified web build env: no Supabase placeholder values found.');

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      yield* walk(path);
      continue;
    }

    if (stats.isFile() && isTextAsset(path)) {
      yield path;
    }
  }
}

function isTextAsset(path) {
  const lower = path.toLowerCase();
  for (const ext of TEXT_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }
  return false;
}
