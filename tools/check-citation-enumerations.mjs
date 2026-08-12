#!/usr/bin/env node
/**
 * Fail when finance restates a ratified principle's enumeration instead of citing it.
 *
 * ADR-0003's four-authority topology says no authority may copy another's
 * normative text into its own source tree — reference by link or ID only. A
 * paraphrase is the softer version of the same move, and an *enumeration* is its
 * most fragile form: it has a fixed arity, so it can drift silently by dropping
 * an item while every word that remains is still true.
 *
 * This is not hypothetical. AGENTS.md carried, for the whole life of this
 * adoption, "`ENG-TEST-004` (distinct static signals) requires lint, format,
 * type-check, and tests to report independently." The principle's statement
 * names five static signals — type, lint, build, format, and security — so the
 * restatement dropped two. It understated finance's own compliance: CI does
 * report Build and CodeQL/Secret Scan/npm Audit as independent signals. Nothing
 * caught it, because every ID existed and every title matched. The vendored
 * `check-citations.mjs` says so in its own last line: existence is not
 * correctness.
 *
 * The check is deliberately syntactic rather than semantic. It does not compare
 * the enumeration against the principle — that would require deciding whether
 * two lists mean the same thing, which is the judgement the citation was
 * supposed to avoid making. It fires on the *shape*: an obligation attributed to
 * an ENG-* ID together with an enumeration. The remedy is always the same and
 * needs no adjudication — cite the ID and describe finance's implementation,
 * which is finance's to describe.
 *
 * Narrowing, stated because an unannounced one is how a ratcheting check starts:
 * this reads ONE LINE at a time. An enumeration wrapped across a line break is
 * not seen. Reconstructing sentences from a multi-line window was measured and
 * rejected — on the current tree it caught nothing new and added a false
 * positive on a passage that *quotes* a withdrawn claim in order to retract it.
 * A gate must under-decide rather than accuse.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Directories never scanned: build output, dependencies, and vendored upstream text. */
export const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  '.gradle',
  'coverage',
  'vendor',
]);

/** Prose files. Citations in code comments are covered too, via .mjs/.ts. */
export const SCANNED_EXTENSIONS = new Set(['.md', '.mjs', '.js', '.ts', '.tsx', '.yml', '.yaml']);

export const CITATION = /ENG-[A-Z]+-\d{3}/;

/**
 * Opt-out marker for lines that must contain the offending shape on purpose.
 *
 * This check's own tests are the motivating case, and finding them was the
 * point: the first run after the pattern was widened reported five violations,
 * all of them fixtures in the test file — a probe matching its own search
 * needle. Worse, the widening had been "measured as costing nothing" against a
 * citation corpus captured before that test file existed, so the corpus could
 * not have contained the thing the widening would fire on. The measurement was
 * not wrong; it was stale, which reads identically in the output.
 *
 * A marker rather than a path exclusion, so the exemption is per line, visible
 * at the site, greppable, and cannot silently grow to cover a real defect the
 * way an ignored directory would. Same shape as the `# exercises-engines-range`
 * marker used by the Node-version check.
 */
export const EXEMPTION = 'enumeration-fixture';
export const OBLIGATION = /\b(requires?|mandates?|forbids?|prohibits?|obliges?)\b/i;

/**
 * Three or more items, comma-separated including before the closing "and"/"or".
 *
 * Two stated narrowings, both measured rather than assumed:
 *
 * 1. The floor of three rejects "requires a, and b". It does NOT reject
 *    "requires budgets and Lighthouse" — that form has no comma and fails the
 *    pattern regardless of the floor. A test asserting the floor via comma-less
 *    two-item prose passes for an unrelated reason; the test here uses
 *    "a, and b", which is the only shape the floor actually decides.
 * 2. A serial comma is required. "requires format, lint and type-check" does not
 *    match. That is not a corner case: it is the exact wording of the second
 *    real instance of this defect, in the adoption guide, which was corrected by
 *    hand because this check could not see it. The tool's reach is narrower than
 *    the class of defect it is named after, and this comment is where that is
 *    recorded rather than left for a later reader to rediscover.
 *
 * Widening to catch shape 2 was measured against all 171 citations on this tree
 * and rejected: it fires on ordinary prose and on passages that quote a
 * withdrawn claim in order to retract it. A gate must under-decide.
 *
 * The closing conjunction is optional, so "requires a, b, c" is caught as well
 * as "requires a, b, and c". That widening WAS measured on the same 171 and
 * costs nothing — same one hit, no new false positives — so it is taken. The
 * two rejections above and this acceptance were decided the same way, by
 * running the variant over the real corpus rather than by preferring a shape.
 */
export const ENUMERATION = /([A-Za-z][\w-]*(?:\s+[\w-]+)?,\s+){2,}(?:and|or)?\s*[\w-]+/;

export function isScannedFile(filePath) {
  return SCANNED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Lines that attribute an enumerated obligation to a ratified principle.
 *
 * @param {string} text file contents
 * @returns {{line: number, id: string, enumeration: string, text: string}[]}
 */
export function findRestatedEnumerations(text) {
  const found = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes(EXEMPTION)) continue;
    const id = CITATION.exec(line);
    if (!id) continue;
    if (!OBLIGATION.test(line)) continue;
    const list = ENUMERATION.exec(line);
    if (!list) continue;
    found.push({ line: i + 1, id: id[0], enumeration: list[0], text: line.trim() });
  }
  return found;
}

/** How many lines opted out via the marker. Reported so an exemption cannot grow unseen. */
export function countExemptions(text) {
  return text.split(/\r?\n/).filter((line) => line.includes(EXEMPTION)).length;
}

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile() && isScannedFile(full)) {
      yield full;
    }
  }
}

export async function main(root) {
  const violations = [];
  let scanned = 0;
  let exempted = 0;
  for await (const file of walk(root)) {
    scanned += 1;
    const text = await readFile(file, 'utf8');
    exempted += countExemptions(text);
    for (const hit of findRestatedEnumerations(text)) {
      violations.push({ ...hit, file: path.relative(root, file) });
    }
  }

  if (violations.length > 0) {
    process.stdout.write(
      // The exemption count belongs here, not only on the green path. A failure
      // reporting "1 across 3161 scanned file(s)" states two of three buckets,
      // and the missing one is the only bucket that can HIDE a violation --
      // an exempted line is one this check chose not to see. A partition has
      // to sum, or one of its parts is invisible.
      `\nRestated principle enumeration(s) — ${violations.length} across ${scanned} scanned ` +
        `file(s), with ${exempted} line(s) exempted via the "${EXEMPTION}" marker:\n\n`,
    );
    for (const v of violations) {
      process.stdout.write(`  ${v.file}:${v.line}  ${v.id}\n`);
      process.stdout.write(`    enumerates: ${v.enumeration}\n`);
      process.stdout.write(`    ${v.text}\n\n`);
    }
    process.stdout.write(
      'An enumeration copied from a principle drifts by losing an item while every\n' +
        'remaining word stays true. Cite the ID and describe what finance does; let the\n' +
        'principle state what it requires. See ADR-0003 (four-authority topology).\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `No principle enumeration is restated as an obligation. ${scanned} file(s) scanned, ` +
      `${exempted} line(s) exempted via the "${EXEMPTION}" marker. Read one line at a ` +
      'time, so a list wrapped across a line break is not seen.\n',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  await stat(root);
  await main(root);
}
