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
 * Names a test fixture leaves behind when a run dies before its cleanup.
 *
 * Test fixtures are written into the working tree because several tools only observe files git
 * or a directory walk can see. A run killed between the write and the `finally` leaves them, and
 * the polarity is the defect: the leaking run exits green while every later run fails (#4308).
 */
export const ARTIFACT_PATTERN = /^PROBE-/;

/**
 * List leaked test artifacts under the repository root and the directories fixtures are written to.
 *
 * @param {{readdirSync: Function}} [fsImpl] Injectable fs.
 * @returns {string[]} Repo-relative paths, sorted.
 */
export function leakedArtifacts(fsImpl = fs) {
  const found = [];
  for (const dir of ['.', path.join('docs', 'ops')]) {
    let entries;
    try {
      entries = fsImpl.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (ARTIFACT_PATTERN.test(name)) found.push(dir === '.' ? name : path.join(dir, name));
    }
  }
  return found.sort();
}

/**
 * Build the message for leaked artifacts, distinguishing inherited from self-inflicted.
 *
 * A leak inherited from an earlier run and a leak this run created call for different actions, and
 * reporting them identically is what made the original latch hard to read: five assertions about
 * citation-ownership rules failed and nothing named the three stray files responsible.
 *
 * @param {string[]} files Leaked paths.
 * @param {'before' | 'after'} phase When they were observed.
 * @returns {string} Diagnostic message.
 */
export function leakLines(files, phase) {
  const list = files.map((f) => `  ${f}`).join('\n');
  if (phase === 'before') {
    return (
      `stale test artifact(s) present before the suite started:\n${list}\n` +
      'A previous run was killed before its cleanup. Delete these and re-run; they make\n' +
      'unrelated assertions fail and are not reported by the run that created them.'
    );
  }
  return (
    `test artifact(s) left behind by this run:\n${list}\n` +
    'The run that leaks is the run that must fail -- otherwise the next run inherits a red\n' +
    'suite and a diagnosis that names the wrong tests.'
  );
}

/**
 * List every tool test file, at any depth.
 *
 * Discovery was `readdirSync` on the top level only, so a test placed in a `tools/` subdirectory
 * would run nowhere while looking exactly like a test that runs. Measured before changing it:
 * **0** subdirectory test files existed, so recursion is inert on today's tree and the suite count
 * must be unchanged by this edit -- which is what makes the change verifiable rather than merely
 * plausible. The hazard it removes is prospective: the first shared module under `tools/lib/`
 * arrives with this PR.
 *
 * `withFileTypes` rather than a stat per entry, and directories are walked in sorted order so the
 * whole listing stays deterministic and therefore diffable.
 *
 * @param {string} [dir] Directory to scan.
 * @param {{readdirSync: Function}} [fsImpl] Injectable fs for tests.
 * @returns {string[]} Paths, sorted, depth-first.
 */
export function testFiles(dir = TOOLS_DIR, fsImpl = fs) {
  const entries = fsImpl.readdirSync(dir, { withFileTypes: true });
  const found = [];
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      found.push(...testFiles(full, fsImpl));
    } else if (entry.name.endsWith('.test.mjs')) {
      found.push(full);
    }
  }
  return found;
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

  const stale = leakedArtifacts();
  if (stale.length > 0) {
    console.error(leakLines(stale, 'before'));
    process.exitCode = 1;
    return;
  }

  for (const line of reportLines(files)) console.log(line);
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });

  const leaked = leakedArtifacts();
  if (leaked.length > 0) {
    console.error(`\n${leakLines(leaked, 'after')}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && process.argv[1].endsWith('run-tool-tests.mjs')) {
  main();
}
