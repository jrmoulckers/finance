#!/usr/bin/env node
// Reports how finance references files in sibling authority repositories.
//
// GH-ACT-003 requires every `uses:` ref to be a 40-character commit SHA, and
// `workflow:security:check` enforces it. The argument is that a mutable ref
// resolves today and silently means something else tomorrow. That argument is
// about references, not about YAML -- but nothing applies it to prose, so a
// documentation link to an authority repo's `main` is unpinned by exactly the
// standard the same repository enforces one directory away.
//
// This is a text-only classifier. It answers "is this ref immutable?" and it
// does NOT answer "does this path exist?" -- that needs the upstream tree, and
// a check that reaches the network cannot run in the pull-request gate. The
// two questions are reported separately and the second is reported as
// unmeasured rather than assumed.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Recorded, not approved. Lower it whenever the real count drops; the tool
// prints the new floor when it can. See docs/guides/engineering-practice-adoption.md.
export const BASELINE = 22;

const BLOB =
  /https?:\/\/github\.com\/jrmoulckers\/([A-Za-z0-9._-]+)\/blob\/([^/\s)]+)\/([^)\s"'`#>]+)/g;

/** Classify one ref string as an immutable commit SHA, a tag, or a mutable branch. */
export function refForm(ref) {
  if (/^[0-9a-f]{40}$/.test(ref)) return 'sha40';
  if (/^v?\d+\.\d+\.\d+$/.test(ref)) return 'tag';
  return 'branch';
}

/** Extract every jrmoulckers cross-repo blob link from one file's text. */
export function collectRefs(text, file = '') {
  const out = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((line, i) => {
    // A link inside a fenced block is an illustration, not a reference this
    // repository follows. Counting them made the check fail on the prose that
    // documents the check -- the fix is scope, not a higher baseline.
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    BLOB.lastIndex = 0;
    for (const [, repo, ref, path] of line.matchAll(BLOB)) {
      out.push({ file, line: i + 1, repo, ref, path, form: refForm(ref) });
    }
  });
  return out;
}

/** Group refs into a { "repo,form": count } census. */
export function census(refs) {
  const by = new Map();
  for (const r of refs) {
    const k = `${r.repo},${r.form}`;
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  return by;
}

function listFiles() {
  const out = execFileSync('git', ['ls-files', '--', 'docs', '*.md'], { encoding: 'utf8' });
  return out.split('\n').filter((f) => f.endsWith('.md'));
}

function main() {
  const files = listFiles();
  const refs = files.flatMap((f) => collectRefs(readFileSync(f, 'utf8'), f));
  const mutable = refs.filter((r) => r.form === 'branch');

  console.log('Cross-repo documentation references:');
  console.log(`  markdown files scanned      ${files.length}`);
  console.log(`  jrmoulckers blob links      ${refs.length}`);
  for (const [k, n] of [...census(refs)].sort()) console.log(`    ${k.padEnd(28)}${n}`);
  console.log(`  on a mutable ref            ${mutable.length} (baseline ${BASELINE})`);

  for (const r of mutable) console.log(`    ${r.file}:${r.line}  ${r.repo}@${r.ref}  ${r.path}`);

  // Print the scope beside the verdict, including what was not measured.
  console.log('');
  console.log('Scope: ref immutability only, read from the text of tracked markdown.');
  console.log('Not measured: whether any referenced path exists upstream. That needs');
  console.log('the sibling repository and is deliberately outside this check.');

  if (mutable.length > BASELINE) {
    console.error(`\nFAIL: ${mutable.length} mutable refs exceeds the recorded ${BASELINE}.`);
    process.exit(1);
  }
  if (mutable.length < BASELINE) {
    console.log(`\nBaseline can be lowered to ${mutable.length}.`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-upstream-refs.mjs')) main();
