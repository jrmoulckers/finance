import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  EXEMPT,
  SCANNED_DIRECTORIES,
  findUnsafeWalks,
  lineOf,
  readSources,
  report,
  unusedExemptions,
  violations,
} from './check-walk-safety.mjs';
import { maskedSpans, insideLiteral } from './lib/source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('flags a statSync directory test that gates recursion', () => {
  const src = 'const st = statSync(full);\nif (st.isDirectory()) walk(full);\n';
  const found = findUnsafeWalks(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].shape, 'statSync().isDirectory()');
  assert.equal(found[0].line, 1);
});

test('does not flag the lstatSync form', () => {
  const src = 'const st = lstatSync(full);\nif (st.isDirectory()) walk(full);\n';
  assert.deepEqual(findUnsafeWalks(src), []);
});

test('lstatSync is not matched by a suffix, and fstatSync is not either', () => {
  // `lstatSync` ends in `statSync`; a \b-anchored pattern matches it. The gate re-checks the
  // preceding character, so this is the assertion that keeps that check from being deleted.
  for (const name of ['lstatSync', 'fstatSync']) {
    assert.deepEqual(
      findUnsafeWalks(`const st = ${name}(p);\nif (st.isDirectory()) walk(p);\n`),
      [],
    );
  }
});

test('does not flag mkdirSync with recursive true', () => {
  // The census that motivated this gate matched `recursive:\s*true` and returned six production
  // hits, all six of them mkdirSync. Creating a tree and reading one share a spelling only.
  const src = 'mkdirSync(dir, { recursive: true });\n';
  assert.deepEqual(findUnsafeWalks(src), []);
});

test('flags readdirSync with recursive true', () => {
  const found = findUnsafeWalks('const all = readdirSync(root, { recursive: true });\n');
  assert.equal(found.length, 1);
  assert.equal(found[0].shape, 'readdirSync({ recursive: true })');
});

test('does not flag an occurrence inside a string literal', () => {
  const src = "const msg = 'use statSync(p).isDirectory() carefully';\n";
  assert.deepEqual(findUnsafeWalks(src), []);
});

test('does not flag an occurrence inside a block comment', () => {
  // This is the case that made the gate flag its own docstring on its first run: literalSpans is
  // line-wise and returns on `//`, so a block comment read as code.
  const src = [
    '/**',
    ' * if (statSync(full).isDirectory()) walk(full);',
    ' */',
    'const x = 1;',
  ].join('\n');
  assert.deepEqual(findUnsafeWalks(src), []);
});

test('does not flag an occurrence inside a regex literal', () => {
  const src = 'const re = /statSync\\(.*isDirectory/g;\n';
  assert.deepEqual(findUnsafeWalks(src), []);
});

test('still flags real code that follows a masked occurrence', () => {
  // A masking bug that swallowed the rest of the file would turn the gate into a silent no-op, so
  // the detector has to stay live after a comment and after an unterminated quote.
  const src = [
    '// mentions statSync(p).isDirectory() in prose',
    "const label = 'it\\'s fine';",
    'const st = statSync(full);',
    'if (st.isDirectory()) walk(full);',
  ].join('\n');
  const found = findUnsafeWalks(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 3);
});

test('an unterminated single quote does not mask the remainder of the file', () => {
  const spans = maskedSpans("const a = 'oops\nconst st = statSync(p);\n");
  const idx = "const a = 'oops\nconst st = ".length;
  assert.equal(insideLiteral(spans, idx), false);
});

test('lineOf is 1-based and counts newlines', () => {
  assert.equal(lineOf('a\nb\nc', 0), 1);
  assert.equal(lineOf('a\nb\nc', 2), 2);
  assert.equal(lineOf('a\nb\nc', 4), 3);
});

test('an exemption suppresses exactly its own file and line', () => {
  const sources = [
    { file: 'tools/x.mjs', text: 'const st = statSync(p);\nif (st.isDirectory()) w();\n' },
  ];
  assert.equal(violations(sources, {}).length, 1);
  assert.equal(violations(sources, { 'tools/x.mjs:1': { criterion: 'c' } }).length, 0);
  assert.equal(violations(sources, { 'tools/x.mjs:2': { criterion: 'c' } }).length, 1);
  assert.equal(violations(sources, { 'tools/y.mjs:1': { criterion: 'c' } }).length, 1);
});

test('an exemption naming no real site is reported stale', () => {
  const sources = [{ file: 'tools/x.mjs', text: 'const st = lstatSync(p);\n' }];
  assert.deepEqual(unusedExemptions(sources, { 'tools/x.mjs:1': { criterion: 'c' } }), [
    'tools/x.mjs:1',
  ]);
});

test('an exemption for a file outside the scan is not stale', () => {
  // Staleness means a justification stopped applying, which is only knowable for a file in scope.
  // Without this the gate reported every exemption as stale in any tree but the real one, and its
  // own baseline control exited 1 for a reason unrelated to the defect under test.
  const sources = [{ file: 'tools/x.mjs', text: 'const st = lstatSync(p);\n' }];
  assert.deepEqual(unusedExemptions(sources, { 'tools/elsewhere.mjs:9': { criterion: 'c' } }), []);
});

test('every exempted file exists in the real tree', () => {
  // The hole left by scoping staleness to scanned files: an exemption naming a deleted file is a
  // dangling reference rather than a rotted justification, and the gate cannot see it.
  for (const key of Object.keys(EXEMPT)) {
    const rel = key.slice(0, key.lastIndexOf(':'));
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${key} names a file that does not exist`);
  }
});

test('the baseline control for the teeth fixture exits clean', () => {
  // The violating fixture and a broken staging both exit 1. Only a passing control separates them,
  // and here it is the assertion that caught a real defect in the gate rather than in the fixture.
  const sources = [
    {
      file: 'tools/offender.mjs',
      text: 'if (lstatSync(p).isDirectory()) walk(p);\n',
    },
  ];
  assert.equal(report(sources, {}).ok, true);
});

test('every recorded exemption carries a criterion about following a link', () => {
  // Asserting a length would invent a number; the checkable property is that the sentence is about
  // the thing being permitted, so a future entry cannot be justified by a label.
  for (const [key, value] of Object.entries(EXEMPT)) {
    assert.ok(value.criterion, `${key} has no criterion`);
    assert.match(
      value.criterion,
      /link|symlink|junction|follow/i,
      `${key} criterion names no subject`,
    );
    assert.match(value.criterion, /\.$/, `${key} criterion is not a sentence`);
  }
});

test('report fails on a violation and names the file and line', () => {
  const sources = [
    { file: 'tools/x.mjs', text: 'const st = statSync(p);\nif (st.isDirectory()) w();\n' },
  ];
  const { ok, lines } = report(sources);
  assert.equal(ok, false);
  assert.ok(lines.join('\n').includes('tools/x.mjs:1'));
});

test('report passes on a clean tree', () => {
  const { ok } = report([{ file: 'tools/x.mjs', text: 'const st = lstatSync(p);\n' }], {});
  assert.equal(ok, true);
});

test('readSources reaches both scanned directories and finds real files', () => {
  const sources = readSources(ROOT);
  const found = new Set(sources.map((s) => s.file));
  // Named files rather than a threshold: a count would be an invented bound, and naming the gate's
  // own source plus one file per scanned directory is what the assertion actually cares about.
  assert.ok(found.has('tools/check-walk-safety.mjs'), 'the gate did not scan its own source');
  for (const dir of SCANNED_DIRECTORIES) {
    assert.ok(
      sources.some((s) => s.file.startsWith(`${dir}/`)),
      `no source scanned under ${dir}/`,
    );
  }
});

test('readSources does not descend into a link', () => {
  // withFileTypes is the load-bearing property: a Dirent is link-safe *and* carries no
  // check-then-use window, which is what CodeQL flagged the lstat version for.
  const text = fs.readFileSync(path.join(ROOT, 'tools', 'check-walk-safety.mjs'), 'utf8');
  assert.match(
    text,
    /readdirSync\(dir, \{ withFileTypes: true \}\)/,
    'readSources must use Dirent',
  );
  assert.ok(!/fs\.lstatSync\(/.test(text), 'readSources should not need a per-entry stat at all');
});

test('readSources excludes a linked source and a linked directory, measured', () => {
  // This replaces an assertion that matched `entry.isSymbolicLink()` in the source text. That
  // assertion was wrong in kind: readSources gates recursion on isDirectory() and collection on
  // isFile(), and Dirent reports *both* false for a link, so the explicit skip here is dead code
  // and a test that fails when you delete dead code is asserting an implementation, not a
  // property. The skip is kept as defence against a future change to the collection predicate --
  // and is knowingly unfalsifiable while that predicate stays positive (#4355).
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'walklink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'walklink-out-'));
  const made = [];
  const links = [];
  const write = (full, body) => {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
    made.push(full);
  };
  try {
    write(path.join(root, 'tools', 'real.mjs'), 'export const x = 1;\n');
    write(path.join(outside, 'leaked.mjs'), 'export const leaked = 1;\n');

    for (const [target, name, type] of [
      [path.join(outside, 'leaked.mjs'), path.join(root, 'tools', 'linked.mjs'), 'file'],
      [outside, path.join(root, 'tools', 'linkeddir'), 'junction'],
    ]) {
      try {
        fs.symlinkSync(target, name, type);
        links.push([name, type]);
      } catch {
        // Link creation is privileged on some Windows configurations; assert the arms that exist.
      }
    }
    if (links.length === 0) return;

    const files = readSources(root).map((source) => source.file);
    assert.ok(files.includes('tools/real.mjs'), 'the real file is still read');
    assert.ok(
      !files.some((file) => file.includes('linked')),
      `no link was followed: ${files.join(', ')}`,
    );
  } finally {
    for (const [name, type] of links) {
      // symlinkSync's type argument is Windows-only, so 'junction' yields a plain symlink on
      // Linux and rmdir fails ENOTDIR. Ask the filesystem, do not trust the requested type.
      void type;
      try {
        fs.unlinkSync(name);
      } catch {
        fs.rmdirSync(name);
      }
    }
    for (const full of made) fs.unlinkSync(full);
    for (const dir of [path.join(root, 'tools'), root, outside]) {
      try {
        fs.rmdirSync(dir);
      } catch {
        // Left for inspection rather than removed recursively.
      }
    }
  }
});

test('the real tree has no unjustified link-following directory test', () => {
  const { ok, lines } = report(readSources(ROOT));
  assert.equal(ok, true, lines.join('\n'));
});

test('the fixed sites are actually fixed, not merely exempted', () => {
  // verify-build-env's walk and the manifest test's probe predicate were changed to lstat rather
  // than justified. If either regressed to statSync the gate would fail, but this pins the
  // resolution so a future exemption cannot quietly become the answer instead.
  for (const rel of ['tools/verify-build-env.mjs', 'tools/check-ai-manifest.test.mjs']) {
    assert.ok(!Object.hasOwn(EXEMPT, rel), `${rel} must not be exempted wholesale`);
    for (const key of Object.keys(EXEMPT)) {
      assert.ok(!key.startsWith(`${rel}:`), `${rel} was fixed and must carry no exemption`);
    }
  }
});
