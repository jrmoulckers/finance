#!/usr/bin/env node
/**
 * Fails when a tool detects markdown fence delimiters without using the shared primitive (#4322).
 *
 * `tools/lib/markdown.mjs` exists because the same fence guard was written three separate times in
 * this repository, each time after the author's own corpus bit them. Consolidating it fixed the
 * three that existed. Nothing prevented a fourth.
 *
 * The metric that was supposed to prevent it -- how many importers the shared module has -- cannot,
 * for two reasons that only became visible when a sibling repository ran the same check and scored
 * perfectly while being maximally duplicated:
 *
 * 1. **Importer count reads green on a tree with nothing to import.** It is a ratio whose
 *    denominator is "modules someone extracted", so a tree that never extracted anything scores
 *    100%. The metric is only meaningful where extraction has already been attempted.
 * 2. **It reads a forced hand as a free choice.** 36 files under `tools/` and `scripts/` are
 *    CommonJS, and the shared primitive is ESM. They do not import it because they *cannot*. A
 *    census of importers records that as a decision not to reuse.
 *
 * The check that catches a fourth authoring is not "who imports the shared module" but "how many
 * independent implementations of this predicate exist" -- a duplication census, which needs no
 * extraction to have happened first and does not care why a file failed to import.
 *
 * It found one immediately: `tools/check-ai-manifest.js`, a required gate, carries its own fence
 * toggle that recognises ``` and not ~~~, where the shared definition recognises both.
 *
 * Why a fourth authoring was inevitable rather than careless: a guard propagates along the
 * *corpus*, not along the rule. Each author either was corrected by their own fixture or was not,
 * so a tool scanning documents that happen to contain no fenced example never learns it needs the
 * guard. Nobody decides the rule is narrow; the rule is simply never observed to fail.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directories whose scripts are scanned. */
export const SCANNED_DIRECTORIES = ['tools', 'scripts'];

/** The module that is allowed to define the fence predicate. */
export const OWNER = path.join('tools', 'lib', 'markdown.mjs');

/**
 * Files permitted to carry their own fence predicate, each with the reason it cannot use the owner.
 *
 * A bare allowlist is an exemption with no reason, which is the defect this repository hardened the
 * `enumeration-fixture` marker against one change earlier. That fix was written as a comment on
 * that marker and read as describing the class; it did not travel one file over. Applying it here,
 * at authoring time rather than a round later, is the only evidence that the lesson generalised --
 * a fix appearing twice is the whole of the evidence that it was ever about the class.
 *
 * @type {Record<string, string>}
 */
export const ALLOWED = {
  [path.join('tools', 'check-ai-manifest.js')]:
    'CommonJS: require() cannot load the ESM owner, and the fence toggle is embedded in a ' +
    'line-reflow algorithm rather than used as a standalone predicate',
};

// Assembled rather than written out: this file is scanned by itself, and a literal fence delimiter
// in the source would make the census report its own patterns. The same reason the enumeration
// gate's fixture ID is built from parts.
const TICK = String.fromCharCode(96).repeat(3);
const TILDE = '~'.repeat(3);
const RUN = `(?:${TICK}|${TILDE})`;

/** Constructs that mean "this line opens or closes a fenced block". */
const SIGNATURES = [
  // An anchored regex literal that tests for a fence run.
  new RegExp(`/\\^[^/\\n]*${RUN}`),
  // A string test against a fence run.
  new RegExp(`\\.startsWith\\(\\s*['"\`]\\s*${RUN}`),
];

/** True when the path is a script this census reads. */
export function isScannedFile(name) {
  const text = String(name ?? '');
  return /\.(mjs|cjs|js)$/.test(text) && !/\.test\.(mjs|cjs|js)$/.test(text);
}

/**
 * The one-based line numbers on which a file defines a fence predicate.
 *
 * Reported as line numbers rather than a count, because a count cannot be acted on: a reader
 * shown "3 implementations" cannot go and look at them, and a number is never wrong in a way that
 * is visible. Every exclusion and every finding in this tool is named.
 *
 * @param {string} text File contents.
 * @returns {number[]} One-based line numbers, ascending.
 */
export function fencePredicateLines(text) {
  const found = [];
  String(text)
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (SIGNATURES.some((signature) => signature.test(line))) found.push(index + 1);
    });
  return found;
}

/** Recursively enumerate scanned scripts from disk, never from a shell glob. */
export function collectScripts(root) {
  const out = [];
  const skippedTests = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (isScannedFile(entry)) out.push(full);
      else if (/\.test\.(mjs|cjs|js)$/.test(entry)) skippedTests.push(full);
    }
  };
  for (const dir of SCANNED_DIRECTORIES) walk(path.join(root, dir));
  out.skippedTests = skippedTests;
  return out;
}

/**
 * Partition every fence predicate in the tree into owner, allowed, and unowned.
 *
 * @param {{file: string, lines: number[]}[]} sites Per-file predicate locations.
 * @returns {{owner: object[], allowed: object[], unowned: object[]}} The three populations.
 */
export function classify(sites) {
  const owner = [];
  const allowed = [];
  const unowned = [];
  for (const site of sites) {
    if (site.file === OWNER) owner.push(site);
    else if (Object.hasOwn(ALLOWED, site.file)) allowed.push(site);
    else unowned.push(site);
  }
  return { owner, allowed, unowned };
}

/**
 * The full census, named rather than counted, on both the passing and failing path.
 *
 * A gate that prints only on failure cannot be audited when it passes, and a wrongly-allowed
 * implementation is exactly the case that passes. The allowed population is printed with its
 * stated reason so a reader can judge the reason rather than trust that one exists.
 *
 * @param {{owner: object[], allowed: object[], unowned: object[]}} groups Partitioned sites.
 * @param {number} scanned How many scripts were read.
 * @returns {string[]} Report lines.
 */
export function censusLines(groups, scanned, skippedTests = 0) {
  const total = groups.owner.length + groups.allowed.length + groups.unowned.length;
  const lines = [
    `Fence-predicate census: ${total} implementation(s) across ${scanned} script(s) scanned, ` +
      `${skippedTests} test file(s) not scanned. A test for a fence checker contains fence ` +
      'delimiters as data, so scanning tests would report the fixtures; the number is stated ' +
      'rather than left implied, because a denominator a reader cannot see is one they cannot ' +
      'judge.',
  ];
  const name = (site) => `  ${site.file}:${site.lines.join(',')}`;
  if (groups.owner.length > 0) lines.push('owner:', ...groups.owner.map(name));
  if (groups.allowed.length > 0) {
    lines.push('allowed, with the reason it cannot use the owner:');
    for (const site of groups.allowed) {
      lines.push(name(site), `    ${ALLOWED[site.file]}`);
    }
  }
  if (groups.unowned.length > 0) {
    lines.push(
      '',
      `Independent fence predicate(s) outside ${OWNER}:`,
      ...groups.unowned.map(name),
      '',
      `Import { FENCE, markFences } from ${OWNER} instead. A second definition of "what is a`,
      'fenced block" diverges silently: it is correct until a document uses the delimiter the',
      'copy does not recognise, and no test fails in between. If the file cannot import the',
      `owner -- CommonJS cannot load ESM -- add it to ALLOWED with the reason, so the constraint`,
      'is recorded where the next reader will look rather than rediscovered.',
    );
  }
  return lines;
}

export function main(root) {
  const scripts = collectScripts(root);
  const sites = [];
  for (const file of scripts) {
    const lines = fencePredicateLines(readFileSync(file, 'utf8'));
    if (lines.length > 0) sites.push({ file: path.relative(root, file), lines });
  }
  const groups = classify(sites);
  process.stdout.write(
    `${censusLines(groups, scripts.length, scripts.skippedTests.length).join('\n')}\n`,
  );
  if (groups.unowned.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2] ? path.resolve(process.argv[2]) : process.cwd());
}
