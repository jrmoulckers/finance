#!/usr/bin/env node
/**
 * Usage: npm run node:version:check
 *
 * Fails when a workflow pins a Node major that disagrees with `.nvmrc`.
 *
 * `.nvmrc` is the repository's declared runtime, but no workflow reads it --
 * every `setup-node` step restates the major as a literal. The literals and
 * `.nvmrc` therefore agree by maintenance rather than by construction, and a
 * change to one leaves the others silently behind. This check makes that
 * disagreement expressible, which is the precondition for noticing it.
 *
 * Fatal findings are limited to disagreements a local edit causes. Conditions
 * an outside change can create -- an `engines` range that admits majors above
 * `.nvmrc`, or a developer runtime ahead of it -- are reported as notices and
 * do not fail the check.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowDirectory = join(repositoryRoot, '.github', 'workflows');

/** Reads the major version declared by `.nvmrc` text, or null when absent. */
export function parseNvmrc(text) {
  const match = String(text ?? '')
    .trim()
    .match(/^v?(\d+)/);
  return match ? match[1] : null;
}

/**
 * Collects Node runtime pins from workflow text.
 *
 * The `^\s*` anchor keeps commented-out examples out of the result: a line
 * whose first non-space character is `#` cannot reach the key.
 */
export function findNodeVersionPins(text) {
  const pins = [];
  const lines = String(text ?? '').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const literal = line.match(/^\s*(?:-\s*)?node-version:\s*['"]?([^\s'"#]+)/);
    if (literal) {
      pins.push({ kind: 'literal', value: literal[1], line: index + 1 });
      continue;
    }
    const fromFile = line.match(/^\s*(?:-\s*)?node-version-file:\s*['"]?([^\s'"#]+)/);
    if (fromFile) {
      pins.push({ kind: 'file', value: fromFile[1], line: index + 1 });
    }
  }
  return pins;
}

/** Extracts the major from a `setup-node` version literal such as `22.11.0`. */
export function pinMajor(value) {
  const match = String(value ?? '').match(/^v?(\d+)/);
  return match ? match[1] : null;
}

/**
 * Reports literals whose major disagrees with `.nvmrc`.
 *
 * A `node-version-file` pin is single-sourced and never reported. A literal
 * whose major cannot be read (`lts/*`, an expression) is left undecided rather
 * than reported, so an unparsed form stays silent instead of failing a tree the
 * check cannot judge.
 */
export function findNodeVersionMismatches(file, text, expectedMajor) {
  if (!expectedMajor) return [];
  const violations = [];
  for (const pin of findNodeVersionPins(text)) {
    if (pin.kind !== 'literal') continue;
    const major = pinMajor(pin.value);
    if (major === null) continue;
    if (major !== expectedMajor) {
      violations.push(
        `${file}:${pin.line} pins Node ${pin.value} but .nvmrc declares ${expectedMajor}`,
      );
    }
  }
  return violations;
}

/**
 * True when an `engines.node` range admits a major above the declared one.
 *
 * A range such as `>=22.0.0` is satisfied by Node 24, so it cannot express the
 * runtime CI actually uses. Reported as a notice: the range is deliberate, and
 * failing on it would punish a correct tree.
 */
export function enginesAdmitsAbove(range, expectedMajor) {
  if (!range || !expectedMajor) return false;
  const lowerBoundOnly = /^\s*>=?\s*v?\d+/.test(range);
  const hasUpperBound = /<\s*v?\d+/.test(range);
  return lowerBoundOnly && !hasUpperBound;
}

function main() {
  const expectedMajor = parseNvmrc(readFileSync(join(repositoryRoot, '.nvmrc'), 'utf8'));
  if (!expectedMajor) {
    console.error('Could not read a Node major from .nvmrc.');
    process.exitCode = 2;
    return;
  }

  const files = readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/.test(name));
  const violations = [];
  let literalCount = 0;
  let fileCount = 0;

  for (const file of files) {
    const text = readFileSync(join(workflowDirectory, file), 'utf8');
    for (const pin of findNodeVersionPins(text)) {
      if (pin.kind === 'literal') literalCount += 1;
      else fileCount += 1;
    }
    violations.push(...findNodeVersionMismatches(file, text, expectedMajor));
  }

  const notices = [];
  const engines = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).engines;
  if (enginesAdmitsAbove(engines?.node, expectedMajor)) {
    notices.push(
      `package.json engines.node is "${engines.node}", which admits majors above ${expectedMajor}; it cannot express the runtime CI uses.`,
    );
  }
  const runningMajor = process.versions.node.split('.')[0];
  if (runningMajor !== expectedMajor) {
    notices.push(
      `this runtime is Node ${runningMajor} but .nvmrc declares ${expectedMajor}; local results may not describe CI.`,
    );
  }

  if (violations.length > 0) {
    console.error('Node runtime pins disagree with .nvmrc:\n');
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Node runtime pins agree with .nvmrc (${expectedMajor}): ${literalCount} literal, ${fileCount} via node-version-file, across ${files.length} workflow file(s).`,
  );
  for (const notice of notices) console.log(`Notice: ${notice}`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
