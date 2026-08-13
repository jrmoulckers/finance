#!/usr/bin/env node
/**
 * check-test-independence.mjs
 *
 * Fails when a test file recomputes a rule its implementation already owns.
 *
 * Origin: a sibling session found a coverage test whose `regressions` and
 * `stale` expressions were the checker's own expressions, one written with
 * `Set.has` and the other with `Array.includes`. Both files agreed, the suite
 * was green, and changing the rule in the checker would have left the test
 * computing the old rule -- reporting agreement about a question nobody asked.
 *
 * Exact-text matching cannot see that pair, so this compares normalised
 * SHAPES: identifiers collapse to `X`, and interchangeable membership tests
 * (`Set.has` / `Array.includes`) normalise together.
 *
 * Not every shared shape is a defect. A test that discovers its input the way
 * the tool does, then calls the real function and asserts its behaviour, is
 * duplicating INPUT CONSTRUCTION, which is cheap and honest. The defect is
 * duplicated RULE: the test deciding the answer for itself. `classify()` draws
 * that line, and the baseline records which side each known match sits on.
 *
 * The gate deliberately fails on any UNCLASSIFIED match rather than asserting a
 * verdict, because shape matching is a heuristic. A new match is a question for
 * a reader -- "is this input or rule?" -- and the population is small enough
 * (4 today, across 10 pairs) that answering it by eye is a minute's work.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Line shapes that are known duplication of input construction, not of a rule.
 *
 * Literal entries, never derived from a run: a baseline expressed in terms of
 * the census it constrains cannot detect being loosened.
 */
export const DUPLICATION_BASELINE = [
  'check-node-version-consistency.test.mjs:107 ~ check-node-version-consistency.mjs:425',
  'check-workflow-security.test.mjs:337 ~ check-workflow-security.mjs:608',
  'check-workflow-security.test.mjs:338 ~ check-workflow-security.mjs:609',
  'check-workflow-security.test.mjs:339 ~ check-workflow-security.mjs:610',
];

/** Operations whose presence makes a line a candidate for carrying a rule. */
const COMPUTES = /\.(filter|map|reduce|some|every|sort|find|findIndex)\(|\.includes\(|\.has\(/;

/** Reads that make a line input construction rather than a decision. */
const READS_INPUT = /readdirSync|readFileSync|execFileSync|globSync|import\(/;

const KEEP_WORDS = new Set([
  'filter',
  'map',
  'reduce',
  'some',
  'every',
  'sort',
  'find',
  'findIndex',
  'includes',
  'test',
  'match',
  'replace',
  'split',
  'join',
  'length',
  'push',
  'slice',
  'trim',
  'startsWith',
  'endsWith',
  'const',
  'let',
  'return',
  'of',
  'in',
]);

/**
 * Collapse a line to a comparable shape.
 *
 * `known.has(id)` and `baseline.uncovered.includes(id)` must produce the same
 * shape; that pair is the reason this function exists, and the test suite
 * exercises it through the whole census rather than in isolation.
 *
 * @param {string} line Source line.
 * @returns {string} Normalised shape.
 */
export function shapeOf(line) {
  return (
    line
      .trim()
      .replace(/\/\/.*$/, '')
      .replace(/\s+/g, ' ')
      .replace(/\.has\(/g, '.includes(')
      .replace(/\bnew Set\(([^)]*)\)/g, '$1')
      // The character class must exclude `.`. An earlier version wrote
      // `[\w$.]*`, which consumed `uncovered.filter` as a single token and
      // replaced it wholesale -- so KEEP_WORDS never fired for a method call,
      // `filter` and `map` shared a shape, and the matcher was far looser than
      // its own word list claimed. Over-looseness only ever inflates a match
      // count, so it could not have produced a false clean bill; it could and
      // did produce a false understanding of what the tool compares.
      .replace(/[A-Za-z_$][\w$]*/g, (word) => (KEEP_WORDS.has(word) ? word : 'X'))
      // Collapse property chains, so `known` and `baseline.uncovered` are the
      // same shape of thing. Excluding `.` above and collapsing here are a pair:
      // excluding it alone made the sibling's `X.includes` / `X.X.includes` pair
      // stop matching, which is the case the tool exists for. Every normaliser
      // needs both a must-match and a must-differ assertion, because
      // `() => ''` satisfies all of the first kind and `identity` all of the
      // second, and neither is a normaliser.
      .replace(/X(?:\.X)+/g, 'X')
      .trim()
      .replace(/;$/, '')
      .trim()
  );
}

/**
 * Recover the whole statement a line belongs to.
 *
 * Method chains put the read on one line and the decision on the next, so a
 * per-line classifier reads `.filter(...)` with no `readdirSync` in sight and
 * calls it a rule. Walking back over leading-dot continuations restores the
 * population the classification is actually about.
 *
 * @param {string[]} lines All lines of the file.
 * @param {number} index Zero-based index of the matched line.
 * @returns {string} The enclosing statement.
 */
export function statementAt(lines, index) {
  let start = index;
  while (start > 0 && lines[start].trim().startsWith('.')) start -= 1;
  return lines
    .slice(start, index + 1)
    .map((line) => line.trim())
    .join(' ');
}

/**
 * Decide whether shared code duplicates input construction or a rule.
 *
 * Takes the statement, not the line: classifying the line mislabelled two of
 * this repo's four matches as reimplemented rules when both were continuations
 * of a `readdirSync` chain. An over-reporting classifier is a false accusation,
 * the mirror of an under-reporting disclaimer.
 *
 * @param {string} statement Enclosing statement text.
 * @returns {'input' | 'rule'} Classification.
 */
export function classify(statement) {
  return READS_INPUT.test(statement) ? 'input' : 'rule';
}

/**
 * Compare one implementation against its test file.
 *
 * @param {string} sourceText Implementation text.
 * @param {string} testText Test text.
 * @returns {Array<{testLine: number, sourceLine: number, raw: string, kind: string}>} Matches.
 */
export function censusPair(sourceText, testText) {
  const shapes = new Map();
  const eligible = (raw) =>
    raw.length > 0 && !raw.startsWith('*') && !raw.startsWith('//') && COMPUTES.test(raw);

  sourceText.split('\n').forEach((line, index) => {
    const raw = line.trim();
    if (!eligible(raw)) return;
    const shape = shapeOf(line);
    // No length threshold. An earlier probe dropped shapes under 22 characters
    // and would have excluded the 19-character shape it was written to find.
    if (shape.length === 0) return;
    if (!shapes.has(shape)) shapes.set(shape, index + 1);
  });

  const matches = [];
  const testLines = testText.split('\n');
  testLines.forEach((line, index) => {
    const raw = line.trim();
    if (!eligible(raw)) return;
    const shape = shapeOf(line);
    if (shape.length === 0) return;
    if (!shapes.has(shape)) return;
    matches.push({
      testLine: index + 1,
      sourceLine: shapes.get(shape),
      raw,
      kind: classify(statementAt(testLines, index)),
    });
  });
  return matches;
}

/**
 * Census every tool that has a sibling test file.
 *
 * @param {(file: string) => string} read File reader, injectable for tests.
 * @param {string[]} [toolFiles] Implementation paths.
 * @returns {{pairs: number, matches: object[]}} Census result.
 */
export function census(read, toolFiles) {
  const tools =
    toolFiles ??
    execFileSync('git', ['ls-files', 'tools/*.mjs'], { encoding: 'utf8' })
      .split('\n')
      .filter((file) => file && !file.endsWith('.test.mjs'));

  let pairs = 0;
  const matches = [];
  for (const tool of tools) {
    const testFile = tool.replace(/\.mjs$/, '.test.mjs');
    if (!existsSync(testFile)) continue;
    pairs += 1;
    for (const hit of censusPair(read(tool), read(testFile))) {
      matches.push({
        ...hit,
        id: `${testFile.split('/').pop()}:${hit.testLine} ~ ${tool.split('/').pop()}:${hit.sourceLine}`,
      });
    }
  }
  return { pairs, matches };
}

/**
 * Build the printed report.
 *
 * Returned rather than printed so the sentences can be asserted; the counts
 * were never the untested half.
 *
 * @param {{pairs: number, matches: object[]}} result Census result.
 * @param {string[]} [baseline] Known-classified match ids.
 * @returns {{lines: string[], failed: boolean}} Report.
 */
export function reportLines(result, baseline = DUPLICATION_BASELINE) {
  const known = new Set(baseline);
  const unclassified = result.matches.filter((match) => !known.has(match.id));
  const rules = result.matches.filter((match) => match.kind === 'rule');
  const lines = [
    `tool/test pairs examined      ${result.pairs}`,
    `lines sharing a shape         ${result.matches.length}`,
    `  input construction          ${result.matches.filter((m) => m.kind === 'input').length}`,
    `  rule reimplementation       ${rules.length}`,
    `unclassified (not in baseline) ${unclassified.length}`,
    '',
    'Not measured: duplication expressed differently enough that the shapes',
    'diverge, and duplication across files that are not a tool/test pair.',
    'A shared shape is evidence of a shared decision, not proof of one.',
  ];
  for (const match of unclassified) {
    lines.push(`  UNCLASSIFIED ${match.id}`, `    ${match.raw.slice(0, 100)}`);
  }
  return { lines, failed: unclassified.length > 0 };
}

function main() {
  const result = census((file) => readFileSync(file, 'utf8'));
  const report = reportLines(result);
  for (const line of report.lines) console.log(line);
  if (report.failed) {
    console.error('\nA test line now shares a shape with the code it verifies.');
    console.error('Classify it: input construction is fine and belongs in the');
    console.error('baseline; a reimplemented rule means the test decides the');
    console.error('answer itself and cannot detect the rule changing.');
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-test-independence.mjs')) main();
