import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  ARTIFACT_PATTERN,
  TOOLS_DIR,
  assertPopulation,
  leakLines,
  leakedArtifacts,
  reportLines,
  testFiles,
} from './run-tool-tests.mjs';

// Leaked-fixture detection (#4308).
//
// Three PROBE-4300-* files created with `wx` outside their own try block survived a killed run.
// The next run's exclusive create threw EEXIST before entering `try`, so the cleanup could never
// run again: the suite latched at 586/591 across two byte-identical runs and only a manual delete
// exited the state. The five failures named citation-ownership rules, not the stray files.

test('leakedArtifacts finds a stale fixture at the repository root', () => {
  const fake = { readdirSync: (dir) => (dir === '.' ? ['README.md', 'PROBE-4300-text.md'] : []) };
  assert.deepEqual(leakedArtifacts(fake), ['PROBE-4300-text.md']);
});

test('leakedArtifacts scans the nested directory fixtures are also written to', () => {
  const fake = {
    readdirSync: (dir) => (dir === '.' ? [] : ['runbook.md', 'PROBE-4287-991-x.md']),
  };
  assert.deepEqual(leakedArtifacts(fake), [path.join('docs', 'ops', 'PROBE-4287-991-x.md')]);
});

test('leakedArtifacts reports nothing on a clean tree', () => {
  const fake = { readdirSync: () => ['README.md', 'package.json'] };
  assert.deepEqual(leakedArtifacts(fake), []);
});

test('leakedArtifacts tolerates a missing directory rather than throwing', () => {
  const fake = {
    readdirSync: (dir) => {
      if (dir !== '.') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return ['PROBE-x'];
    },
  };
  assert.deepEqual(leakedArtifacts(fake), ['PROBE-x']);
});

test('ARTIFACT_PATTERN matches the per-process names fixtures now use', () => {
  // The fix gives each fixture a pid+timestamp suffix so a leak cannot collide with a later run.
  // The detector must still recognise those, or the fix would silence the detector.
  for (const name of ['PROBE-4300-text-12345-lz3k9.md', 'PROBE-4287-991-x.md', 'PROBE-4300.kt']) {
    assert.ok(ARTIFACT_PATTERN.test(name), name);
  }
  for (const name of ['README.md', 'probe.md', 'my-PROBE-1.md']) {
    assert.ok(!ARTIFACT_PATTERN.test(name), name);
  }
});

test('leakLines names every leaked file, since the failing assertions will not', () => {
  const files = ['PROBE-a.md', 'PROBE-b.md'];
  for (const phase of ['before', 'after']) {
    const message = leakLines(files, phase);
    for (const file of files) assert.ok(message.includes(file), `${phase}: ${file}`);
  }
});

test('leakLines distinguishes an inherited leak from one this run created', () => {
  const before = leakLines(['PROBE-a.md'], 'before');
  const after = leakLines(['PROBE-a.md'], 'after');
  assert.notEqual(before, after);
  assert.match(before, /before the suite started/);
  assert.match(before, /A previous run was killed/);
  assert.match(after, /left behind by this run/);
  assert.match(after, /The run that leaks is the run that must fail/);
});

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
  // unsourced-bound: no artifact commits to how many tool test files exist -- that is the
  // point of enumerating from disk. A floor only excludes a silently emptied glob (#4296).
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
