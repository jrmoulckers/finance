#!/usr/bin/env node
/**
 * Fail on a directory test that follows a link, unless a criterion records why following is meant.
 *
 * `statSync(p).isDirectory()` is **true** for a Windows junction; `lstatSync(p).isDirectory()` is
 * false. So the idiom everyone reaches for first --
 *
 *     if (statSync(full).isDirectory()) walk(full);
 *
 * -- descends through a junction into whatever it targets. This worktree carries three, pointing
 * from `node_modules/@finance/*` back into tracked source, and the difference is not marginal:
 *
 *     walk with statSync   3720 files
 *     walk with lstatSync     3
 *     PowerShell -Recurse     0
 *
 * The third line is why this is a gate rather than a note. Every cleanliness check in this
 * repository's agent sessions has been PowerShell, which stops at a junction and reports zero. A
 * probe carries its runtime's traversal semantics, and nobody states traversal semantics, so the
 * safe tool returns a reassuring answer to a question it never asked. The hazard is real here: a
 * cleanup in this session enumerated through one of these junctions and deleted `node_modules`
 * plus 2,825 tracked files. Every individual delete was by name and compliant. The walk that
 * produced the names was not (#4349).
 *
 * ## What this matches, and what it deliberately does not
 *
 * Keyed on `readdirSync`/`readdir` and on a `statSync` whose result is tested with `isDirectory`.
 * The census that motivated this gate used `recursive:\s*true` and returned six production hits,
 * **all six false positives** -- five `mkdirSync(dir, { recursive: true })` and one `watch()`.
 * Creating a directory tree and reading one share a spelling and nothing else. A detector that
 * cannot tell them apart reports a hazard where none exists, so this one names the read.
 *
 * Occurrences inside strings, comments, and regex literals are excluded via `maskedSpans` in
 * `tools/lib/source.mjs`: a file describing an idiom is not committing it, and this file is the
 * largest instance of that in the tree -- its own first run flagged its own docstring three times.
 *
 * ## The criterion is narrower than the name
 *
 * This flags a **link-following directory test**, which is broader than "a walk". The first real
 * run returned four sites of three different shapes: one genuine recursion
 * (`verify-build-env.mjs`), one one-shot predicate that merely wanted a real directory, and two
 * one-shot classifications where following a link is the intended semantics. Only the first was
 * the hazard in the strict sense. Discriminating "recurses" from "tests" syntactically is the same
 * class of inference that has now produced five consecutive false detectors here, so this gate does
 * not attempt it: it reports the idiom and requires a recorded criterion where following is meant.
 *
 * A third idiom is safe and correctly unflagged: `readdirSync(dir, { withFileTypes: true })` yields
 * a `Dirent` whose `isDirectory()` is lstat-semantics, reporting a junction as neither a directory
 * nor a file. `check-web-performance-budget`'s own `walkFiles` is built that way.
 *
 * ## Exemptions
 *
 * An exemption carries a criterion rather than a name, so the next reader can disagree with it
 * instead of trusting it, and so it does not silently stop applying (#4337).
 */

import fs from 'node:fs';
import path from 'node:path';

import { maskedSpans, insideLiteral } from './lib/source.mjs';

/** Directories whose sources are scanned. */
export const SCANNED_DIRECTORIES = ['tools', 'scripts'];

/** Extensions treated as executable source. */
export const SOURCE_EXTENSIONS = ['.mjs', '.cjs', '.js'];

/**
 * Sites permitted to follow a link, each with the criterion that keeps it permitted.
 *
 * Not empty, and the two members are the reason the gate reports an idiom rather than a hazard: at
 * both, following a link is the intended semantics rather than an oversight. `unusedExemptions`
 * fails if a key stops naming a real site, so a permission cannot outlive what it justifies.
 *
 * @type {Record<string, {criterion: string}>}
 */
export const EXEMPT = {
  'tools/check-doc-links.mjs:582': {
    criterion:
      'Classifies a link *target*, not a step in a walk. A markdown link pointing at a symlinked ' +
      'directory resolves to a directory for every reader and every renderer, so lstat here would ' +
      'report a valid directory link as a broken file link. Following is the intended semantics.',
  },
  'tools/check-web-performance-budget.mjs:141': {
    criterion:
      'One-shot classification of an operator-supplied report path, deciding only whether to walk ' +
      'it or read it as a single file; following a link the operator named by hand is the point. ' +
      'The walk it enters (walkFiles) uses readdirSync withFileTypes, and a Dirent reports a ' +
      'junction as neither a directory nor a file, so the traversal itself does not follow links.',
  },
};

/**
 * Read every scanned source file.
 *
 * Walks with `lstatSync` and refuses to descend into a link -- this file must not commit the defect
 * it detects, and a gate that traversed a junction to find traversals of junctions would be the
 * purest possible instance of it.
 *
 * @param {string} root Repository root.
 * @returns {{file: string, text: string}[]} Scanned sources, ascending by path.
 */
export function readSources(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        walk(full);
      } else if (SOURCE_EXTENSIONS.includes(path.extname(entry))) {
        out.push({
          file: path.relative(root, full).replaceAll('\\', '/'),
          text: fs.readFileSync(full, 'utf8'),
        });
      }
    }
  };
  for (const dir of SCANNED_DIRECTORIES) walk(path.join(root, dir));
  return out;
}

/**
 * Find link-following walk sites in one source file.
 *
 * Two shapes are unsafe. A `statSync` result tested with `isDirectory` recurses through a junction.
 * A `readdirSync(..., { recursive: true })` enumerates through one without any stat at all, which
 * is the harder of the two to spot because there is no visible directory test to review.
 *
 * @param {string} text Source text.
 * @returns {{line: number, shape: string, source: string}[]} Findings, ascending by line.
 */
export function findUnsafeWalks(text) {
  const spans = maskedSpans(text);
  const findings = [];
  // `statSync(x).isDirectory()` and the two-step `const st = statSync(x); ... st.isDirectory()`
  // are both matched, because the second is what the fixed site in check-markdown-primitives was.
  const statCall = /\bstatSync\s*\(/g;
  for (const m of text.matchAll(statCall)) {
    if (insideLiteral(spans, m.index)) continue;
    // `fstatSync` and `lstatSync` end in `statSync`; require the character before to not be a
    // word character, which the \b already gives, but `lstatSync` has `l` before `statSync` with
    // no boundary -- so re-check the full identifier.
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    if (/[\w$]/.test(before)) continue;
    const rest = text.slice(m.index, m.index + 400);
    if (!/isDirectory\s*\(/.test(rest)) continue;
    findings.push({
      line: lineOf(text, m.index),
      shape: 'statSync().isDirectory()',
      source: 'statSync reports a junction as a directory; lstatSync does not',
    });
  }
  const recursiveRead = /\breaddirSync?\s*\([^;]{0,200}?recursive\s*:\s*true/gs;
  for (const m of text.matchAll(recursiveRead)) {
    if (insideLiteral(spans, m.index)) continue;
    findings.push({
      line: lineOf(text, m.index),
      shape: 'readdirSync({ recursive: true })',
      source: 'enumerates through a junction with no directory test to review',
    });
  }
  return findings.sort((a, b) => a.line - b.line);
}

/**
 * Line number of an offset, 1-based.
 *
 * @param {string} text Source text.
 * @param {number} index Character offset.
 * @returns {number} Line number.
 */
export function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/**
 * Unsafe walks that no exemption covers.
 *
 * @param {{file: string, text: string}[]} sources Scanned sources.
 * @param {Record<string, {criterion: string}>} exempt Permitted sites.
 * @returns {{file: string, line: number, shape: string, source: string}[]} Violations.
 */
export function violations(sources, exempt = EXEMPT) {
  const out = [];
  for (const { file, text } of sources) {
    for (const finding of findUnsafeWalks(text)) {
      if (Object.hasOwn(exempt, `${file}:${finding.line}`)) continue;
      out.push({ file, ...finding });
    }
  }
  return out;
}

/**
 * Exemptions whose file is in scope but whose named site no longer offends.
 *
 * Scoped to files that were actually scanned. A key naming a file this tree does not contain is not
 * stale -- it is out of scope, which is a different fact. Conflating them made the gate report every
 * exemption as stale whenever it ran anywhere but the real repository, so its own baseline control
 * exited 1 for a reason unrelated to the injected defect. The control caught it; the violating
 * fixture could not have, because both cases exit 1 (#4349).
 *
 * The remaining hole -- an exemption naming a deleted file -- is a dangling reference rather than a
 * rotted justification, and is pinned by a test against the real tree instead.
 *
 * @param {{file: string, text: string}[]} sources Scanned sources.
 * @param {Record<string, {criterion: string}>} exempt Permitted sites.
 * @returns {string[]} Stale exemption keys, ascending.
 */
export function unusedExemptions(sources, exempt = EXEMPT) {
  const inScope = new Set(sources.map(({ file }) => file));
  const live = new Set();
  for (const { file, text } of sources) {
    for (const finding of findUnsafeWalks(text)) live.add(`${file}:${finding.line}`);
  }
  return Object.keys(exempt)
    .filter((key) => {
      const file = key.slice(0, key.lastIndexOf(':'));
      return inScope.has(file) && !live.has(key);
    })
    .sort();
}

/**
 * Build the report.
 *
 * @param {{file: string, text: string}[]} sources Scanned sources.
 * @param {Record<string, {criterion: string}>} exempt Permitted sites.
 * @returns {{lines: string[], ok: boolean}} Report lines and verdict.
 */
export function report(sources, exempt = EXEMPT) {
  const bad = violations(sources, exempt);
  const stale = unusedExemptions(sources, exempt);
  const lines = [
    `Scanned ${sources.length} source file(s) in ${SCANNED_DIRECTORIES.join(', ')}.`,
    'A directory test that gates traversal must use lstatSync. statSync reports a Windows',
    'junction as a directory, and this worktree has three pointing from node_modules back into',
    'tracked source (#4349). readdirSync withFileTypes is lstat-semantics and is safe.',
  ];
  if (bad.length > 0) {
    lines.push('', 'Link-following directory test(s):');
    for (const v of bad) lines.push(`  ${v.file}:${v.line}  ${v.shape} -- ${v.source}`);
    lines.push(
      'Use lstatSync and skip an entry whose stat isSymbolicLink(), or record an exemption with',
      'the criterion that makes following a link correct there.',
    );
  }
  if (stale.length > 0) {
    lines.push('', 'Exemption(s) naming no unsafe walk:', ...stale.map((k) => `  ${k}`));
    lines.push('The site was fixed or moved. Remove the exemption rather than leaving it to rot.');
  }
  if (bad.length === 0 && stale.length === 0)
    lines.push('', 'No unjustified link-following directory test found.');
  return { lines, ok: bad.length === 0 && stale.length === 0 };
}

function main() {
  const root = process.cwd();
  const { lines, ok } = report(readSources(root));
  for (const line of lines) console.log(line);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('check-walk-safety.mjs')) {
  main();
}
