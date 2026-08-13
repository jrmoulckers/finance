#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

/**
 * Answers the event question that `check-workflow-security.mjs` cannot.
 *
 * The pinning gate is a state census over the working tree. Unpinned action
 * refs are remediable, and remediation removes the evidence, so a green tree
 * says nothing about whether the violation ever landed. This walks the history
 * of `.github/workflows` and counts the commits that actually carried one.
 *
 * Deliberately not wired into CI. It needs full history, which shallow CI
 * clones do not have, and a historical report that fails a pull request for
 * something a previous commit did is a gate pointed at the wrong target.
 */

import { execFileSync } from 'node:child_process';

const SHA_RE = /^[0-9a-f]{40}$/;
// The `(?:^|\s)` boundary is load-bearing: `statuses: read` ends in `uses:`
// and matched a boundary-free pattern. It never produced a wrong answer here,
// because an earlier form of this regex also required an `@` and that line has
// none -- one latent defect was masking another. A scratch probe written
// without the `@` requirement reported 90 dirty commits against this tool's 89,
// and the extra commit was a `permissions:` block.
//
// The boundary was first written `[\s-]`, to admit the `- uses:` form at the
// start of a YAML step, with a test that appeared to cover it. Mutation testing
// removed the `-` and the test still passed: there is always a space between
// the dash and the keyword, so `\s` had been doing the work all along. Exactly
// the failure recorded below about the `./` guard, in the same function, two
// revisions apart -- an assertion written to illustrate a token rather than to
// test it.
const USES_RE = /(?:^|\s)uses:\s*['"]?([^\s'"#]+)/;

/**
 * Extract unpinned `uses:` refs from raw workflow text.
 *
 * One exclusion, load-bearing, and discovered by getting it wrong: fully
 * commented-out lines are not steps. A first version of this census omitted the
 * comment rule and reported 209 of 209 commits dirty, including a HEAD the gate
 * passes -- an instrument defect pointing in the accusatory direction, which is
 * the one direction an instrument must not fail in.
 *
 * A `uses:` with no `@ref` at all is the *most* unpinned form there is -- it
 * resolves to the action's default branch -- and an earlier version of this
 * function could not report it, because the pattern required an `@` in order to
 * match. There are 0 such entries in this repository's history, so the gap was
 * latent rather than live, and no count changes by closing it.
 *
 * Closing it revives a guard that mutation testing had correctly called dead.
 * The `./` exclusion for local reusable workflows was removed once, on the
 * sound finding that nothing failed without it: those paths carry no `@`, so
 * the old pattern skipped them anyway. Now that a missing `@` is itself a
 * finding, the guard does real work again -- there are 8 such calls at HEAD,
 * and without it every one would be reported as an unpinned action. Dead code
 * is only dead relative to the strictness of the checks around it, and a
 * mutation result is evidence about the suite as it stood, not a permanent
 * property of the line.
 *
 * @param {string} text Raw lines containing candidate `uses:` entries.
 * @returns {Set<string>} Distinct `action@ref` strings that are not SHA-pinned.
 */
export function unpinnedRefs(text) {
  const found = new Set();
  for (const line of text.split('\n')) {
    if (/^\s*#/.test(line)) continue;
    const match = line.match(USES_RE);
    if (!match) continue;
    const target = match[1];
    if (target.startsWith('./') || target.startsWith('docker://')) continue;
    const at = target.indexOf('@');
    if (at === -1) {
      found.add(`${target}@<no ref>`);
      continue;
    }
    const action = target.slice(0, at);
    const ref = target.slice(at + 1);
    if (!SHA_RE.test(ref)) found.add(`${action}@${ref}`);
  }
  return found;
}

/**
 * Census the pinning state of every commit that touched the workflow directory.
 *
 * @param {(args: string[]) => string} git Runner returning git stdout.
 * @param {string} ref Git ref to walk.
 * @param {number} nowSeconds Unix seconds treated as "now" for the open interval at HEAD.
 * @returns {{examined: number, dirty: number, refs: Map<string, string>, lastDirty: object | null, headClean: boolean, dirtySeconds: number, spanSeconds: number}}
 *   `refs` maps each unpinned `action@ref` to the oldest commit that carried it.
 */
export function censusHistory(
  git,
  ref = 'origin/main',
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const listed = git([
    'log',
    '--format=%H %at %ad',
    '--date=short',
    ref,
    '--',
    '.github/workflows',
  ]).trim();
  const commits = listed === '' ? [] : listed.split('\n').map((line) => line.split(' '));

  const refs = new Map();
  let dirty = 0;
  let lastDirty = null;
  let headClean = true;
  /** @type {{at: number, bad: boolean}[]} */
  const states = [];

  for (const [sha, at, date] of commits) {
    let text;
    try {
      text = git(['grep', '-h', '-E', 'uses:', sha, '--', '.github/workflows']);
    } catch {
      // git grep exits non-zero when nothing matches, which means this tree
      // declares no actions at all. That is a clean state, not an absent one --
      // dropping it here would silently remove its interval from the span.
      text = '';
    }
    const bad = unpinnedRefs(text);
    states.push({ at: Number(at), bad: bad.size > 0 });
    if (bad.size === 0) continue;
    dirty += 1;
    if (lastDirty === null) lastDirty = { sha: sha.slice(0, 8), date, refs: [...bad] };
    if (sha === commits[0][0]) headClean = false;
    for (const entry of bad) {
      // git log is reverse-chronological, so overwriting on every pass leaves
      // the oldest commit carrying the ref -- when it was introduced. Keeping
      // the first write would record the most recent occurrence under a name
      // that says the opposite; the scratch census this was extracted from had
      // that inverted and never noticed, because the headline counts do not
      // depend on which commit gets attributed.
      refs.set(entry, `${sha.slice(0, 8)} ${date}`);
    }
  }

  const { dirtySeconds, spanSeconds } = exposure(states, nowSeconds);
  const shape = episodes(states, nowSeconds);

  return {
    examined: commits.length,
    dirty,
    refs,
    lastDirty,
    headClean,
    dirtySeconds,
    spanSeconds,
    shape,
  };
}

/**
 * Convert a reverse-chronological list of branch states into elapsed time.
 *
 * A count of non-compliant commits is complete over commits and silent about
 * duration: seven of them may be seven minutes or four days. Only commits that
 * touch the workflow directory change the branch's pinning state, so each one's
 * state holds until the next newer such commit -- and the newest holds until now.
 *
 * @param {{at: number, bad: boolean}[]} states Newest first.
 * @param {number} nowSeconds
 * @returns {{dirtySeconds: number, spanSeconds: number}}
 */
export function exposure(states, nowSeconds) {
  if (states.length === 0) return { dirtySeconds: 0, spanSeconds: 0 };
  let dirtySeconds = 0;
  for (let i = 0; i < states.length; i += 1) {
    const until = i === 0 ? nowSeconds : states[i - 1].at;
    const held = Math.max(0, until - states[i].at);
    if (states[i].bad) dirtySeconds += held;
  }
  const spanSeconds = Math.max(0, nowSeconds - states[states.length - 1].at);
  return { dirtySeconds, spanSeconds };
}

/**
 * Split a state series into contiguous non-compliant episodes.
 *
 * A count is complete over commits and silent about duration; a duration is
 * complete over time and silent about *shape*. Eighty-nine non-compliant commits
 * may be eighty-nine independent regressions or three episodes nobody noticed,
 * and those have opposite implications for the decision the number is consulted
 * for -- whether a gate is warranted, or whether one already worked.
 *
 * This repository reads as "89 of 209" and is in fact **three** episodes, one of
 * which holds 83% of all exposure. The scattered reading was asserted in a
 * report before it was measured; nothing in the count supported it either way.
 * Both figures in this paragraph were briefly wrong here too -- 90 and 86% --
 * carried in from a scratch probe that over-matched `statuses: read`, and left
 * in the prose after the probe itself had been retracted.
 *
 * @param {{at: number, bad: boolean}[]} states Newest first.
 * @param {number} nowSeconds
 * @returns {{episodes: {from: number, to: number, seconds: number}[], transitions: number,
 *   bornCompliant: boolean, currentStreakSeconds: number, longestSeconds: number}}
 */
export function episodes(states, nowSeconds) {
  if (states.length === 0) {
    return {
      episodes: [],
      transitions: 0,
      bornCompliant: true,
      currentStreakSeconds: 0,
      longestSeconds: 0,
    };
  }
  const found = [];
  let open = null;
  // Walk oldest -> newest so an episode is built forward in time.
  for (let i = states.length - 1; i >= 0; i -= 1) {
    const until = i === 0 ? nowSeconds : states[i - 1].at;
    if (states[i].bad) {
      if (open) open.to = until;
      else open = { from: states[i].at, to: until };
    } else if (open) {
      found.push(open);
      open = null;
    }
  }
  if (open) found.push(open);
  for (const e of found) e.seconds = Math.max(0, e.to - e.from);

  let transitions = 0;
  for (let i = states.length - 1; i > 0; i -= 1) {
    if (states[i].bad !== states[i - 1].bad) transitions += 1;
  }

  // How long the branch has been clean, counted back from now. A single
  // transition invites "the practice stuck"; the streak is what says whether
  // there is enough elapsed time for that reading to mean anything.
  let streakFrom = nowSeconds;
  for (const s of states) {
    if (s.bad) break;
    streakFrom = s.at;
  }
  const currentStreakSeconds = states[0].bad ? 0 : Math.max(0, nowSeconds - streakFrom);

  return {
    episodes: found,
    transitions,
    bornCompliant: !states[states.length - 1].bad,
    currentStreakSeconds,
    longestSeconds: found.reduce((m, e) => Math.max(m, e.seconds), 0),
  };
}

/**
 * Render a duration in whole days and hours, so a report never implies a
 * precision it does not have.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function humanDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0h';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days === 0) return `${hours}h`;
  return `${days}d ${hours}h`;
}

function main() {
  const ref = process.argv[2] ?? 'origin/main';
  const git = (args) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const { examined, dirty, refs, lastDirty, headClean, dirtySeconds, spanSeconds, shape } =
    censusHistory(git, ref);

  if (examined === 0) {
    console.log(`No commits touching .github/workflows found on ${ref}.`);
    return;
  }

  const percent = ((dirty / examined) * 100).toFixed(1);
  const timePercent = spanSeconds > 0 ? ((dirtySeconds / spanSeconds) * 100).toFixed(1) : '0.0';
  console.log(`Workflow pin history for ${ref}:`);
  console.log(`  commits examined            ${examined}`);
  console.log(`  commits with >=1 unpinned   ${dirty} (${percent}%)`);
  console.log(`  distinct unpinned refs      ${refs.size}`);
  console.log(
    `  time in a non-compliant state ${humanDuration(dirtySeconds)} of ${humanDuration(spanSeconds)} (${timePercent}%)`,
  );
  console.log(`  working tree at ${ref}      ${headClean ? 'clean' : 'UNPINNED REFS PRESENT'}`);
  console.log(`  non-compliant episodes      ${shape.episodes.length}`);
  console.log(`  state transitions           ${shape.transitions}`);
  console.log(`  born compliant              ${shape.bornCompliant ? 'yes' : 'no'}`);
  if (shape.episodes.length > 0 && dirtySeconds > 0) {
    const share = ((shape.longestSeconds / dirtySeconds) * 100).toFixed(1);
    console.log(
      `  longest episode             ${humanDuration(shape.longestSeconds)} (${share}% of all exposure)`,
    );
    for (const e of shape.episodes) {
      const from = new Date(e.from * 1000).toISOString().slice(0, 10);
      const to = new Date(e.to * 1000).toISOString().slice(0, 10);
      console.log(`    ${from} -> ${to}  ${humanDuration(e.seconds)}`);
    }
  }
  console.log(`  current compliant streak    ${humanDuration(shape.currentStreakSeconds)}`);
  if (lastDirty) {
    console.log(`  most recent occurrence      ${lastDirty.sha} ${lastDirty.date}`);
    console.log(`    ${lastDirty.refs.slice(0, 4).join(', ')}`);
  }
  console.log('');
  console.log('This is a history report, not a gate. A clean working tree means the');
  console.log('violations were repaired, not that they never happened; the pinning gate');
  console.log('cannot distinguish those two and does not claim to.');
  console.log('');
  console.log('A count of commits is complete over commits and silent about duration --');
  console.log('the same seven lapses may be seven minutes or four days of exposure. The');
  console.log('time figures close that gap, and are measured against wall-clock now, so');
  console.log('the final interval grows until the next commit touching this directory.');
  console.log('');
  console.log('A duration is in turn silent about shape. Eighty-nine non-compliant');
  console.log('commits may be eighty-nine regressions or three episodes, and only the');
  console.log('separates "we keep regressing" from "we fixed it once" -- which is the');
  console.log('question a reader is actually asking when they consult this number.');
  console.log('');
  console.log('The compliant streak is reported because a low transition count invites');
  console.log('"the practice stuck", and a streak shorter than the lapse it followed');
  console.log('cannot support that reading. Not measured: whether the streak reflects');
  console.log('enforcement or habit. Here it is enforcement -- workflow:security:check');
  console.log('gates every pull request -- but this tool cannot see that and does not');
  console.log('infer it.');
}

if (process.argv[1] && process.argv[1].endsWith('check-workflow-pin-history.mjs')) {
  main();
}
