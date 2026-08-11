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
 * Lists every tracked path at HEAD.
 *
 * @returns {string[]} Repository-relative paths.
 */
function listTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { maxBuffer: 1024 * 1024 * 256 });
  if (result.status !== 0) {
    console.error('Unable to list tracked files via `git ls-files`.');
    process.exit(1);
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

/**
 * Reads every tracked path's committed bytes in a single `git cat-file --batch`
 * pass. Reading from the index rather than the working tree matters because a
 * checkout filter can differ from what is committed; doing it in one process
 * matters because spawning `git show` per file takes minutes on this repo.
 *
 * @param {string[]} paths Repository-relative paths.
 * @returns {Map<string, Buffer>} Path to committed bytes.
 */
function readIndexBytes(paths) {
  const result = spawnSync('git', ['cat-file', '--batch'], {
    input: paths.map((path) => `:${path}`).join('\n') + '\n',
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error('Unable to read tracked files via `git cat-file --batch`.');
    process.exit(1);
  }

  const contents = new Map();
  const out = result.stdout;
  let cursor = 0;
  for (const path of paths) {
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

const failures = [];
let scanned = 0;
let skippedBinary = 0;

const trackedFiles = listTrackedFiles();
const contents = readIndexBytes(trackedFiles);

for (const path of trackedFiles) {
  const bytes = contents.get(path);
  if (bytes === undefined) continue;
  if (bytes.includes(0x00)) {
    skippedBinary += 1;
    continue;
  }
  scanned += 1;
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

console.log(
  `No U+FFFD found in ${scanned} tracked text file(s) (${skippedBinary} binary file(s) skipped).`,
);
