// SPDX-License-Identifier: BUSL-1.1

import assert from 'node:assert/strict';
import test from 'node:test';

import { censusHistory, unpinnedRefs } from './check-workflow-pin-history.mjs';

const SHA = 'a'.repeat(40);

test('a SHA-pinned ref is not reported', () => {
  assert.equal(unpinnedRefs(`      - uses: actions/checkout@${SHA} # v7.0.0`).size, 0);
});

test('a tag-pinned ref is reported', () => {
  const found = unpinnedRefs('      - uses: actions/checkout@v4');
  assert.deepEqual([...found], ['actions/checkout@v4']);
});

test('a branch-pinned ref is reported', () => {
  const found = unpinnedRefs('      - uses: trufflesecurity/trufflehog@main');
  assert.deepEqual([...found], ['trufflesecurity/trufflehog@main']);
});

test('a fully commented-out step is not reported', () => {
  // The defect that produced 209-of-209 on the first census: `git grep uses:`
  // matches commented-out future steps, and those are not steps.
  const text = [
    '      # - name: Setup Python',
    '      #   uses: actions/setup-python@v5',
    '      #   uses: actions/setup-dotnet@v4',
  ].join('\n');
  assert.equal(unpinnedRefs(text).size, 0);
});

test('a commented-out step does not mask a real one on another line', () => {
  const text = ['      #   uses: actions/setup-python@v5', '      - uses: actions/stale@v9'].join(
    '\n',
  );
  assert.deepEqual([...unpinnedRefs(text)], ['actions/stale@v9']);
});

test('a trailing comment does not hide the ref before it', () => {
  const found = unpinnedRefs('      - uses: actions/checkout@v4 # not pinned');
  assert.deepEqual([...found], ['actions/checkout@v4']);
});

test('a local reusable workflow never matches, because it carries no @ref', () => {
  // Asserting the reason, not just the outcome. An earlier version of this test
  // read as coverage for an explicit `./` guard; mutation testing showed the
  // guard could be deleted with the test still green, because the fixture has
  // no `@` and so never reaches the guard at all. The guard was removed.
  assert.equal(unpinnedRefs('      uses: ./.github/workflows/ci-shared.yml').size, 0);
  assert.doesNotMatch('      uses: ./.github/workflows/ci-shared.yml', /@/);
});

test('duplicate refs collapse to one entry', () => {
  const text = ['      - uses: actions/stale@v9', '      - uses: actions/stale@v9'].join('\n');
  assert.equal(unpinnedRefs(text).size, 1);
});

test('quoted refs are handled', () => {
  assert.deepEqual([...unpinnedRefs("      - uses: 'actions/stale@v9'")], ['actions/stale@v9']);
});

function fakeGit(log, grepBySha) {
  return (args) => {
    if (args[0] === 'log') return log;
    if (args[0] === 'grep') {
      const sha = args[4];
      if (!(sha in grepBySha)) throw new Error('no match');
      return grepBySha[sha];
    }
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
}

test('census counts only the commits that carried a violation', () => {
  const git = fakeGit('aaa 2026-01-03\nbbb 2026-01-02\nccc 2026-01-01', {
    aaa: `      - uses: actions/checkout@${SHA}`,
    bbb: '      - uses: actions/stale@v9',
    ccc: '      - uses: actions/stale@v9',
  });
  const result = censusHistory(git, 'origin/main');
  assert.equal(result.examined, 3);
  assert.equal(result.dirty, 2);
  assert.equal(result.refs.size, 1);
});

test('census reports a clean head separately from a clean history', () => {
  const git = fakeGit('aaa 2026-01-02\nbbb 2026-01-01', {
    aaa: `      - uses: actions/checkout@${SHA}`,
    bbb: '      - uses: actions/stale@v9',
  });
  const result = censusHistory(git, 'origin/main');
  assert.equal(result.headClean, true, 'head is pinned');
  assert.equal(result.dirty, 1, 'history is not');
});

test('census flags a dirty head', () => {
  const git = fakeGit('aaa 2026-01-01', { aaa: '      - uses: actions/stale@v9' });
  assert.equal(censusHistory(git, 'origin/main').headClean, false);
});

test('most recent occurrence is the newest dirty commit, not the newest commit', () => {
  const git = fakeGit('aaa 2026-01-03\nbbb 2026-01-02\nccc 2026-01-01', {
    aaa: `      - uses: actions/checkout@${SHA}`,
    bbb: '      - uses: actions/stale@v9',
    ccc: '      - uses: actions/checkout@v4',
  });
  const result = censusHistory(git, 'origin/main');
  assert.equal(result.lastDirty.sha, 'bbb');
  assert.equal(result.lastDirty.date, '2026-01-02');
});

test('first-seen attribution keeps the oldest commit for a ref', () => {
  const git = fakeGit('aaa 2026-01-02\nbbb 2026-01-01', {
    aaa: '      - uses: actions/stale@v9',
    bbb: '      - uses: actions/stale@v9',
  });
  const result = censusHistory(git, 'origin/main');
  assert.match(result.refs.get('actions/stale@v9'), /bbb 2026-01-01/);
});

test('a commit whose grep finds nothing is skipped, not counted dirty', () => {
  const git = fakeGit('aaa 2026-01-01\nbbb 2026-01-02', {
    aaa: '      - uses: actions/stale@v9',
  });
  const result = censusHistory(git, 'origin/main');
  assert.equal(result.examined, 2);
  assert.equal(result.dirty, 1);
});

test('an empty history reports zero rather than throwing', () => {
  const result = censusHistory(fakeGit('', {}), 'origin/main');
  assert.equal(result.examined, 0);
  assert.equal(result.dirty, 0);
  assert.equal(result.lastDirty, null);
});
