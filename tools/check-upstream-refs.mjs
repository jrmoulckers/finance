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
//
// The first version of this file scanned tracked markdown for `github.com/.../blob/`
// links. Both halves of that were narrower than the argument above, and the
// consequential ref sat outside both: the `DEFAULT_INDEX` constant in
// `config/engineering/citations/check-citations.mjs`, which points at the
// engineering repo's `principles/index.json` on a branch rather than a tag.
//
// It was missed twice over -- the file is not markdown, and the URL uses the
// `raw` host rather than a `blob` one -- and either miss alone was sufficient,
// so fixing one would have left it hidden and looked like progress. It is also
// the only ref here whose mutability changes a *verdict* rather than a reading:
// `eng:citations` resolves every ID against it, so the set of valid IDs can
// change with no diff in this repository.
//
// This comment deliberately describes that URL instead of quoting it. Nothing
// textual separates a ref that is fetched from one that is merely discussed, so
// the scanner counts both -- and the first draft of this file failed its own
// check on the paragraph explaining the check. Raising the baseline would have
// buried the real finding next to a description of it; the fix is to keep
// descriptions from carrying fetchable literals.
//
// Hence two populations, counted apart. A mutable ref in prose means a reader
// may open a document newer than the one the sentence was written against. A
// mutable ref in executed code means a gate can return a different answer
// tomorrow for the same tree. Summing them would put one number on two
// consequences.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { markFences } from './lib/markdown.mjs';

// Recorded, not approved. Lower it whenever the real count drops; the tool
// prints the new floor when it can. See docs/guides/engineering-practice-adoption.md.
export const BASELINE = 23;

// The executed surface, kept separate because a change here is a change of
// verdict. This one should go to zero, not drift down.
export const EXECUTED_BASELINE = 1;

// The repository this check runs in. A link from finance to finance is not a
// cross-repo authority reference, and counting it would inflate both figures
// with links whose target moves in the same commit as the text citing it.
export const SELF_REPO = 'finance';

const BLOB =
  /https?:\/\/github\.com\/jrmoulckers\/([A-Za-z0-9._-]+)\/blob\/([^/\s)]+)\/([^)\s"'`#>]+)/g;

// `raw.githubusercontent.com` is how a *program* fetches a file, so it is the
// form that appears in executed code -- and it was the form the original regex
// could not see. `refs/heads/` is optional in this host's path grammar.
const RAW =
  /https?:\/\/raw\.githubusercontent\.com\/jrmoulckers\/([A-Za-z0-9._-]+)\/(?:refs\/heads\/)?([^/\s)]+)\/([^)\s"'`#>]+)/g;

/** Classify one ref string as an immutable commit SHA, a tag, or a mutable branch. */
export function refForm(ref) {
  if (/^[0-9a-f]{40}$/.test(ref)) return 'sha40';
  if (/^v?\d+\.\d+\.\d+$/.test(ref)) return 'tag';
  return 'branch';
}

/**
 * True for a file whose mutable refs are deliberate.
 *
 * A test that asserts `main` is classified as mutable has to contain the string
 * `main` in a ref, so scanning test files would report the assertions as the
 * defect they assert about. Same shape as a fenced code block in prose: the
 * text is an illustration of a reference, not a reference. Excluded here and
 * counted in the output, because an exclusion nobody can see is a silent one.
 */
export function isFixtureFile(file) {
  // `x?` matters: this repository is 601 `.tsx` files, and without it every
  // React test file fell outside the exclusion while the tool printed a
  // fixture count that claimed otherwise. Caught by a test, not by a run --
  // the executed scan returned the same verdict either way, because those
  // files happen to contain no cross-repo refs today.
  return /(^|\/)[^/]*\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /(^|\/)__fixtures__\//.test(file);
}

/** Extract every jrmoulckers cross-repo link from one file's text. */
export function collectRefs(text, file = '', { fenceAware = true } = {}) {
  const out = [];
  // A link inside a fenced block is an illustration, not a reference this
  // repository follows. Counting them made the check fail on the prose that
  // documents the check -- the fix is scope, not a higher baseline.
  //
  // This used to be an inline fence walker. It is the shared one now: the same
  // guard had been written independently here and in `check-doc-links.mjs`,
  // and a third scanner that lacked it was false-accusing its own examples.
  const marked = fenceAware ? markFences(text) : null;
  text.split(/\r?\n/).forEach((line, i) => {
    if (marked && marked[i]?.fenced) return;
    for (const pattern of [BLOB, RAW]) {
      pattern.lastIndex = 0;
      for (const [, repo, ref, path] of line.matchAll(pattern)) {
        if (repo === SELF_REPO) continue;
        out.push({ file, line: i + 1, repo, ref, path, form: refForm(ref) });
      }
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

/**
 * Decide the outcome from two counts.
 *
 * Extracted because the first version of this logic lived inside `main()`,
 * where no test could reach it: three mutants that suppressed failure entirely,
 * or raised a baseline past the real count, all survived. Every test asserted
 * the green verdict, so a program that could only ever return green passed the
 * whole suite.
 */
export function verdict({ mutableCount, executedCount, proseFiles = 0, executedFiles = 0 }) {
  const failures = [];
  if (mutableCount > BASELINE) {
    failures.push(`${mutableCount} mutable prose refs exceeds the recorded ${BASELINE}.`);
  }
  if (executedCount > EXECUTED_BASELINE) {
    failures.push(
      `${executedCount} mutable refs in executed files exceeds the recorded ${EXECUTED_BASELINE}.`,
    );
  }
  // Restated on the failing branch too: the count that broke is half the
  // picture, and a reader who sees only that half reads it as the whole.
  const populations =
    `Populations: ${mutableCount}/${BASELINE} prose (${proseFiles} file(s)), ` +
    `${executedCount}/${EXECUTED_BASELINE} executed (${executedFiles} file(s)).`;
  const lowerable = [];
  if (mutableCount < BASELINE) lowerable.push(`Baseline can be lowered to ${mutableCount}.`);
  if (executedCount < EXECUTED_BASELINE) {
    lowerable.push(`Executed baseline can be lowered to ${executedCount}.`);
  }
  return { failures, populations, lowerable, ok: failures.length === 0 };
}

function listFiles() {
  const out = execFileSync('git', ['ls-files', '--', 'docs', '*.md'], { encoding: 'utf8' });
  return out.split('\n').filter((f) => f.endsWith('.md'));
}

/**
 * Tracked files that are neither markdown nor fixtures: the surface where a
 * mutable ref is fetched rather than read.
 */
export function listExecutedFiles(all, markdown) {
  const seen = new Set(markdown);
  return all.filter(
    (f) =>
      f &&
      !seen.has(f) &&
      !f.endsWith('.md') &&
      !isFixtureFile(f) &&
      !/\.(png|jpe?g|gif|ico|webp|svg|jar|zip|pdf|woff2?|ttf|keystore|so|dylib|dll|bin|lock)$/i.test(
        f,
      ),
  );
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

  const all = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64e6 })
    .split('\n')
    .filter(Boolean);
  const executedFiles = listExecutedFiles(all, files);
  const fixtures = all.filter((f) => isFixtureFile(f));
  const executedRefs = executedFiles.flatMap((f) => {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      return [];
    }
    // Not fence-aware: there is no prose convention for "this string is an
    // illustration" in a source file, and a URL in a comment is still shipped.
    return collectRefs(text, f, { fenceAware: false });
  });
  const executedMutable = executedRefs.filter((r) => r.form === 'branch');

  console.log('');
  console.log('Cross-repo references in executed files:');
  console.log(`  non-markdown files scanned  ${executedFiles.length}`);
  console.log(
    `  fixture files skipped       ${fixtures.length} (their mutable refs are the assertion)`,
  );
  console.log(`  jrmoulckers links           ${executedRefs.length}`);
  console.log(
    `  on a mutable ref            ${executedMutable.length} (baseline ${EXECUTED_BASELINE})`,
  );
  for (const r of executedMutable) {
    console.log(`    ${r.file}:${r.line}  ${r.repo}@${r.ref}  ${r.path}`);
  }

  // Print the scope beside the verdict, including what was not measured.
  console.log('');
  console.log('Scope: ref immutability only, over tracked markdown and tracked executed');
  console.log(`files, counted apart. Links to ${SELF_REPO} itself are excluded from both.`);
  console.log('Not measured: whether any referenced path exists upstream. That needs');
  console.log('the sibling repository and is deliberately outside this check.');
  console.log('Not measured: whether a mutable ref has actually moved. A ref that is');
  console.log('unpinned and currently identical prints the same as one that is pinned.');

  const v = verdict({
    mutableCount: mutable.length,
    executedCount: executedMutable.length,
    proseFiles: files.length,
    executedFiles: executedFiles.length,
  });
  if (!v.ok) {
    console.error(`\nFAIL:`);
    for (const f of v.failures) console.error(`  - ${f}`);
    console.error(`\n${v.populations}`);
    process.exit(1);
  }
  if (v.lowerable.length > 0) console.log(`\n${v.lowerable.join('\n')}`);
}

if (process.argv[1] && process.argv[1].endsWith('check-upstream-refs.mjs')) main();
