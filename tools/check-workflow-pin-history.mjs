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
 * @returns {{examined: number, dirty: number, refs: Map<string, string>, lastDirty: object | null, headClean: boolean}}
 *   `refs` maps each unpinned `action@ref` to the oldest commit that carried it.
 */
export function censusHistory(git, ref = 'origin/main') {
  const listed = git([
    'log',
    '--format=%H %ad',
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

  for (const [sha, date] of commits) {
    let text;
    try {
      text = git(['grep', '-h', '-E', 'uses:', sha, '--', '.github/workflows']);
    } catch {
      continue;
    }
    const bad = unpinnedRefs(text);
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

  return { examined: commits.length, dirty, refs, lastDirty, headClean };
}

function main() {
  const ref = process.argv[2] ?? 'origin/main';
  const git = (args) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const { examined, dirty, refs, lastDirty, headClean } = censusHistory(git, ref);

  if (examined === 0) {
    console.log(`No commits touching .github/workflows found on ${ref}.`);
    return;
  }

  const percent = ((dirty / examined) * 100).toFixed(1);
  console.log(`Workflow pin history for ${ref}:`);
  console.log(`  commits examined            ${examined}`);
  console.log(`  commits with >=1 unpinned   ${dirty} (${percent}%)`);
  console.log(`  distinct unpinned refs      ${refs.size}`);
  console.log(`  working tree at ${ref}      ${headClean ? 'clean' : 'UNPINNED REFS PRESENT'}`);
  if (lastDirty) {
    console.log(`  most recent occurrence      ${lastDirty.sha} ${lastDirty.date}`);
    console.log(`    ${lastDirty.refs.slice(0, 4).join(', ')}`);
  }
  console.log('');
  console.log('This is a history report, not a gate. A clean working tree means the');
  console.log('violations were repaired, not that they never happened; the pinning gate');
  console.log('cannot distinguish those two and does not claim to.');
}

if (process.argv[1] && process.argv[1].endsWith('check-workflow-pin-history.mjs')) {
  main();
}
