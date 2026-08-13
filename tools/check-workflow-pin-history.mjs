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
const USES_RE = /uses:\s*['"]?([^\s'"@]+)@([^\s'"#]+)/;

/**
 * Extract unpinned `uses:` refs from raw workflow text.
 *
 * One exclusion, load-bearing, and discovered by getting it wrong: fully
 * commented-out lines are not steps. A first version of this census omitted the
 * comment rule and reported 209 of 209 commits dirty, including a HEAD the gate
 * passes -- an instrument defect pointing in the accusatory direction, which is
 * the one direction an instrument must not fail in.
 *
 * Local reusable workflows (`uses: ./.github/workflows/x.yml`) need no
 * exclusion: they carry no `@ref`, so the pattern never matches them. An
 * explicit `startsWith('./')` guard was removed after mutation testing showed
 * it could be deleted without failing anything -- the test that appeared to
 * cover it was passing because the fixture had no `@` either, not because the
 * guard did any work.
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
    const [, action, ref] = match;
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

  return { examined: commits.length, dirty, refs, lastDirty, headClean, dirtySeconds, spanSeconds };
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

  const { examined, dirty, refs, lastDirty, headClean, dirtySeconds, spanSeconds } = censusHistory(
    git,
    ref,
  );

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
}

if (process.argv[1] && process.argv[1].endsWith('check-workflow-pin-history.mjs')) {
  main();
}
