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
export { stripLiterals } from './lib/source.mjs';
import { stripLiterals } from './lib/source.mjs';

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
 * The reason recorded after the marker on one line, or `null` when the line carries no marker.
 *
 * Literals are stripped first, for the same reason {@link comparisons} strips them: the marker
 * inside a string is *data*, not an annotation. Test fixtures in this repository contain the
 * marker text as sample input, and without this the fixture would silently annotate any real
 * bound within the lookbehind. The checker stated that principle in one direction -- who it
 * accuses -- and did not apply it to the other -- who it lets through.
 *
 * Lengths are preserved by {@link stripLiterals}, so the index found in the stripped line is the
 * index in the original, and the reason is read from the original to keep its text intact.
 *
 * @param {string} line Source line.
 * @returns {string|null} The trimmed reason, `''` when the marker is bare, `null` when absent.
 */
export function markerReason(line) {
  const at = stripLiterals(line).indexOf(UNSOURCED_MARKER);
  if (at === -1) return null;
  return line.slice(at + UNSOURCED_MARKER.length).trim();
}

/**
 * True when a marker *with a reason* covers this bound.
 *
 * A bare `unsourced-bound:` is not an annotation. The whole purpose of the marker is to make the
 * author record which artifact they looked for and failed to find; an empty one discharges the
 * obligation while recording nothing, which is exactly the rubber stamp this file argues an
 * over-reporting checker produces. Emptiness is an existence check, so requiring a reason invents
 * no threshold and cannot trip this checker's own rule.
 *
 * @param {string[]} lines All lines of the file.
 * @param {number} index Zero-based index of the line carrying the bound.
 * @returns {boolean} Whether a reasoned `unsourced-bound:` note covers it.
 */
export function hasMarker(lines, index) {
  const start = Math.max(0, index - MARKER_LOOKBEHIND);
  return lines.slice(start, index + 1).some((line) => {
    const reason = markerReason(line);
    return reason !== null && reason.length > 0;
  });
}

/**
 * True when a bare marker -- present but with no reason -- covers this bound.
 *
 * Reported as its own class rather than folded into the unsourced count, because the two call for
 * different actions: an unsourced bound needs its source found, a bare marker needs its sentence
 * finished.
 *
 * @param {string[]} lines All lines of the file.
 * @param {number} index Zero-based index of the line carrying the bound.
 * @returns {boolean} Whether a reasonless marker covers it.
 */
export function hasBareMarker(lines, index) {
  const start = Math.max(0, index - MARKER_LOOKBEHIND);
  return lines.slice(start, index + 1).some((line) => markerReason(line) === '');
}

/**
 * Comparisons whose right operand is an expression rather than a literal.
 *
 * This is the *recommended fix* -- the constant moves with its source, so the two artifacts can
 * disagree. It was previously invisible: the report asserted that such bounds "never enter this
 * population" and never counted them, so a green run was equally consistent with every bound being
 * derived and with none of them being. A checker that measures only the population it rejects
 * cannot say whether its own advice is ever taken.
 *
 * The lookarounds exclude `=>`, `>=`/`<=` already captured by the operator alternation, and the
 * `!==`/`===` families. Without the `=` lookbehind an arrow function reads as a comparison, which
 * inflated the first measurement of this population from 6 to 45.
 *
 * @param {string} line Source line.
 * @returns {string[]} The derived comparison tokens found.
 */
export function derivedComparisons(line) {
  const found = [];
  const pattern = /(?<![=!<>])(>=|<=|>|<)(?![=>])\s*([A-Za-z_$][\w.$]*)/g;
  let match;
  while ((match = pattern.exec(stripLiterals(line))) !== null) found.push(`${match[1]}${match[2]}`);
  return found;
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
 * @returns {{bounds: object[], existence: number, derived: number, reversed: object[]}} What the
 *   file contains.
 */
export function censusFile(file, source) {
  const lines = source.split('\n');
  const bounds = [];
  const reversed = [];
  let existence = 0;
  let derived = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue;
    if (!isJudged(line)) continue;

    derived += derivedComparisons(line).length;
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
        bare: hasBareMarker(lines, i),
        text: lines[i].trim(),
      });
    }
  }
  return { bounds, existence, derived, reversed };
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
 * @returns {{bounds: object[], existence: number, derived: number, reversed: object[],
 *   files: number}} The census.
 */
export function census(files = sourceFiles()) {
  assertPopulation(files, 'no tool sources found to scan for bounds');
  const bounds = [];
  const reversed = [];
  let existence = 0;
  let derived = 0;
  for (const file of files) {
    const result = censusFile(path.basename(file), readFileSync(file, 'utf8'));
    bounds.push(...result.bounds);
    reversed.push(...result.reversed);
    existence += result.existence;
    derived += result.derived;
  }
  return { bounds, existence, derived, reversed, files: files.length };
}

/**
 * Render the report.
 *
 * Every number printed here is interpolated from the census rather than restated, and the scope
 * line is emitted on both the passing and failing paths -- a scope line only on the green path
 * describes the run nobody needs described.
 *
 * The annotated/derived split is printed on both paths too, and for the same reason one step
 * further in: the derived count is the one that says whether the *recommended fix* is used. Only
 * ever reporting the rejected population lets a checker be green whether its advice is followed or
 * ignored, and the green sentence still claims both categories exist.
 *
 * @param {ReturnType<typeof census>} result The census.
 * @returns {{lines: string[], ok: boolean}} Report lines and the verdict.
 */
export function report(result) {
  const { derived } = result;
  const unannotated = result.bounds.filter((bound) => !bound.annotated);
  const bare = unannotated.filter((bound) => bound.bare);
  const invented = unannotated.filter((bound) => !bound.bare);
  const annotated = result.bounds.length - unannotated.length;
  const lines = [
    `Scanned ${result.files} tool source file(s): ` +
      `${result.bounds.length} numeric bound(s), ${result.existence} existence check(s), ` +
      `${result.reversed.length} reversed comparison(s).`,
    `Bounds by form: ${derived} derived from an expression, ${annotated} annotated ` +
      `\`${UNSOURCED_MARKER}\`, ${unannotated.length} neither.`,
  ];

  for (const item of result.reversed) {
    lines.push(`  unparsed (literal on the left): ${item.file}:${item.line}  ${item.token}`);
  }

  if (unannotated.length === 0) {
    lines.push(`Every bound is annotated or derived.`);
    return { lines, ok: true };
  }

  if (bare.length > 0) {
    lines.push(`${bare.length} bound(s) carry a marker with no reason after it:`);
    for (const bound of bare) {
      lines.push(`  ${bound.file}:${bound.line}  ${bound.token}  ${bound.text.slice(0, 100)}`);
    }
    lines.push(
      `A bare \`${UNSOURCED_MARKER}\` records nothing. Finish the sentence: which artifact did ` +
        `you look for, and why does none commit to this number?`,
    );
  }

  if (invented.length > 0) {
    lines.push(
      `${invented.length} of ${result.bounds.length} bound(s) invent a number with no source:`,
    );
    for (const bound of invented) {
      lines.push(`  ${bound.file}:${bound.line}  ${bound.token}  ${bound.text.slice(0, 100)}`);
    }
    lines.push(
      `Fix by comparing against the artifact that already commits to the number, or record ` +
        `\`${UNSOURCED_MARKER} <why nothing commits to one>\` within ${MARKER_LOOKBEHIND} lines above.`,
    );
  }
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
