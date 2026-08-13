import assert from 'node:assert/strict';
import test from 'node:test';

import { FENCE, markFences, fencedLineNumbers } from './markdown.mjs';

// The guard these tests cover had been written three times in this repository before it was
// written once in a shared place. This file is also the first test under a `tools/` subdirectory,
// and it is reached only because `run-tool-tests.mjs` discovery was made recursive in the same
// change -- before that, a test here would have run nowhere while looking like a test that runs.

test('FENCE matches both delimiters and tolerates indentation', () => {
  assert.equal(FENCE.test('```'), true);
  assert.equal(FENCE.test('~~~'), true);
  assert.equal(FENCE.test('   ```js'), true);
  assert.equal(FENCE.test('not a fence'), false);
  assert.equal(FENCE.test('a ``` mid-line'), false, 'a delimiter starts its line');
});

test('markFences marks the delimiter lines themselves', () => {
  // So a caller can skip on the flag alone. A caller that had to recognise the fence separately
  // would be reimplementing the thing it imported.
  const marked = markFences('a\n```\nb\n```\nc');
  assert.deepEqual(
    marked.map((entry) => entry.fenced),
    [false, true, true, true, false],
  );
});

test('markFences leaves an unterminated fence open to the end', () => {
  const marked = markFences('a\n```\nb\nc');
  assert.deepEqual(
    marked.map((entry) => entry.fenced),
    [false, true, true, true],
    'which is what a renderer does, and therefore what a reader sees',
  );
});

test('markFences handles CRLF without leaving a carriage return on every line', () => {
  const marked = markFences('a\r\n```\r\nb\r\n```\r\nc');
  assert.deepEqual(
    marked.map((entry) => entry.line),
    ['a', '```', 'b', '```', 'c'],
  );
  assert.deepEqual(
    marked.map((entry) => entry.fenced),
    [false, true, true, true, false],
  );
});

test('markFences returns one entry per line, including a trailing blank', () => {
  assert.equal(markFences('a\nb\n').length, 3);
  assert.equal(markFences('').length, 1, 'an empty document is one empty line, not zero');
});

test('markFences coerces rather than throwing on a non-string', () => {
  assert.deepEqual(markFences(undefined), [{ line: 'undefined', fenced: false }]);
});

test('a tilde fence closes a tilde fence', () => {
  const marked = markFences('a\n~~~\nb\n~~~\nc');
  assert.equal(marked[2].fenced, true);
  assert.equal(marked[4].fenced, false);
});

test('fencedLineNumbers is one-based and includes the delimiters', () => {
  assert.deepEqual([...fencedLineNumbers('a\n```\nb\n```\nc')], [2, 3, 4]);
});

test('fencedLineNumbers is empty when the document has no fence', () => {
  assert.equal(fencedLineNumbers('a\nb\nc').size, 0);
});

test('fencedLineNumbers agrees with markFences rather than re-deriving', () => {
  // Two implementations of one rule is how a filter and its census come to disagree.
  const text = 'a\n```\nb\n```\nc\n~~~\nd';
  const fromMarks = new Set(
    markFences(text)
      .map((entry, index) => (entry.fenced ? index + 1 : null))
      .filter((n) => n !== null),
  );
  assert.deepEqual([...fencedLineNumbers(text)], [...fromMarks]);
});
