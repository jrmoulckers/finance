import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  shapeOf,
  classify,
  statementAt,
  censusPair,
  census,
  reportLines,
  DUPLICATION_BASELINE,
} from './check-test-independence.mjs';

// The pair this checker exists for, quoted from the report that found it.
const SIBLING_IMPL = [
  'export function compare(uncovered, known, covered, baseline) {',
  '  const regressions = uncovered.filter((id) => !known.has(id));',
  '  const stale = baseline.uncovered.filter((id) => covered.includes(id));',
  '  return { regressions, stale };',
  '}',
].join('\n');

const SIBLING_TEST = [
  "test('coverage agrees with the tree', () => {",
  '  const regressions = uncovered.filter((id) => !baseline.uncovered.includes(id));',
  '  const stale = baseline.uncovered.filter((id) => covered.includes(id));',
  '  assert.equal(regressions.length, 0);',
  '});',
].join('\n');

// ---------------------------------------------------------------------------
// End-to-end detection.
//
// An earlier probe asserted `shapeOf(a) === shapeOf(b)` for this pair and
// passed, while the census dropped both lines on a 22-character length filter
// the assertion never ran through. The comparator was tested; the claim was
// about the pipeline. Every test below drives the census.
// ---------------------------------------------------------------------------

test('the census detects a rule recomputed with a different membership test', () => {
  const matches = censusPair(SIBLING_IMPL, SIBLING_TEST);
  const ids = matches.map((match) => `${match.testLine}~${match.sourceLine}`);
  assert.ok(ids.includes('2~2'), `Set.has vs Array.includes not matched: ${ids.join(',')}`);
});

test('the census detects a character-identical recomputed rule', () => {
  const matches = censusPair(SIBLING_IMPL, SIBLING_TEST);
  assert.ok(matches.some((match) => match.testLine === 3 && match.sourceLine === 3));
});

test('a recomputed rule is classified rule, not input', () => {
  const matches = censusPair(SIBLING_IMPL, SIBLING_TEST);
  assert.deepEqual(
    [...new Set(matches.map((match) => match.kind))],
    ['rule'],
    'a filter over an in-memory array reads no input',
  );
});

test('a very short shape still reaches a match', () => {
  // Regression on a length filter an earlier probe carried: it dropped shapes
  // under 22 characters, and the whole point of the tool is a shape that short.
  // The claim is the CONJUNCTION -- short AND detected -- because asserting the
  // comparator alone is what let the filter hide.
  const impl = 'const a = rows\n  .sort()\n  .filter((r) => r.ok);';
  const spec = "test('x', () => {\n  const b = rows\n    .sort()\n    .filter((r) => r.ok);\n});";
  // unsourced-bound: asserts the shape is a short normalised token rather than the input; no
  // artifact states a length, and the exact value would pin an implementation detail (#4296).
  assert.ok(shapeOf('  .sort()').length < 10);
  const matches = censusPair(impl, spec);
  assert.ok(
    matches.some((match) => match.raw === '.sort()'),
    `a 7-character shape was dropped: ${JSON.stringify(matches.map((m) => m.raw))}`,
  );
});

test('the sibling pair matches and a different operation does not', () => {
  // A normaliser needs both directions asserted together: `() => ''` passes
  // every must-match test and `identity` passes every must-differ test.
  assert.equal(
    shapeOf('const r = uncovered.filter((id) => !known.has(id));'),
    shapeOf('const r = uncovered.filter((id) => !baseline.uncovered.includes(id));'),
  );
  assert.notEqual(shapeOf('const r = u.filter((i) => i);'), shapeOf('const r = u.map((i) => i);'));
});

test('a test calling the real function is not reported', () => {
  const impl = 'export function scan(files) {\n  return files.filter((f) => f.bad);\n}';
  const spec = "test('x', () => {\n  assert.equal(scan(fixture).length, 0);\n});";
  assert.deepEqual(censusPair(impl, spec), []);
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test('a chained continuation is classified by its statement', () => {
  const lines = [
    '  readdirSync(dir)',
    '    .filter((file) => /\\.ya?ml$/.test(file))',
    '    .sort()',
  ];
  assert.equal(classify(statementAt(lines, 1)), 'input');
  assert.equal(classify(statementAt(lines, 2)), 'input');
  // The defect this replaced: judged alone, both read as rules.
  assert.equal(classify(lines[1]), 'rule');
});

test('statement recovery stops at the chain head', () => {
  const lines = ['const a = 1;', '  readFileSync(p)', '    .split()'];
  assert.equal(statementAt(lines, 2), 'readFileSync(p) .split()');
});

test('a filter over memory is a rule even beside a read elsewhere', () => {
  const lines = ['const raw = readFileSync(p);', 'const bad = ids.filter((id) => !known.has(id));'];
  assert.equal(classify(statementAt(lines, 1)), 'rule');
});

// ---------------------------------------------------------------------------
// Shape normalisation
// ---------------------------------------------------------------------------

test('Set.has and Array.includes normalise together', () => {
  assert.equal(
    shapeOf('const r = u.filter((id) => !known.has(id));'),
    shapeOf('const r = u.filter((id) => !baseline.uncovered.includes(id));'),
  );
});

test('different operations keep different shapes', () => {
  assert.notEqual(
    shapeOf('const r = u.filter((id) => !known.has(id));'),
    shapeOf('const r = u.map((id) => !known.has(id));'),
    'collapsing filter and map would make every traversal look alike',
  );
});

test('negation is part of the shape', () => {
  assert.notEqual(
    shapeOf('const r = u.filter((id) => !known.has(id));'),
    shapeOf('const r = u.filter((id) => known.has(id));'),
    'an inverted rule must not read as the same rule',
  );
});

test('comments do not enter the shape', () => {
  assert.equal(shapeOf('a.filter((x) => x); // note'), shapeOf('a.filter((x) => x);'));
});

// ---------------------------------------------------------------------------
// Report sentences
// ---------------------------------------------------------------------------

const ALL = ['a.test.mjs:1 ~ a.mjs:1', 'b.test.mjs:2 ~ b.mjs:9', 'c.test.mjs:3 ~ c.mjs:4'];

// Deliberately asymmetric: two input, one rule. A fixture holding one of each
// cannot distinguish a report that separates the classes from one that swaps
// them, and a mutant doing exactly that survived the symmetric first draft.
const fakeResult = {
  pairs: 3,
  matches: [
    { id: ALL[0], kind: 'input', raw: 'readdirSync(d).filter((f) => f)' },
    { id: ALL[2], kind: 'input', raw: 'readFileSync(p).split()' },
    { id: ALL[1], kind: 'rule', raw: 'ids.filter((i) => !k.has(i))' },
  ],
};

test('the report separates input from rule rather than printing one total', () => {
  const { lines } = reportLines(fakeResult, ALL);
  assert.ok(lines.includes('  input construction          2'), lines.join('\n'));
  assert.ok(lines.includes('  rule reimplementation       1'), lines.join('\n'));
  assert.ok(lines.includes('lines sharing a shape         3'));
});

test('an unbaselined match fails and is named', () => {
  const { lines, failed } = reportLines(fakeResult, [ALL[0], ALL[2]]);
  assert.equal(failed, true);
  assert.ok(lines.some((line) => line.includes('UNCLASSIFIED b.test.mjs:2 ~ b.mjs:9')));
  assert.ok(lines.includes('unclassified (not in baseline) 1'));
});

test('a fully baselined census passes', () => {
  assert.equal(reportLines(fakeResult, ALL).failed, false);
});

test('a trailing semicolon is not part of the shape', () => {
  // Source and test rarely agree on punctuation: the same rule appears as a
  // statement in one file and as an argument in the other.
  const impl = 'const bad = ids.filter((i) => !k.has(i));';
  const spec = "test('x', () => {\n  const bad = ids.filter((i) => !k.has(i))\n});";
  assert.equal(censusPair(impl, spec).length, 1, 'punctuation split an identical rule');
});

test('the scope line is printed on the failing path too', () => {
  const { lines } = reportLines(fakeResult, []);
  assert.ok(lines.some((line) => line.startsWith('Not measured:')));
});

// ---------------------------------------------------------------------------
// Baseline and live tree
// ---------------------------------------------------------------------------

test('the baseline is four literal entries', () => {
  assert.equal(DUPLICATION_BASELINE.length, 4);
  assert.ok(DUPLICATION_BASELINE.every((entry) => entry.includes(' ~ ')));
});

test('every live match is input construction', () => {
  // Asserted through the report rather than by re-filtering `matches`.
  //
  // The first draft recomputed `matches.filter((m) => m.kind === 'rule')` --
  // character-identical to the line in `reportLines` that owns that decision --
  // and this checker failed itself in CI over it. It passed locally because
  // `census()` enumerates with `git ls-files`, and both new files were still
  // untracked: the instrument was outside its own population until committed.
  const result = census((file) => readFileSync(file, 'utf8'));
  // unsourced-bound: pair count grows with the fixture; nothing declares it. 11 was the count
  // when written and is a floor so adding a case does not fail the test (#4296).
  assert.ok(result.pairs >= 11, `pairs: ${result.pairs}`);
  const { lines } = reportLines(result);
  assert.ok(
    lines.includes('  rule reimplementation       0'),
    `a tool test now recomputes its own rule:\n${lines.join('\n')}`,
  );
});

test('the live tree is clean against the literal baseline', () => {
  const result = census((file) => readFileSync(file, 'utf8'));
  assert.equal(reportLines(result).failed, false);
});
