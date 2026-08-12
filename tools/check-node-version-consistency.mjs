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
      pins.push({
        kind: 'literal',
        value: literal[1],
        line: index + 1,
        exercisesRange: line.includes(`# ${RANGE_MARKER}`),
      });
      continue;
    }
    const fromFile = line.match(/^\s*(?:-\s*)?node-version-file:\s*['"]?([^\s'"#]+)/);
    if (fromFile) {
      pins.push({ kind: 'file', value: fromFile[1], line: index + 1 });
    }
  }
  return pins;
}

/**
 * Marker that opts a literal out of the `.nvmrc` equality rule.
 *
 * A repository that declares `engines.node: ">=22.0.0"` claims 22, 24 and every
 * later major. Pinning every job to `.nvmrc` exercises the floor and leaves the
 * rest asserted, which is how a support claim rots without any file changing.
 * Marked literals deliberately run a different major to exercise that claim.
 */
export const RANGE_MARKER = 'exercises-engines-range';

/** Extracts the major from a `setup-node` version literal such as `22.11.0`. */
export function pinMajor(value) {
  const match = String(value ?? '').match(/^v?(\d+)/);
  return match ? match[1] : null;
}

/**
 * True when `major` falls inside an `engines.node` range.
 *
 * Understands the lower/upper bound forms this repository uses. An unparseable
 * range returns `null` -- undecided, never a violation, so a form the check
 * cannot read stays silent instead of failing a tree it cannot judge.
 */
export function majorSatisfiesEngines(major, range) {
  if (!major || !range) return null;
  const lower = String(range).match(/>=?\s*v?(\d+)/);
  if (!lower) return null;
  const upper = String(range).match(/<=?\s*v?(\d+)/);
  const value = Number(major);
  if (value < Number(lower[1])) return false;
  if (upper && value > Number(upper[1])) return false;
  return true;
}

/**
 * Reports marked literals that do not do the job the marker claims.
 *
 * The marker is the only way past the `.nvmrc` rule, so it is constrained from
 * both sides: a marked literal must sit inside the declared range (otherwise it
 * exercises a version the manifest never claimed) and must differ from `.nvmrc`
 * (otherwise it exercises nothing and the marker only hides drift). Both are
 * caused by a local edit, so both are fatal.
 */
export function findRangeExerciseViolations(file, text, expectedMajor, range) {
  const violations = [];
  for (const pin of findNodeVersionPins(text)) {
    if (pin.kind !== 'literal' || !pin.exercisesRange) continue;
    const major = pinMajor(pin.value);
    if (major === null) {
      violations.push(
        `${file}:${pin.line} is marked ${RANGE_MARKER} but its version cannot be read`,
      );
      continue;
    }
    if (major === expectedMajor) {
      violations.push(
        `${file}:${pin.line} is marked ${RANGE_MARKER} but pins ${pin.value}, the same major as .nvmrc; it exercises nothing`,
      );
    }
    if (majorSatisfiesEngines(major, range) === false) {
      violations.push(
        `${file}:${pin.line} is marked ${RANGE_MARKER} but Node ${pin.value} is outside engines.node "${range}"`,
      );
    }
  }
  return violations;
}

/** Majors above `.nvmrc` that some marked literal actually runs. */
export function exercisedMajorsAbove(files, expectedMajor) {
  const majors = new Set();
  for (const { text } of files) {
    for (const pin of findNodeVersionPins(text)) {
      if (pin.kind !== 'literal' || !pin.exercisesRange) continue;
      const major = pinMajor(pin.value);
      if (major !== null && Number(major) > Number(expectedMajor)) majors.add(major);
    }
  }
  return [...majors].sort((a, b) => Number(a) - Number(b));
}

/**
 * Reports literals whose major disagrees with `.nvmrc`.
 *
 * A `node-version-file` pin is single-sourced and never reported. A literal
 * whose major cannot be read (`lts/*`, an expression) is left undecided rather
 * than reported, so an unparsed form stays silent instead of failing a tree the
 * check cannot judge. A literal marked `exercises-engines-range` is judged by
 * `findRangeExerciseViolations` instead.
 */
export function findNodeVersionMismatches(file, text, expectedMajor) {
  if (!expectedMajor) return [];
  const violations = [];
  for (const pin of findNodeVersionPins(text)) {
    if (pin.kind !== 'literal') continue;
    if (pin.exercisesRange) continue;
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
  const engines = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).engines;
  const violations = [];
  const loaded = [];
  let literalCount = 0;
  let fileCount = 0;
  let markedCount = 0;

  for (const file of files) {
    const text = readFileSync(join(workflowDirectory, file), 'utf8');
    loaded.push({ file, text });
    for (const pin of findNodeVersionPins(text)) {
      if (pin.kind !== 'literal') fileCount += 1;
      else if (pin.exercisesRange) markedCount += 1;
      else literalCount += 1;
    }
    violations.push(...findNodeVersionMismatches(file, text, expectedMajor));
    violations.push(...findRangeExerciseViolations(file, text, expectedMajor, engines?.node));
  }

  const exercised = exercisedMajorsAbove(loaded, expectedMajor);
  if (enginesAdmitsAbove(engines?.node, expectedMajor) && exercised.length === 0) {
    violations.push(
      `package.json engines.node is "${engines.node}", which claims majors above ${expectedMajor}, but no workflow runs one. ` +
        `Either narrow the range to what CI exercises, or mark a job's node-version with "# ${RANGE_MARKER}".`,
    );
  }

  const notices = [];
  const runningMajor = process.versions.node.split('.')[0];
  if (runningMajor !== expectedMajor) {
    notices.push(
      `this runtime is Node ${runningMajor} but .nvmrc declares ${expectedMajor}; local results may not describe CI.`,
    );
  }

  if (violations.length > 0) {
    console.error('Node runtime pin check failed:\n');
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Node runtime pins agree with .nvmrc (${expectedMajor}): ${literalCount} literal, ${fileCount} via node-version-file, across ${files.length} workflow file(s).`,
  );
  if (markedCount > 0) {
    console.log(
      `engines.node "${engines.node}" is exercised above ${expectedMajor} at Node ${exercised.join(', ')} by ${markedCount} marked pin(s).`,
    );
  }
  for (const notice of notices) console.log(`Notice: ${notice}`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
