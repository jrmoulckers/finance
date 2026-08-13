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

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowDirectory = join(repositoryRoot, '.github', 'workflows');

/**
 * A version far beyond any real release, used to ask whether a range bounds
 * above at all. Any range that accepts this one accepts every version that will
 * ever exist, which is the property that makes the over-restrictive direction
 * unfalsifiable past the highest bound anyone states.
 */
export const UNREACHABLE_FUTURE_VERSION = '9999.0.0';

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
 * This previously read the first `>=` and the first `<` out of the string, which
 * was correct for every form the repository then used and silently wrong for the
 * first one it didn't: given `>=22.23.0 <23 || >=24` it took the bound from the
 * first alternative and the ceiling from the second, and rejected Node 24. A
 * control validated only against the shape that motivated it inherits that
 * shape's blind spots, so range logic is delegated to `semver` rather than
 * approximated here.
 *
 * An unparseable range returns `null` -- undecided, never a violation, so a form
 * the check cannot read stays silent instead of failing a tree it cannot judge.
 */
export function majorSatisfiesEngines(major, range) {
  if (!major || !range) return null;
  const text = String(range);
  if (!semver.validRange(text)) return null;
  return semver.intersects(`${Number(major)}.x`, text);
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
  const text = String(range);
  if (!semver.validRange(text)) return false;
  // Not "has no upper bound": `>=22.23.0 <23 || >=24` has one and still admits
  // 24. Reading the ceiling off the first alternative would answer "no majors
  // above", silently retiring the requirement that some job exercise them.
  const base = Number(expectedMajor);
  for (let major = base + 1; major <= base + 20; major += 1) {
    if (semver.intersects(`${major}.x`, text)) return true;
  }
  return false;
}

/**
 * Node versions worth probing for a range claim.
 *
 * A declared range is only ever wrong at a boundary some package states, so the
 * probe set is every literal version appearing in a dependency's own range, plus
 * each major boundary. Sampling a fixed grid instead would step over exactly the
 * `>=22.22.1` style bound that makes the claim false.
 */
export function probeVersions(dependencyRanges, lowMajor = 18, highMajor = 30) {
  const versions = new Set();
  for (let major = lowMajor; major <= highMajor; major += 1) versions.add(`${major}.0.0`);
  for (const range of dependencyRanges) {
    for (const match of String(range).matchAll(/(\d+)\.(\d+)\.(\d+)/g)) {
      versions.add(`${match[1]}.${match[2]}.${match[3]}`);
    }
  }
  return [...versions].filter((version) => semver.valid(version));
}

/**
 * Versions the declared range admits but an installed dependency rejects.
 *
 * `engines` is advisory in npm's default configuration -- `EBADENGINE` is a
 * warning and the install proceeds -- so a false range produces no failure
 * anywhere until a consumer sets `engine-strict`. That makes this the one place
 * the claim can be checked against something other than itself.
 */
export function findAdmittedIncompatibilities(declared, dependencies) {
  if (!declared || !semver.validRange(declared)) return [];
  const usable = dependencies.filter((dep) => dep.range && semver.validRange(dep.range));
  const admitted = [];
  for (const version of probeVersions(usable.map((dep) => dep.range))) {
    if (!semver.satisfies(version, declared)) continue;
    const failing = usable.filter((dep) => !semver.satisfies(version, dep.range));
    if (failing.length > 0) {
      admitted.push({
        version,
        count: failing.length,
        ranges: [...new Set(failing.map((dep) => dep.range))].sort().slice(0, 3),
      });
    }
  }
  return admitted.sort((a, b) => semver.compare(a.version, b.version));
}

/**
 * Versions every installed dependency accepts but the declared range excludes.
 *
 * The complement of `findAdmittedIncompatibilities`, and it has to be written
 * separately because that function cannot express this: its loop opens with
 * `if (!semver.satisfies(version, declared)) continue`, so a version the range
 * excludes is discarded before anything is asked about it. The blind spot is a
 * direction, not a sample -- `22.22.1` was already in the probe set, harvested
 * from `lint-staged`'s own `>=22.22.1`, and was skipped by that first line.
 *
 * The two directions are not the same defect. An over-permissive range claims
 * support that installed packages reject, which misleads a consumer. An
 * over-restrictive one refuses a runtime that every installed package accepts,
 * which turns a working environment into an unsupported one. Only the first
 * was ever measured here, and the second is what this repository had.
 */
export function findExcludedCompatibilities(declared, dependencies) {
  if (!declared || !semver.validRange(declared)) return [];
  const usable = dependencies.filter((dep) => dep.range && semver.validRange(dep.range));
  if (usable.length === 0) return [];
  const excluded = [];
  for (const version of probeVersions(usable.map((dep) => dep.range))) {
    if (semver.satisfies(version, declared)) continue;
    if (usable.every((dep) => semver.satisfies(version, dep.range))) excluded.push({ version });
  }
  return excluded.sort((a, b) => semver.compare(a.version, b.version));
}
/**
 * The population each direction was actually decided over, and whether the
 * second one could have fired at all.
 *
 * Both verdicts above previously printed the *dependency count* beside them.
 * That number decides neither: the probe set is 52 versions, of which the
 * declared range admits 8 and excludes 44, so one verdict rests on 8 points and
 * the other on 44 while both cite 452. A count is only a denominator for the
 * question it enumerates, and `dependencies.length` enumerates declarations.
 *
 * The second field matters more, and its consequence is the opposite of the
 * intuitive one. `findExcludedCompatibilities` reports versions every
 * dependency accepts, and a dependency stating no upper bound accepts every
 * version there will ever be -- so once all of them are open above, "every
 * dependency accepts it" is automatically true past the highest bound anyone
 * names. The direction does not go quiet up there; it fires for *anything* the
 * declared range excludes, without consulting evidence, because the evidence is
 * unanimous by construction. It has stopped testing the range against the tree
 * and started restating the range's own upper bound back at you.
 *
 * The mirror of that is where a clean reading becomes worthless: a declared
 * range left open above excludes nothing up there, so it has no population to
 * test and returns empty whatever the tree looks like. Either way the upper end
 * of `engines.node` is unfalsifiable from `engines` data; the only evidence for
 * it is having run the thing.
 */
export function directionPopulations(declared, dependencies) {
  const usable = dependencies.filter((dep) => dep.range && semver.validRange(dep.range));
  const probes = probeVersions(usable.map((dep) => dep.range));
  const valid = declared && semver.validRange(declared);
  const admitted = valid ? probes.filter((version) => semver.satisfies(version, declared)) : [];
  const excluded = valid ? probes.filter((version) => !semver.satisfies(version, declared)) : [];
  const unboundedAbove = usable.filter((dep) =>
    semver.satisfies(UNREACHABLE_FUTURE_VERSION, dep.range, { includePrerelease: true }),
  );
  let highestNamedMajor = 0;
  for (const dep of usable) {
    // Bare majors count. A range of `18 || 20 || >=22` names three majors and
    // not one full `x.y.z`, so a triple-only regex reads it as naming nothing
    // and puts the line lower than the tree actually states. That direction is
    // not safe: the notice below claims everything past this line is
    // unmeasurable, so understating it over-claims.
    for (const match of String(dep.range).matchAll(/(\d+)(?:\.\d+(?:\.\d+)?)?/g)) {
      highestNamedMajor = Math.max(highestNamedMajor, Number(match[1]));
    }
  }
  return {
    probes: probes.length,
    admitted: admitted.length,
    excluded: excluded.length,
    unboundedAbove: unboundedAbove.length,
    declarations: usable.length,
    highestNamedMajor,
    excludedAboveHighestNamed: excluded.filter(
      (version) => semver.major(version) > highestNamedMajor,
    ).length,
  };
}

/** Every installed dependency that states an `engines.node`, walked from disk. */
export function collectDependencyEngines(root, depth = 0) {
  const found = [];
  if (depth > 4 || !existsSync(root)) return found;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(root, entry.name);
    if (entry.name === 'node_modules') {
      found.push(...collectDependencyEngines(full, depth + 1));
      continue;
    }
    if (entry.name.startsWith('@')) {
      found.push(...collectDependencyEngines(full, depth));
      continue;
    }
    try {
      const manifest = JSON.parse(readFileSync(join(full, 'package.json'), 'utf8'));
      const range = manifest?.engines?.node;
      if (typeof range === 'string') found.push({ name: manifest.name ?? entry.name, range });
    } catch {
      /* not a package, or unreadable -- neither is this check's business */
    }
    found.push(...collectDependencyEngines(join(full, 'node_modules'), depth + 1));
  }
  return found;
}
/**
 * The notices describing what each direction was decided over.
 *
 * Extracted from `main` so the rendered strings are testable. That matters more
 * than it looks: the whole point of this change is *which number appears beside
 * a verdict*, and a test of `directionPopulations` alone cannot see the text.
 * Reverting the interpolation to the dependency count survived every unit test
 * of the computation, because nothing read the sentence.
 */
export function directionNotices(declared, populations, admittedFindings, excludedFindings) {
  const notices = [];
  if (admittedFindings.length === 0) {
    notices.push(
      `engines.node "${declared}" admits no version rejected by any dependency, ` +
        `over the ${populations.admitted} probe version(s) it admits.`,
    );
  }
  if (excludedFindings.length > 0) {
    notices.push(
      `engines.node "${declared}" excludes Node ${excludedFindings
        .map((entry) => entry.version)
        .join(
          ', ',
        )}, which every one of ${populations.declarations} dependency declaration(s) accepts.`,
    );
  } else {
    notices.push(
      `engines.node excludes no version that every dependency accepts, ` +
        `over the ${populations.excluded} probe version(s) it excludes.`,
    );
  }
  // Both directions are named even when both are clean, because "admits no bad
  // version" reads as "the range is right" and is only half the claim. Each
  // verdict cites the population that decided it rather than the dependency
  // count, which decided neither.
  notices.push(
    `scope: both directions checked over ${populations.probes} probe version(s) ` +
      `(${populations.admitted} admitted, ${populations.excluded} excluded) ` +
      `drawn from ${populations.declarations} dependency declaration(s).`,
  );
  if (populations.declarations > 0 && populations.unboundedAbove === populations.declarations) {
    notices.push(
      `not evidence: all ${populations.declarations} declaration(s) are unbounded above, so past Node ` +
        `${populations.highestNamedMajor} "every dependency accepts it" is true by construction. ` +
        `${populations.excludedAboveHighestNamed} probe version(s) sit there, and the verdict on them ` +
        `restates engines.node's own upper bound rather than testing it. The upper end is ` +
        `unfalsifiable from engines data; only running it is evidence.`,
    );
  }
  return notices;
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
  const modules = join(repositoryRoot, 'node_modules');
  if (!existsSync(modules)) {
    // Never silently skip: an absent tree and a clean one are the same exit code.
    notices.push('node_modules is absent, so engines.node was not checked against dependencies.');
  } else {
    const dependencies = collectDependencyEngines(modules);
    const populations = directionPopulations(engines?.node, dependencies);
    const admitted = findAdmittedIncompatibilities(engines?.node, dependencies);
    if (admitted.length > 0) {
      const worst = admitted[0];
      violations.push(
        `package.json engines.node is "${engines.node}", which admits Node ${worst.version}, ` +
          `but ${worst.count} installed dependenc(ies) declare themselves incompatible there ` +
          `(e.g. ${worst.ranges.join(', ')}). ${admitted.length} admitted version(s) fail this way. ` +
          `Narrow engines.node to what the dependency tree actually supports.`,
      );
    }
    // The other direction is a notice because a dependency relaxing its own
    // floor widens what is admissible without any local edit, and this check
    // only fails on disagreements a local edit causes.
    const excluded = findExcludedCompatibilities(engines?.node, dependencies);
    notices.push(...directionNotices(engines?.node, populations, admitted, excluded));
  }
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

  // The three buckets partition every pin found, so the summary states the
  // total and its parts together. Reporting only the plain literals read as a
  // census while silently excluding the marked pin, which is how a figure stays
  // true and becomes wrong to quote.
  console.log(
    `Node runtime pins agree with .nvmrc (${expectedMajor}): ${literalCount + markedCount + fileCount} pin(s) = ${literalCount} literal + ${markedCount} marked ${RANGE_MARKER} + ${fileCount} via node-version-file, across ${files.length} workflow file(s).`,
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
