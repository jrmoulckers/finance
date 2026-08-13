#!/usr/bin/env node
/**
 * Run every tool test file, enumerating the population explicitly.
 *
 * This exists because tool tests were previously reachable only by individually registering each
 * one as a `package.json` script *and* adding a matching workflow step. Under that scheme a new
 * test file defaults to **unenforced**, and the default held: 270 of 472 tool tests were run by no
 * workflow, including the suite for a checker that is itself a required gate. The gate was
 * enforced; the gate's correctness was not.
 *
 * The population is enumerated from disk rather than passed as a shell glob, because a glob that
 * matches nothing exits zero and produces a green step over an empty population -- a check that
 * cannot fail is indistinguishable from one that passes. `assertPopulation` makes that state loud.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const TOOLS_DIR = 'tools';

/**
 * List every tool test file.
 *
 * @param {string} [dir] Directory to scan.
 * @param {{readdirSync: Function}} [fsImpl] Injectable fs for tests.
 * @returns {string[]} Paths, sorted.
 */
export function testFiles(dir = TOOLS_DIR, fsImpl = fs) {
  return fsImpl
    .readdirSync(dir)
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
    .map((f) => path.join(dir, f));
}

/**
 * Refuse to report success over an empty population.
 *
 * @param {string[]} files Discovered test files.
 * @throws {Error} When no test file was found.
 */
export function assertPopulation(files) {
  if (files.length === 0) {
    throw new Error(
      `no *.test.mjs found under ${TOOLS_DIR}/ -- refusing to exit zero over an empty population`,
    );
  }
}

/**
 * Describe the run.
 *
 * @param {string[]} files Discovered test files.
 * @returns {string[]} Report lines.
 */
export function reportLines(files) {
  return [
    `tool test files discovered  ${files.length}`,
    `  enumerated from ${TOOLS_DIR}/ on disk, not from a shell glob`,
  ];
}

function main() {
  const files = testFiles();
  assertPopulation(files);
  for (const line of reportLines(files)) console.log(line);
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && process.argv[1].endsWith('run-tool-tests.mjs')) {
  main();
}
