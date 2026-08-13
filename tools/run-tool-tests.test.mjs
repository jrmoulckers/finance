import assert from 'node:assert/strict';
import test from 'node:test';

import { TOOLS_DIR, assertPopulation, reportLines, testFiles } from './run-tool-tests.mjs';

test('testFiles selects only test files', () => {
  const fake = { readdirSync: () => ['a.mjs', 'a.test.mjs', 'b.test.mjs'] };
  const files = testFiles('tools', fake);
  assert.equal(files.length, 2);
  assert.ok(files.every((f) => f.endsWith('.test.mjs')));
});

test('testFiles returns a sorted list', () => {
  const fake = { readdirSync: () => ['z.test.mjs', 'a.test.mjs'] };
  const files = testFiles('tools', fake);
  assert.ok(files[0].endsWith('a.test.mjs'));
});

test('testFiles finds this repository real suites', () => {
  assert.ok(testFiles().length >= 10);
});

test('testFiles includes this very file, so the population contains its own checker', () => {
  assert.ok(testFiles().some((f) => f.endsWith('run-tool-tests.test.mjs')));
});

test('assertPopulation throws rather than exiting zero over nothing', () => {
  assert.throws(() => assertPopulation([]), /empty population/);
});

test('assertPopulation accepts a non-empty population', () => {
  assert.doesNotThrow(() => assertPopulation(['tools/a.test.mjs']));
});

test('reportLines states the discovered count by value', () => {
  assert.ok(reportLines(['a', 'b', 'c'])[0].includes('3'));
});

test('reportLines distinguishes counts that differ', () => {
  assert.notEqual(reportLines(['a'])[0], reportLines(['a', 'b'])[0]);
});

test('reportLines records that the population came from disk', () => {
  assert.ok(reportLines(['a'])[1].includes('not from a shell glob'));
});

test('TOOLS_DIR is the directory the census and the runner share', () => {
  assert.equal(TOOLS_DIR, 'tools');
});
