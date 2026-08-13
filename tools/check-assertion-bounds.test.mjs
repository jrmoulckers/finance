/**
 * Tests for the numeric-bound source checker (#4296).
 *
 * The checker's own first two runs were wrong in opposite directions, and both are pinned here:
 * it reported 49 bounds by counting semver strings inside string arguments, then 14 by counting
 * sign assertions. Over-reporting is a false accusation whose cost is that the annotations it
 * forces become rubber stamps, so the exclusions carry tests rather than a comment.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  comparisons,
  reversedComparisons,
  stripLiterals,
  isExistence,
  hasMarker,
  hasBareMarker,
  markerReason,
  derivedComparisons,
  isJudged,
  censusFile,
  census,
  sourceFiles,
  report,
  assertPopulation,
  UNSOURCED_MARKER,
  MARKER_LOOKBEHIND,
  TOOLS_DIR,
} from './check-assertion-bounds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, 'check-assertion-bounds.mjs');

// --- literal stripping: the first run's defect ---------------------------------------------

test('a semver range inside a string argument is not a bound', () => {
  const line = "assert.equal(enginesAdmitsAbove('>=22.0.0 <23', '22'), true);";
  assert.deepEqual(comparisons(line), []);
});

test('stripLiterals preserves length so column positions survive', () => {
  const line = "const a = 'hello' + `w${x}d`;";
  assert.equal(stripLiterals(line).length, line.length);
});

test('stripLiterals blanks single, double and template literals', () => {
  // Derived, not counted: the replacement is the quote character repeated to the literal's own
  // length. Writing `'{6}` here would be an invented constant in the suite about those (#4296).
  for (const [source, quote] of [
    ["f('>=5')", "'"],
    ['f(">=5")', '"'],
    ['f(`>=5`)', '`'],
  ]) {
    const literal = source.slice(2, -1);
    assert.equal(stripLiterals(source), `f(${quote.repeat(literal.length)})`);
  }
});

test('an escaped quote does not end the literal early', () => {
  assert.deepEqual(comparisons("assert.ok(x, 'it\\'s >= 5 here');"), []);
});

test('a real bound outside a literal is still found beside one inside', () => {
  const line = "assert.ok(list.length >= 7, 'range >=22.0.0 is irrelevant');";
  assert.deepEqual(
    comparisons(line).map((c) => c.token),
    ['>=7'],
  );
});

// --- equality is out of scope ----------------------------------------------------------------

test('equality against a literal is not a bound', () => {
  // An exact expected value is the strongest form, not an invented one. Counting it would
  // invert the finding: the checker would push authors from `=== 3` toward `>= 3`.
  assert.deepEqual(comparisons('assert.ok(match.testLine === 3);'), []);
  assert.deepEqual(comparisons('assert.ok(x !== 4);'), []);
});

// --- existence and sign ------------------------------------------------------------------------

test('existence checks are excluded', () => {
  for (const token of ['>0', '>=1', '<1', '<=0']) {
    assert.equal(isExistence({ token }), true, token);
  }
});

test('sign assertions are excluded because zero is a boundary, not a choice', () => {
  assert.equal(isExistence({ token: '>=0' }), true);
  assert.equal(isExistence({ token: '<0' }), true);
});

test('a genuine threshold is not excluded', () => {
  for (const token of ['>=2', '>5', '<10', '>=11', '>20']) {
    assert.equal(isExistence({ token }), false, token);
  }
});

test('whitespace between operator and literal does not change the class', () => {
  assert.deepEqual(
    comparisons('assert.ok(x >   0);').map((c) => c.token),
    ['>0'],
  );
  assert.equal(isExistence(comparisons('assert.ok(x >   0);')[0]), true);
});

// --- scope ---------------------------------------------------------------------------------

test('assertions are judged', () => {
  assert.equal(isJudged('  assert.ok(x >= 5);'), true);
  assert.equal(isJudged('  assert.deepEqual(a, b);'), true);
});

test('a named threshold constant is judged even outside a test', () => {
  // The motivating defect lived in production, not in a test file.
  assert.equal(isJudged('const BREADTH_FLOOR = { families: 2 };'), true);
  assert.equal(isJudged('const MANAGED_MINIMUM = 4;'), true);
  assert.equal(isJudged('const RETRY_LIMIT = 3;'), true);
});

test('ordinary code is not judged', () => {
  assert.equal(isJudged('  if (index > 5) return null;'), false);
  assert.equal(isJudged('  const slice = list.slice(0, 5);'), false);
});

test('a comment line is never judged', () => {
  const census = censusFile('x.mjs', '// assert.ok(x >= 5);\n * assert.ok(y >= 6);\n');
  assert.deepEqual(census.bounds, []);
});

// --- the marker ----------------------------------------------------------------------------

test('a marker on the same line covers the bound', () => {
  const lines = [`assert.ok(x >= 5); // ${UNSOURCED_MARKER} nothing declares it`];
  assert.equal(hasMarker(lines, 0), true);
});

test('a marker within the lookbehind covers the bound', () => {
  const lines = [`// ${UNSOURCED_MARKER} why`, '// filler', 'assert.ok(x >= 5);'];
  assert.equal(hasMarker(lines, 2), true);
});

test('a marker beyond the lookbehind does not cover the bound', () => {
  const lines = [`// ${UNSOURCED_MARKER} why`, ...Array(MARKER_LOOKBEHIND).fill('// filler'), 'a'];
  assert.equal(hasMarker(lines, lines.length - 1), false);
});

test('a marker below the bound does not cover it', () => {
  const lines = ['assert.ok(x >= 5);', `// ${UNSOURCED_MARKER} why`];
  assert.equal(hasMarker(lines, 0), false);
});

// --- the acceptance path, which was the untested half ------------------------------------------
//
// Every case below passed before #4312. They are all on the path where the checker lets a bound
// through, and a passing case produces no output, so nothing about the tree ever looked wrong.
// The checker was careful about who it accused -- stripping literals, exempting existence and sign
// checks, surfacing unparsed forms -- and applied none of that care to who it excused.

test('a bare marker with no reason is not an annotation', () => {
  const lines = [`// ${UNSOURCED_MARKER}`, 'assert.ok(x >= 5);'];
  assert.equal(hasMarker(lines, 1), false, 'an empty note records nothing');
  assert.equal(hasBareMarker(lines, 1), true, 'but it is reported as its own class');
});

test('a marker inside a string literal does not annotate a nearby bound', () => {
  // Real shape: this very file contains the marker as fixture data. Without stripping, that data
  // would excuse any bound written within the lookbehind of it.
  const lines = [`const FIXTURE = '${UNSOURCED_MARKER} sample';`, 'assert.ok(x >= 5);'];
  assert.equal(hasMarker(lines, 1), false);
  assert.equal(hasBareMarker(lines, 1), false, 'data is neither a reason nor a bare marker');
});

test('markerReason distinguishes absent, bare, and reasoned', () => {
  assert.equal(markerReason('assert.ok(x >= 5);'), null);
  assert.equal(markerReason(`// ${UNSOURCED_MARKER}`), '');
  assert.equal(
    markerReason(`// ${UNSOURCED_MARKER}  nothing declares it  `),
    'nothing declares it',
  );
});

test('a trailing comment marker still annotates, so the fix did not narrow the rule', () => {
  const lines = [`assert.ok(x >= 5); // ${UNSOURCED_MARKER} nothing declares it`];
  assert.equal(hasMarker(lines, 0), true);
});

// --- derived bounds are counted, not merely asserted to exist ----------------------------------

test('derivedComparisons finds an expression operand and ignores a literal one', () => {
  assert.deepEqual(derivedComparisons('assert.ok(n >= want);'), ['>=want']);
  assert.deepEqual(derivedComparisons('assert.ok(n >= 18);'), []);
});

test('derivedComparisons does not read an arrow function as a comparison', () => {
  // The first measurement of this population reported 45 because `) => f` matched `>` followed by
  // an identifier. The real count was 6. A detector that inflates its population 7.5x would have
  // been published as a finding had the number not been checked against a control.
  assert.deepEqual(derivedComparisons('assert.ok(a.some((f) => f.x));'), []);
  assert.deepEqual(derivedComparisons('assert.ok(a !== b);'), []);
});

test('censusFile counts derived bounds alongside invented ones', () => {
  const source = 'assert.ok(a >= b);\nassert.ok(c >= 18);\n';
  const result = censusFile('x.mjs', source);
  assert.equal(result.derived, 1, 'the expression-compared bound');
  assert.equal(result.bounds.length, 1, 'only the literal one is a candidate for annotation');
});

test('the report states the derived count on both paths', () => {
  // The old green sentence claimed "annotated or derived" and printed only the annotated count, so
  // it read identically whether the recommended fix was used everywhere or nowhere.
  const shape = { files: 1, existence: 0, reversed: [] };
  const pass = report({ ...shape, derived: 4, bounds: [] });
  const fail = report({
    ...shape,
    derived: 4,
    bounds: [{ file: 'a', line: 1, token: '>=7', annotated: false, bare: false, text: 't' }],
  });
  assert.ok(
    pass.lines.some((line) => line.includes('4 derived from an expression')),
    pass.lines.join('\n'),
  );
  assert.ok(
    fail.lines.some((line) => line.includes('4 derived from an expression')),
    fail.lines.join('\n'),
  );
});

test('a bare marker fails with different advice than an invented number', () => {
  const shape = { files: 1, existence: 0, derived: 0, reversed: [] };
  const bareRun = report({
    ...shape,
    bounds: [{ file: 'a', line: 1, token: '>=7', annotated: false, bare: true, text: 't' }],
  });
  const inventedRun = report({
    ...shape,
    bounds: [{ file: 'a', line: 1, token: '>=7', annotated: false, bare: false, text: 't' }],
  });
  assert.equal(bareRun.ok, false);
  assert.equal(inventedRun.ok, false);
  assert.ok(bareRun.lines.some((line) => line.includes('Finish the sentence')));
  assert.ok(
    !inventedRun.lines.some((line) => line.includes('Finish the sentence')),
    'an invented number needs its source found, not its sentence finished',
  );
  assert.ok(inventedRun.lines.some((line) => line.includes('invent a number with no source')));
});

test('PREMISE: the derived population in this repository is not empty', () => {
  // Without this the two counts could both be reported and both be zero, and the split would be a
  // sentence about nothing. This is an existence check, so it commits to no particular number.
  assert.ok(census().derived > 0, 'no bound in this tree derives its constant from an expression');
});

// --- reversed comparisons are reported, not skipped ------------------------------------------

test('a literal on the left is surfaced rather than silently unparsed', () => {
  assert.deepEqual(reversedComparisons('assert.ok(5 <= list.length);'), ['5<=']);
});

test('a reversed comparison inside a string is not surfaced', () => {
  assert.deepEqual(reversedComparisons("assert.equal(parse('5 < x'), null);"), []);
});

// --- population refusal ----------------------------------------------------------------------

test('an empty population is refused rather than passed', () => {
  assert.throws(() => assertPopulation([], 'nothing'), /empty population/);
  assert.throws(() => census([]), /empty population/);
});

// --- the real tree -----------------------------------------------------------------------------

test('every bound in this repository is annotated or derived', () => {
  // Ask the tool for its verdict rather than recomputing it. The first version of this test
  // filtered `!bound.annotated` itself, which is the same expression `report()` uses -- a test
  // that decides the answer cannot notice the rule changing, and the independence gate said so.
  const verdict = report(census());
  assert.equal(verdict.ok, true, verdict.lines.join('\n'));
});

test('PREMISE: the population is not empty, or the check proves nothing', () => {
  const result = census();
  // The whole point of the exercise: a checker whose population is empty exits 0 and looks
  // identical to one that verified something.
  assert.ok(result.bounds.length > 0, 'no bounds found; the checker would pass over nothing');
  assert.ok(result.files > 0);
});

test('sourceFiles enumerates from disk, not from a glob', () => {
  // Asserted by properties rather than by rerunning the same extension filter: a test that
  // recomputes the selection agrees with itself whatever the selection becomes.
  const listed = sourceFiles();
  assert.ok(listed.length > 0, 'PREMISE: the directory is not empty');
  assert.deepEqual(listed, [...listed].sort(), 'a stable order, so reports are diffable');
  for (const file of listed) {
    assert.equal(path.dirname(file), TOOLS_DIR, `escaped the tools directory: ${file}`);
    assert.ok(fs.statSync(file).isFile(), `not a file: ${file}`);
  }
  const names = listed.map((file) => path.basename(file));
  assert.ok(names.includes('check-assertion-bounds.mjs'), 'the checker must scan itself');
  // Real negatives that live in this directory: neither is JavaScript.
  assert.ok(!names.includes('README.md'));
  assert.ok(!names.includes('setup-branch-protection.sh'));
});

// --- the verdict actually refuses --------------------------------------------------------------

test('an unannotated bound fails the run, and the report names it', () => {
  const result = report({
    files: 1,
    existence: 0,
    reversed: [],
    derived: 0,
    bounds: [{ file: 'x.test.mjs', line: 9, token: '>=7', annotated: false, text: 'assert' }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.lines.some((line) => line.includes('x.test.mjs:9')));
  assert.ok(result.lines.some((line) => line.includes(UNSOURCED_MARKER)));
});

test('the scope line is printed on both the passing and the failing path', () => {
  const bound = { file: 'a', line: 1, token: '>=7', text: 't' };
  const pass = report({ files: 2, existence: 3, derived: 0, reversed: [], bounds: [] });
  const fail = report({
    files: 2,
    existence: 3,
    derived: 0,
    reversed: [],
    bounds: [{ ...bound, annotated: false }],
  });
  assert.match(pass.lines[0], /Scanned 2 tool source file\(s\)/);
  assert.match(fail.lines[0], /Scanned 2 tool source file\(s\)/);
});

test('the report interpolates its counts rather than restating them', () => {
  const result = report({ files: 7, existence: 4, derived: 0, reversed: [], bounds: [] });
  assert.match(result.lines[0], /Scanned 7 .*: 0 numeric bound\(s\), 4 existence check\(s\)/);
});

test('a reversed comparison is listed on the passing path too', () => {
  const result = report({
    files: 1,
    existence: 0,
    derived: 0,
    bounds: [],
    reversed: [{ file: 'a.mjs', line: 3, token: '5<=' }],
  });
  assert.equal(result.ok, true, 'an unparsed form is a disclosure, not a failure');
  assert.ok(result.lines.some((line) => line.includes('a.mjs:3')));
});

// --- end to end, against a real removal --------------------------------------------------------

test('removing an annotation from the tree makes the CLI exit non-zero (#4296)', () => {
  // Mutation rather than a fixture: the assertion above proves the tree is clean, which is
  // exactly the state in which a broken checker is indistinguishable from a working one.
  const victim = path.join(TOOLS_DIR, 'run-tool-tests.test.mjs');
  const original = fs.readFileSync(victim, 'utf8');
  assert.ok(original.includes(UNSOURCED_MARKER), 'PREMISE: the victim carries an annotation');
  try {
    fs.writeFileSync(
      victim,
      original
        .split('\n')
        .filter((line) => !line.includes(UNSOURCED_MARKER))
        .join('\n'),
    );
    assert.throws(
      () => execFileSync(process.execPath, [TOOL], { encoding: 'utf8', stdio: 'pipe' }),
      /Command failed/,
      'the checker must refuse a tree with an unannotated bound',
    );
  } finally {
    fs.writeFileSync(victim, original);
  }
  assert.equal(fs.readFileSync(victim, 'utf8'), original, 'the mutation must be restored');
});

test('the CLI exits zero on the clean tree', () => {
  const out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
  assert.match(out, /Every bound is annotated or derived/);
});
