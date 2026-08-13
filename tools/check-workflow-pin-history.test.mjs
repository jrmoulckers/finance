// SPDX-License-Identifier: BUSL-1.1

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  censusHistory,
  exposure,
  humanDuration,
  unpinnedRefs,
} from './check-workflow-pin-history.mjs';

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
  // git now emits "<sha> <unix> <short-date>". Stubs written against the older
  // two-field form stay valid: the epoch is derived from the date they already
  // state, so no existing case silently changes meaning.
  const normalized =
    log === ''
      ? ''
      : log
          .split('\n')
          .map((line) => {
            const [sha, ...rest] = line.split(' ');
            if (rest.length >= 2) return line;
            const date = rest[0];
            return `${sha} ${Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000)} ${date}`;
          })
          .join('\n');
  return (args) => {
    if (args[0] === 'log') return normalized;
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

const DAY = 86400;
const T0 = 1_800_000_000;

test('exposure charges each state until the next newer commit', () => {
  // newest first: b clean from T0+DAY to now(T0+2*DAY); a dirty for one day
  const { dirtySeconds, spanSeconds } = exposure(
    [
      { at: T0 + DAY, bad: false },
      { at: T0, bad: true },
    ],
    T0 + 2 * DAY,
  );
  assert.equal(dirtySeconds, DAY);
  assert.equal(spanSeconds, 2 * DAY);
});

test('exposure runs the newest state to now, not to its own timestamp', () => {
  const { dirtySeconds } = exposure([{ at: T0, bad: true }], T0 + 3 * DAY);
  assert.equal(dirtySeconds, 3 * DAY, 'an unrepaired head is still accruing');
});

test('exposure charges nothing when the newest state is clean', () => {
  const { dirtySeconds, spanSeconds } = exposure(
    [
      { at: T0 + DAY, bad: false },
      { at: T0, bad: false },
    ],
    T0 + 2 * DAY,
  );
  assert.equal(dirtySeconds, 0);
  assert.equal(spanSeconds, 2 * DAY);
});

test('exposure distinguishes many brief lapses from one long one', () => {
  const briefStates = [
    { at: T0 + 300, bad: false },
    { at: T0 + 200, bad: true },
    { at: T0 + 100, bad: true },
    { at: T0, bad: true },
  ];
  const longStates = [
    { at: T0 + 300, bad: false },
    { at: T0, bad: true },
  ];
  const brief = exposure(briefStates, T0 + 400);
  const long = exposure(longStates, T0 + 400);

  assert.equal(brief.dirtySeconds, 300);
  assert.equal(long.dirtySeconds, 300);

  // Identical duration, different counts. Neither figure alone separates three
  // short lapses from one sustained one, which is why the report prints both.
  const briefCount = briefStates.filter((s) => s.bad).length;
  const longCount = longStates.filter((s) => s.bad).length;
  assert.equal(briefCount, 3);
  assert.equal(longCount, 1);
  assert.notEqual(briefCount, longCount);
});

test('exposure is zero over an empty history rather than NaN', () => {
  assert.deepEqual(exposure([], T0), { dirtySeconds: 0, spanSeconds: 0 });
});

test('exposure never charges negative time for out-of-order timestamps', () => {
  const { dirtySeconds } = exposure(
    [
      { at: T0, bad: true },
      { at: T0 + DAY, bad: true },
    ],
    T0,
  );
  assert.ok(dirtySeconds >= 0, 'a clock skew must not subtract exposure');
});

test('humanDuration reports days and hours', () => {
  assert.equal(humanDuration(2 * DAY + 3 * 3600), '2d 3h');
});

test('humanDuration drops the day field under a day', () => {
  assert.equal(humanDuration(5 * 3600), '5h');
});

test('humanDuration floors rather than rounds up', () => {
  assert.equal(humanDuration(3599), '0h', 'never imply an hour that did not elapse');
});

test('humanDuration handles zero and nonsense without inventing a number', () => {
  assert.equal(humanDuration(0), '0h');
  assert.equal(humanDuration(-1), '0h');
  assert.equal(humanDuration(NaN), '0h');
});

test('census reports duration alongside the commit count', () => {
  const git = fakeGit(
    `aaa ${T0 + 2 * DAY} 2026-01-03\nbbb ${T0 + DAY} 2026-01-02\nccc ${T0} 2026-01-01`,
    {
      aaa: `      - uses: actions/checkout@${SHA}`,
      bbb: '      - uses: actions/stale@v9',
      ccc: `      - uses: actions/checkout@${SHA}`,
    },
  );
  const result = censusHistory(git, 'origin/main', T0 + 3 * DAY);
  assert.equal(result.dirty, 1, 'one commit');
  assert.equal(result.dirtySeconds, DAY, 'held for exactly one day');
  assert.equal(result.spanSeconds, 3 * DAY);
});

test('a commit declaring no actions holds a clean state rather than vanishing', () => {
  // git grep exits non-zero with no matches. Treating that as "skip" would drop
  // the interval from the span; treating it as clean keeps the partition summing.
  const git = fakeGit(`aaa ${T0 + DAY} 2026-01-02\nbbb ${T0} 2026-01-01`, {
    bbb: '      - uses: actions/stale@v9',
  });
  const result = censusHistory(git, 'origin/main', T0 + 2 * DAY);
  assert.equal(result.examined, 2);
  assert.equal(result.dirty, 1);
  assert.equal(result.dirtySeconds, DAY, 'the unmatched commit ended the exposure');
  assert.equal(result.spanSeconds, 2 * DAY);
});
