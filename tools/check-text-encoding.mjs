#!/usr/bin/env node
/**
 * Usage: npm run encoding:check
 *        node tools/check-text-encoding.mjs --help
 *
 * Fails when a tracked text file contains U+FFFD (the Unicode replacement
 * character, bytes EF BF BD). A U+FFFD in committed source means a character
 * was already lost before the bytes reached the repository — the original is
 * unrecoverable from the file itself.
 *
 * The scan is deliberately byte-level. Mojibake is *valid* UTF-8: EF BF BD is a
 * well-formed encoding of a real code point, so a decoder validity check such as
 * `new TextDecoder('utf-8', { fatal: true })` accepts it without complaint.
 * Validity is the wrong predicate; the question is whether the text already lost
 * characters before it arrived.
 *
 * Two byte patterns show up, and they come from different faults:
 *   EF BF BD             a 3-byte character (en dash, arrow) collapsed to one
 *                        replacement
 *   EF BF BD EF BF BD    a 4-byte emoji whose UTF-16 surrogate pair was split
 *                        and each half replaced independently
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const REPLACEMENT = Buffer.from([0xef, 0xbf, 0xbd]);

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
    [
      'Usage: node tools/check-text-encoding.mjs',
      '',
      'Scans every tracked file for U+FFFD (EF BF BD) and exits non-zero if any',
      'is found. Files containing a NUL byte are treated as binary and skipped.',
    ].join('\n'),
  );
  process.exit(0);
}

/**
 * Absolute path to the repository root.
 *
 * Every git invocation below runs here rather than in the caller's working
 * directory, so the guard always examines the whole repository rather than
 * whatever subtree it happens to be started from.
 *
 * The cause is `git ls-files`, which both *selects* and *prints* relative to
 * the current directory. `git cat-file`'s `:<path>` syntax, by contrast, is
 * root-relative — only `:./<path>` is cwd-relative — so a bare `src/app.ts`
 * printed by a walk rooted in `apps/web` is looked up at the repository root
 * and silently misses. Anchoring `ls-files` alone is therefore not enough:
 * `:/` widens the selection but leaves the printed paths cwd-relative.
 *
 * `--full-name` on the walk is the minimal alternative fix; `cwd: repoRoot`
 * is preferred because it makes every git call independent of the caller.
 * Both are applied, so neither is load-bearing alone: removing `cwd` leaves
 * the walk correct, and `--full-name` cannot be defeated by a caller's cwd.
 *
 * Since the read moved to object IDs, none of that governs *correctness* any
 * more — an OID resolves the same from anywhere, so a mis-based path can no
 * longer produce a wrong or failed read. What the anchors now govern is which
 * files are selected at all, and there `:/` and `cwd` are jointly load-bearing:
 * remove both and the walk narrows to the caller's subtree, reads it perfectly
 * by OID, and reports success over a fraction of the repository. Nothing below
 * can see it — every file listed was read, so conservation balances, the byte
 * total is large, and only the count moves. No check reads the count.
 *
 * Remove at most one. This is the same trade the OID read bought: mis-anchoring
 * used to fail loudly through unreadable paths, and now it cannot fail at all,
 * so a narrowed walk is the only remaining way to be wrong and it is silent.
 */
const repoRoot = (() => {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('Unable to locate the repository root via `git rev-parse --show-toplevel`.');
    process.exit(1);
  }
  return result.stdout.trim();
})();

/**
 * Lists every tracked entry at HEAD as a `{ mode, oid, path }` triple.
 *
 * `-s` is what makes the read downstream safe. It emits the index entry's object
 * ID alongside the path, and an OID is *global*: it needs no resolution, so it
 * cannot be resolved against the wrong directory. Paths must be resolved, and a
 * resolution can land somewhere else — see `readIndexBytes` below.
 *
 * The `:/` pathspec is redundant with running from the repository root but
 * states the intent at the call site: this walk covers the whole repository,
 * never the current subtree. It does not affect the *form* of the printed
 * paths — `--full-name` is what keeps those repository-relative, and does so
 * whatever directory the process was started from.
 *
 * Redundant with `cwd: repoRoot`, not with its absence: dropping both silently
 * narrows the walk. See the `repoRoot` note above before removing either.
 *
 * @returns {{ mode: string, oid: string, path: string }[]} Tracked index entries.
 */
function listTrackedEntries() {
  const result = spawnSync('git', ['ls-files', '-s', '-z', '--full-name', '--', ':/'], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 256,
  });
  if (result.status !== 0) {
    console.error('Unable to list tracked files via `git ls-files`.');
    process.exit(1);
  }

  const entries = [];
  for (const record of result.stdout.toString('utf8').split('\0').filter(Boolean)) {
    // `<mode> <oid> <stage>\t<path>` — the path may itself contain whitespace,
    // so split the metadata off at the tab rather than tokenising the record.
    const tab = record.indexOf('\t');
    const [mode, oid, stage] = record.slice(0, tab).split(' ');
    const path = record.slice(tab + 1);

    // A non-zero stage means an unmerged path, where "the" committed bytes do
    // not exist — there are two or three competing versions. Scanning either
    // side would report on a file that is not what any commit contains.
    if (stage !== '0') {
      console.error(
        `::error::encoding guard found ${path} at merge stage ${stage}. The index is in a\n` +
          'conflicted state, so there is no single committed version to scan.',
      );
      process.exit(1);
    }
    entries.push({ mode, oid, path });
  }
  return entries;
}

/**
 * Reads every tracked entry's committed bytes in a single `git cat-file --batch`
 * pass. Reading from the index rather than the working tree matters because a
 * checkout filter can differ from what is committed; doing it in one process
 * matters because spawning `git show` per file takes minutes on this repo.
 *
 * Lookup is by **object ID**, not by `:<path>`. That closes the *identity* axis,
 * which is separate from the population axis `cwd: repoRoot` closes above:
 *
 *   population  a narrowed walk reads too few files   -> `:/` + `cwd: repoRoot`
 *   identity    a resolved path reads the wrong file  -> read by OID
 *
 * The distinction is not academic. Before #4099 the walk was anchored while the
 * read was not, and from `docs/testing` the guard reported "1 tracked text file"
 * having read the *root* README rather than the local one — every count correct,
 * every byte wrong. An OID cannot do that: it is not resolved against anything.
 *
 * @param {{ oid: string, path: string }[]} entries Tracked index entries.
 * @returns {Map<string, Buffer>} Path to committed bytes.
 */
function readIndexBytes(entries) {
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: entries.map((entry) => entry.oid).join('\n') + '\n',
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error('Unable to read tracked files via `git cat-file --batch`.');
    process.exit(1);
  }

  const contents = new Map();
  const out = result.stdout;
  let cursor = 0;
  // `--batch` emits exactly one record per input line, in order, so the Nth
  // record belongs to the Nth entry even when two paths share an OID.
  for (const { path } of entries) {
    const newline = out.indexOf(0x0a, cursor);
    if (newline === -1) break;
    const header = out.slice(cursor, newline).toString('utf8');
    if (header.endsWith('missing')) {
      cursor = newline + 1;
      continue;
    }
    const size = Number(header.slice(header.lastIndexOf(' ') + 1));
    const start = newline + 1;
    contents.set(path, out.slice(start, start + size));
    cursor = start + size + 1;
  }
  return contents;
}

/**
 * Recomputes a blob's object ID from its bytes.
 *
 * Git hashes `blob <length>\0<content>`, so this reproduces the index entry's
 * OID exactly when — and only when — the bytes are the ones that entry names.
 *
 * @param {Buffer} bytes File contents.
 * @returns {string} The 40-character blob OID.
 */
function blobOid(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/**
 * Reports every offset of the replacement character, collapsing a split
 * surrogate pair into the single fault it represents.
 *
 * @param {Buffer} bytes File contents.
 * @returns {{ offset: number, doubled: boolean }[]} One entry per lost character.
 */
function findReplacements(bytes) {
  const found = [];
  let index = bytes.indexOf(REPLACEMENT);
  while (index !== -1) {
    const doubled = bytes.slice(index + 3, index + 6).equals(REPLACEMENT);
    found.push({ offset: index, doubled });
    index = bytes.indexOf(REPLACEMENT, index + (doubled ? 6 : 3));
  }
  return found;
}

/**
 * Converts a byte offset to a 1-based line number.
 *
 * @param {Buffer} bytes File contents.
 * @param {number} offset Byte offset within the file.
 * @returns {number} Line number containing the offset.
 */
function lineOf(bytes, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (bytes[i] === 0x0a) line += 1;
  }
  return line;
}

/**
 * Verifies the detector against synthetic input before it is trusted on real files.
 *
 * Without this, a broken detector and a clean repository produce the same exit code. The
 * positive cases prove `findReplacements` still recognises both fault patterns; the negative
 * case proves it is not simply reporting a hit for everything.
 *
 * @returns {void}
 */
function selfTest() {
  const cases = [
    {
      name: 'single replacement',
      bytes: Buffer.concat([Buffer.from('a'), REPLACEMENT]),
      expected: 1,
    },
    {
      name: 'split surrogate pair',
      bytes: Buffer.concat([REPLACEMENT, REPLACEMENT]),
      expected: 1,
    },
    {
      name: 'clean text',
      bytes: Buffer.from('en dash \u2013 and emoji \u{1f511}', 'utf8'),
      expected: 0,
    },
  ];

  for (const { name, bytes, expected } of cases) {
    const actual = findReplacements(bytes).length;
    if (actual !== expected) {
      console.error(
        `::error::encoding guard self-test failed: ${name} returned ${actual} result(s), expected ${expected}.`,
      );
      process.exit(1);
    }
  }

  // The identity check is only as good as the hash construction behind it. Git's
  // empty blob is a fixed, published OID, so this pins the `blob <len>\0` prefix
  // without shelling out. Get the prefix wrong and every file would mismatch —
  // this names the cause instead of reporting 5,520 corrupt files.
  const EMPTY_BLOB = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';
  const actualEmpty = blobOid(Buffer.alloc(0));
  if (actualEmpty !== EMPTY_BLOB) {
    console.error(
      `::error::encoding guard self-test failed: empty blob hashed to ${actualEmpty}, expected ${EMPTY_BLOB}.`,
    );
    process.exit(1);
  }
}

const failures = [];
const misread = [];
let scanned = 0;
let skippedBinary = 0;
let unreadable = 0;
let totalBytes = 0;

selfTest();

const trackedEntries = listTrackedEntries();
// A gitlink is a commit, not a blob; reading it would hand the scanner a commit
// object's bytes. None exist here today, so this is a guard against a submodule
// being added later and quietly becoming the one entry nobody scans.
const blobEntries = trackedEntries.filter((entry) => entry.mode !== '160000');
const skippedNonBlob = trackedEntries.length - blobEntries.length;
const contents = readIndexBytes(blobEntries);

for (const { path, oid } of blobEntries) {
  const bytes = contents.get(path);
  if (bytes === undefined) {
    unreadable += 1;
    continue;
  }
  // Identity, not cardinality: prove these bytes are the ones this entry names.
  if (blobOid(bytes) !== oid) {
    misread.push(path);
    continue;
  }
  if (bytes.includes(0x00)) {
    skippedBinary += 1;
    continue;
  }
  scanned += 1;
  totalBytes += bytes.length;
  for (const { offset, doubled } of findReplacements(bytes)) {
    failures.push({ path, line: lineOf(bytes, offset), doubled });
  }
}

if (failures.length > 0) {
  for (const { path, line, doubled } of failures) {
    const cause = doubled ? '4-byte character, surrogate pair split' : '3-byte character collapsed';
    console.error(`::error file=${path},line=${line}::U+FFFD replacement character (${cause})`);
  }
  console.error(
    `\n${failures.length} lost character(s) in ${new Set(failures.map((f) => f.path)).size} file(s).`,
  );
  console.error(
    'A U+FFFD in a committed file means the original character is gone. Recover it from an\n' +
      'uncorrupted revision if one exists; otherwise reconstruct it from context and say so.',
  );
  process.exit(1);
}

// The identity axis. Every other check in this file reasons about a count or a
// volume, and a substituted file conserves both: reading the root README in
// place of docs/testing's leaves the totals untouched and the result wrong. This
// is the only check whose reference quantity does not come from the walk — the
// OID is recorded by git, and the bytes either hash to it or they do not.
if (misread.length > 0) {
  for (const path of misread.slice(0, 20)) {
    console.error(`::error file=${path}::content does not hash to this entry's object ID`);
  }
  console.error(
    `::error::encoding guard read ${misread.length} file(s) whose bytes do not match the object\n` +
      'ID recorded for them. The reader returned some other file, so any clean result would\n' +
      'describe the wrong content.',
  );
  process.exit(1);
}

if (scanned === 0) {
  console.error(
    '::error::encoding guard examined 0 tracked text files. This repository always has tracked\n' +
      'text files, so an empty scan means the guard is broken, not that the tree is clean.',
  );
  process.exit(1);
}

// Every tracked path must land in exactly one bucket. This catches a file that
// silently disappears from the walk without being counted anywhere. It is a
// weaker check than the floor above rather than a replacement for it: its
// reference quantity is derived from the same walk it polices, so a narrowed
// walk shrinks both sides together and passes. The floor's reference is the
// constant 0, which nothing about the walk can move.
if (scanned + skippedBinary + unreadable + skippedNonBlob !== trackedEntries.length) {
  console.error(
    `::error::encoding guard accounted for ${scanned + skippedBinary + unreadable + skippedNonBlob} of ` +
      `${trackedEntries.length} tracked file(s). Files vanished from the walk without being\n` +
      'counted, so the clean result covers an unknown subset of the repository.',
  );
  process.exit(1);
}

if (unreadable > 0) {
  console.error(
    `::error::encoding guard could not read ${unreadable} tracked file(s) from the index.`,
  );
  process.exit(1);
}

// The three checks above all reason about file *counts*, so none of them can see a reader that
// returns an empty buffer for every path: those buffers are defined and NUL-free, so each one
// counts as scanned text, conservation balances exactly, and the detector correctly finds nothing
// in zero bytes. selfTest() cannot see it either, because it feeds synthetic buffers straight to
// the detector and never exercises the reader. Only the volume of data read distinguishes a
// repository with no U+FFFD from a reader that returned nothing at all.
if (totalBytes === 0) {
  console.error(
    `::error::encoding guard read 0 bytes across ${scanned} tracked text file(s). Tracked text\n` +
      'files are never all empty, so the reader returned nothing and every file was reported\n' +
      'clean without being examined.',
  );
  process.exit(1);
}

console.log(
  `No U+FFFD found in ${scanned} tracked text file(s), ${totalBytes} byte(s) read ` +
    `(${skippedBinary} binary file(s) skipped).`,
);
