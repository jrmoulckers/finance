#!/usr/bin/env node
/**
 * Every numeric bound must name where its number came from (#4296).
 *
 * A sibling session measured `jrmoulckers/engineering`'s bounded assertions and found the good
 * ones did not invent their constants -- they took them from an artifact that had already
 * committed to a number ("the docs claim 18 react/* rules"). That turns an inequality into a
 * two-artifact consistency check: it can now fail because the code shrank OR because the doc went
 * stale, and both are real defects. An invented constant excludes some values and names no source,
 * so nothing can ever contradict it.
 *
 * The motivating defect: `BREADTH_FLOOR.families` was 2 for a switch the same file states is
 * three-way, with the number 3 derivable four lines up. Dropping an entire comment family from the
 * corpus produced zero findings -- the guard against certifying a fraction of the switch could not
 * detect losing a third of it. The test pinning the floor read `>= 2` with the message "one family
 * cannot certify a three-way switch", so it agreed with itself and reported nothing.
 *
 * The rule enforced here is deliberately NOT a judgement about whether a number is right, which no
 * tool can decide. It is syntactic and total:
 *
 *   A comparison against a bare numeric literal must either be an existence check (`> 0`, `>= 1`,
 *   and their mirrors, which exclude exactly one value) or carry an `unsourced-bound:` note.
 *
 * A bound compared against an *expression* never enters the population, because that is the fixed
 * form -- the constant then moves with its source. So the population is precisely the set of
 * invented numbers, and the annotation forces the author to record which artifact they looked for
 * and failed to find. Per the sibling's formulation: if nothing in the repo commits to a number,
 * that absence is itself the finding, and an inequality papers over it.
 *
 * Usage: node tools/check-assertion-bounds.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOOLS_DIR = HERE;

/** Marker an author writes to record that no artifact commits to the number. */
export const UNSOURCED_MARKER = 'unsourced-bound:';

/** How many preceding lines may carry the marker for a bound. */
export const MARKER_LOOKBEHIND = 4;

/**
 * Comparisons excluded from the population.
 *
 * Two kinds, neither of which involves a chosen number:
 *
 * - **existence** (`> 0`, `>= 1`, `< 1`, `<= 0`) excludes exactly one value, emptiness. It asserts
 *   a population exists, not that it has a particular size.
 * - **sign** (`>= 0`, `< 0`) asserts which side of zero a quantity falls on. Zero is the sign
 *   boundary, not a threshold anyone picked -- `assert.ok(dirtySeconds >= 0)` says a clock skew
 *   must not subtract exposure, and there is no artifact that could commit to a different number.
 *
 * Both were in the population when this checker first ran, which is why it reported 14 bounds where
 * 10 are real. A checker that over-reports is making a false accusation, and the cost is that the
 * annotations it forces become rubber stamps.
 */
const EXISTENCE = new Set(['>0', '>=1', '<1', '<=0', '>=0', '<0']);

/**
 * Blank out string and template literals, preserving length and line structure.
 *
 * The first version of this checker did not do this and reported 49 unsourced bounds, 40 of which
 * were semver ranges *inside string arguments* -- `enginesAdmitsAbove('>=22.0.0 <23', '22')`. Those
 * are data being passed to a parser, not a threshold anyone chose. A syntactic pattern is not a
 * semantic class, and counting one as the other is how a population gets picked by proxy.
 *
 * @param {string} line Source line.
 * @returns {string} The line with literal contents replaced by spaces.
 */
export function stripLiterals(line) {
  return line.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, (match) => match[0].repeat(match.length));
}

/**
 * Extract every numeric-literal *inequality* from a line of source.
 *
 * Equality against a literal (`=== 3`) is deliberately out of scope. It is the strongest available
 * form -- an exact expected value, falsifiable by any change at all -- and the sibling's rule is
 * about inequalities, which are reached for precisely when the author does not know the expected
 * value. Counting exact expectations as invented bounds inverts the finding.
 *
 * Matches the operand order `expr OP literal` only. `2 <= x` is vanishingly rare in this tree and
 * silently treating a miss as a pass would be the checker's own version of the bug it exists to
 * catch, so misses are surfaced by {@link reversedComparisons} rather than ignored.
 *
 * @param {string} line Source line.
 * @returns {{operator: string, value: number, token: string}[]} Comparisons found.
 */
export function comparisons(line) {
  const found = [];
  const pattern = /(>=|<=|>|<)\s*(\d+(?:\.\d+)?)\b/g;
  let match;
  while ((match = pattern.exec(stripLiterals(line))) !== null) {
    const [, operator, digits] = match;
    found.push({ operator, value: Number(digits), token: `${operator}${digits}` });
  }
  return found;
}

/**
 * Find `literal OP expr` comparisons, which {@link comparisons} does not classify.
 *
 * Reported rather than skipped: an unparsed form is an unmeasured one, and a checker that quietly
 * narrows its own population is the failure this file was written about.
 *
 * @param {string} line Source line.
 * @returns {string[]} The reversed comparison tokens found.
 */
export function reversedComparisons(line) {
  const found = [];
  const pattern = /\b(\d+(?:\.\d+)?)\s*(>=|<=|>|<)\s*[A-Za-z_$([]/g;
  let match;
  while ((match = pattern.exec(stripLiterals(line))) !== null) found.push(`${match[1]}${match[2]}`);
  return found;
}

/**
 * True when a comparison only distinguishes an empty population from a non-empty one.
 *
 * @param {{token: string}} comparison A comparison from {@link comparisons}.
 * @returns {boolean} Whether it is an existence check rather than a bound.
 */
export function isExistence(comparison) {
  return EXISTENCE.has(comparison.token.replace(/\s+/g, ''));
}

/**
 * True when the marker appears on the line or close enough above it to be about this bound.
 *
 * @param {string[]} lines All lines of the file.
 * @param {number} index Zero-based index of the line carrying the bound.
 * @returns {boolean} Whether an `unsourced-bound:` note covers it.
 */
export function hasMarker(lines, index) {
  const start = Math.max(0, index - MARKER_LOOKBEHIND);
  return lines.slice(start, index + 1).some((line) => line.includes(UNSOURCED_MARKER));
}

/**
 * True for lines this checker judges. Assertions everywhere, plus threshold constants in tools.
 *
 * A threshold constant is included because the motivating defect lived in production, not in a
 * test: a floor named `*_FLOOR` is a bound whoever reads the guard will trust.
 *
 * @param {string} line Source line.
 * @returns {boolean} Whether the line is in scope.
 */
export function isJudged(line) {
  if (/\bassert\.\w+\(/.test(line)) return true;
  return /\b[A-Z][A-Z0-9_]*(?:FLOOR|MINIMUM|THRESHOLD|CEILING|LIMIT)\b\s*[:=]/.test(line);
}

/**
 * Census the bounds in one file.
 *
 * @param {string} file Path to the file.
 * @param {string} source Its contents.
 * @returns {{bounds: object[], existence: number, reversed: object[]}} What the file contains.
 */
export function censusFile(file, source) {
  const lines = source.split('\n');
  const bounds = [];
  const reversed = [];
  let existence = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue;
    if (!isJudged(line)) continue;

    for (const token of reversedComparisons(line)) {
      reversed.push({ file, line: i + 1, token, text: lines[i].trim() });
    }
    for (const comparison of comparisons(line)) {
      if (isExistence(comparison)) {
        existence += 1;
        continue;
      }
      bounds.push({
        file,
        line: i + 1,
        token: comparison.token,
        annotated: hasMarker(lines, i),
        text: lines[i].trim(),
      });
    }
  }
  return { bounds, existence, reversed };
}

/**
 * Files this checker reads, enumerated from disk.
 *
 * From disk rather than a shell glob: a glob matching nothing exits zero and produces a green run
 * over an empty population, which is a decoy rather than a check.
 *
 * @returns {string[]} Absolute paths.
 */
export function sourceFiles() {
  return readdirSync(TOOLS_DIR)
    .filter((name) => name.endsWith('.mjs') || name.endsWith('.js'))
    .sort()
    .map((name) => path.join(TOOLS_DIR, name));
}

/**
 * Refuse to pass over nothing.
 *
 * @param {unknown[]} population The thing being checked.
 * @param {string} what A description for the failure message.
 * @returns {unknown[]} The population, when it is non-empty.
 */
export function assertPopulation(population, what) {
  if (!Array.isArray(population) || population.length === 0) {
    throw new Error(`refusing to pass over an empty population: ${what}`);
  }
  return population;
}

/**
 * Run the census across every source file.
 *
 * @param {string[]} [files] Override for tests.
 * @returns {{bounds: object[], existence: number, reversed: object[], files: number}} The census.
 */
export function census(files = sourceFiles()) {
  assertPopulation(files, 'no tool sources found to scan for bounds');
  const bounds = [];
  const reversed = [];
  let existence = 0;
  for (const file of files) {
    const result = censusFile(path.basename(file), readFileSync(file, 'utf8'));
    bounds.push(...result.bounds);
    reversed.push(...result.reversed);
    existence += result.existence;
  }
  return { bounds, existence, reversed, files: files.length };
}

/**
 * Render the report.
 *
 * Every number printed here is interpolated from the census rather than restated, and the scope
 * line is emitted on both the passing and failing paths -- a scope line only on the green path
 * describes the run nobody needs described.
 *
 * @param {ReturnType<typeof census>} result The census.
 * @returns {{lines: string[], ok: boolean}} Report lines and the verdict.
 */
export function report(result) {
  const unannotated = result.bounds.filter((bound) => !bound.annotated);
  const lines = [
    `Scanned ${result.files} tool source file(s): ` +
      `${result.bounds.length} numeric bound(s), ${result.existence} existence check(s), ` +
      `${result.reversed.length} reversed comparison(s).`,
  ];

  for (const item of result.reversed) {
    lines.push(`  unparsed (literal on the left): ${item.file}:${item.line}  ${item.token}`);
  }

  if (unannotated.length === 0) {
    lines.push(
      `Every bound is annotated or derived. ${result.bounds.length} annotated invented ` +
        `constant(s); a bound compared against an expression never enters this population.`,
    );
    return { lines, ok: true };
  }

  lines.push(
    `${unannotated.length} of ${result.bounds.length} bound(s) invent a number with no source:`,
  );
  for (const bound of unannotated) {
    lines.push(`  ${bound.file}:${bound.line}  ${bound.token}  ${bound.text.slice(0, 100)}`);
  }
  lines.push(
    `Fix by comparing against the artifact that already commits to the number, or record ` +
      `\`${UNSOURCED_MARKER} <why nothing commits to one>\` within ${MARKER_LOOKBEHIND} lines above.`,
  );
  return { lines, ok: false };
}

// Use `pathToFileURL`, not a template literal. `file://${path}` yields two slashes where
// `import.meta.url` has three on Windows, so the guard never fires and the tool exits 0 having
// printed nothing -- a green run over an empty population, which is the decoy this file argues
// against, manufactured by this file. Caught only because the first run printed no report.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const result = report(census());
  for (const line of result.lines) console.log(line);
  process.exit(result.ok ? 0 : 1);
}
