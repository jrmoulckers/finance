// SPDX-License-Identifier: BUSL-1.1

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  censusHistory,
  exposure,
  humanDuration,
  unpinnedRefs,
  episodes,
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

// --- shape: episodes, transitions, streak -----------------------------------

const S = (...pairs) => pairs.map(([at, bad]) => ({ at, bad }));

test('a permissions key ending in uses: is not a step', () => {
  // `statuses: read` ends with the literal `uses:`. A boundary-free pattern
  // matched it; a scratch probe without the `@` requirement then reported 90
  // dirty commits against this tool's 89, and the extra one was this line.
  assert.equal(unpinnedRefs('  statuses: read').size, 0);
  assert.equal(unpinnedRefs('  statuses: read@v1').size, 0);
});

test('a uses: with no ref at all is the most unpinned form there is', () => {
  // Resolves to the action's default branch. The earlier pattern required an
  // `@` in order to match, so it could not report this at any severity.
  assert.deepEqual(
    [...unpinnedRefs('      uses: actions/checkout')],
    ['actions/checkout@<no ref>'],
  );
});

test('a local reusable workflow is not an unpinned action', () => {
  // Load-bearing again. This guard was correctly removed once -- nothing failed
  // without it, because the old pattern needed an `@` these paths do not have.
  // Counting a missing `@` revived it: there are 8 such calls at HEAD.
  assert.equal(unpinnedRefs('      uses: ./.github/workflows/reusable-detect-changes.yml').size, 0);
  assert.equal(unpinnedRefs('      uses: docker://alpine').size, 0);
});

test('a list-item uses: is still a step', () => {
  // The boundary must admit the `- uses:` form at the start of a YAML step.
  // Note what this does NOT establish: the dash. A first version of the pattern
  // put `-` in the boundary character class for this case, and mutation testing
  // removed it without failing here -- the space after the dash was matching.
  assert.deepEqual([...unpinnedRefs('    - uses: actions/checkout@v4')], ['actions/checkout@v4']);
  assert.deepEqual([...unpinnedRefs('- uses: actions/checkout@v4')], ['actions/checkout@v4']);
});

test('a sha-pinned action is still clean under the new pattern', () => {
  const sha = 'a'.repeat(40);
  assert.equal(unpinnedRefs(`      uses: actions/checkout@${sha}`).size, 0);
});

test('three lapses in a row are one episode, not three', () => {
  // The whole point: contiguity, not count.
  const states = S([400, false], [300, true], [200, true], [100, true]);
  const r = episodes(states, 500);
  assert.equal(r.episodes.length, 1);
});

test('lapses separated by a clean commit are separate episodes', () => {
  const states = S([500, false], [400, true], [300, false], [200, true]);
  const r = episodes(states, 600);
  assert.equal(r.episodes.length, 2);
});

test('an episode spans from its first bad commit to the next clean one', () => {
  const states = S([500, false], [400, true], [300, true]);
  const [e] = episodes(states, 600).episodes;
  assert.equal(e.from, 300);
  assert.equal(e.to, 500);
  assert.equal(e.seconds, 200);
});

test('an episode still open at HEAD runs to now, not to the last commit', () => {
  // Otherwise a currently-broken branch reports its exposure as ending when it
  // was last touched, which is the flattering direction.
  const states = S([400, true], [300, false]);
  const [e] = episodes(states, 1000).episodes;
  assert.equal(e.to, 1000);
});

test('transitions count edges, not bad commits', () => {
  // Three bad commits in a row is one transition in and one out.
  const states = S([500, false], [400, true], [300, true], [200, true], [100, false]);
  assert.equal(episodes(states, 600).transitions, 2);
});

test('a branch that was never clean has no transitions and one episode', () => {
  const states = S([300, true], [200, true], [100, true]);
  const r = episodes(states, 400);
  assert.equal(r.transitions, 0);
  assert.equal(r.episodes.length, 1);
  assert.equal(r.bornCompliant, false);
});

test('born compliant reads the oldest commit, not the newest', () => {
  // Survives a mutant reading states[0]: the newest commit here is clean and
  // the oldest is not, so an index error inverts the answer.
  assert.equal(episodes(S([300, false], [200, true], [100, true]), 400).bornCompliant, false);
  assert.equal(episodes(S([300, true], [200, false], [100, false]), 400).bornCompliant, true);
});

test('the compliant streak measures back from now to the first clean commit', () => {
  const r = episodes(S([300, false], [250, false], [200, true]), 400);
  assert.equal(r.currentStreakSeconds, 400 - 250);
});

test('a branch dirty at HEAD has no compliant streak', () => {
  // Not "a very short streak" -- zero. Reporting the gap since the last commit
  // as a streak would credit a broken branch for the time it stayed broken.
  assert.equal(episodes(S([300, true], [200, false]), 400).currentStreakSeconds, 0);
});

test('the longest episode is the maximum, not the most recent', () => {
  // Survives a mutant taking the last element: the fixture is ordered so the
  // newest episode is the shorter one.
  const states = S([900, false], [850, true], [800, false], [400, true], [100, false]);
  const r = episodes(states, 1000);
  assert.equal(r.longestSeconds, 400);
});

test('an empty history has no shape rather than a zero-length one', () => {
  const r = episodes([], 100);
  assert.deepEqual(r.episodes, []);
  assert.equal(r.transitions, 0);
  assert.equal(r.bornCompliant, true);
});

test('episode seconds sum to the exposure measured independently', () => {
  // Cross-check between the two functions. Asymmetric on purpose: an even
  // split would pass a mutant that duplicated one half.
  const states = S([1000, false], [900, true], [700, false], [400, true], [100, false]);
  const total = episodes(states, 1100).episodes.reduce((s, e) => s + e.seconds, 0);
  assert.equal(total, exposure(states, 1100).dirtySeconds);
  assert.equal(total, 400);
});
