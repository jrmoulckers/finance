import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED,
  OWNER,
  SCANNED_DIRECTORIES,
  censusLines,
  classify,
  collectScripts,
  fencePredicateLines,
  isScannedFile,
  PRIMITIVES,
  predicateLines,
} from './check-markdown-primitives.mjs';

// The fence delimiters below are assembled, for the same reason the tool assembles its own: a
// literal run in this file would be scanned as a predicate by the tool it tests.
const TICK = String.fromCharCode(96).repeat(3);
const TILDE = '~'.repeat(3);

test('an anchored regex testing for a fence run is a predicate', () => {
  assert.deepEqual(fencePredicateLines(`const F = /^\\s*${TICK}/;`), [1]);
  assert.deepEqual(fencePredicateLines(`const F = /^\\s*(?:${TICK}|${TILDE})/;`), [1]);
});

test('a startsWith test against a fence run is a predicate', () => {
  assert.deepEqual(fencePredicateLines(`if (line.startsWith('${TICK}')) toggle();`), [1]);
});

test('CONTROL: a fence delimiter that is not used as a predicate is not reported', () => {
  // Without this the detector could be matching the delimiter alone, which appears in every
  // fixture and most prose, and the census would be a count of documents rather than of code.
  assert.deepEqual(fencePredicateLines(`const doc = ['${TICK}md', 'x', '${TICK}'].join('n');`), []);
  assert.deepEqual(fencePredicateLines(`// a ${TICK} block is an illustration`), []);
});

test('line numbers are one-based and every occurrence is named', () => {
  const text = ['const a = 1;', `const F = /^${TICK}/;`, 'const b = 2;', `x.startsWith('${TILDE}')`]
    .join('\n')
    .replace('x.startsWith', 'line.startsWith');
  assert.deepEqual(fencePredicateLines(text), [2, 4]);
});

test('the owner is not reported as a duplicate', () => {
  const { owner, unowned } = classify([{ file: OWNER, lines: [25] }]);
  assert.equal(owner.length, 1);
  assert.equal(unowned.length, 0);
});

test('an allowlisted file is separated from an unowned one', () => {
  const allowedFile = Object.keys(ALLOWED)[0];
  const groups = classify([
    { file: allowedFile, lines: [337] },
    { file: path.join('tools', 'invented.mjs'), lines: [9] },
  ]);
  assert.equal(groups.allowed.length, 1);
  assert.equal(groups.unowned.length, 1);
});

test('every allowlist entry states why it cannot use the owner', () => {
  // A bare allowlist is an exemption with no reason -- the defect hardened out of the
  // enumeration-fixture marker one change earlier. That fix was recorded in a comment which read
  // as describing the class and did not travel one file over. This assertion is the second
  // application, which is the only evidence the lesson was ever about the class.
  const entries = Object.entries(ALLOWED);
  assert.ok(entries.length > 0, 'the allowlist is non-empty, so the rule is exercised');
  for (const [file, reason] of entries) {
    assert.match(reason, /[A-Za-z]{4,}/, `${file} has a reason`);
    // unsourced-bound: nothing in the tree commits to a minimum reason length, and inventing a
    // threshold here would be the defect this repository's bounds gate exists to catch. The bound
    // is a floor against an empty or one-word placeholder, not a measure of quality; the reason is
    // judged by a reader, which is why the census prints it rather than only asserting it exists.
    assert.ok(reason.length > 20, `${file}'s reason says something specific`);
  }
});

test('the census names every implementation, on the passing path too', () => {
  // A gate that prints only on failure cannot be audited when it passes, and a wrongly-allowed
  // implementation is exactly the case that passes.
  const allowedFile = Object.keys(ALLOWED)[0];
  const out = censusLines(
    classify([
      { file: OWNER, lines: [25] },
      { file: allowedFile, lines: [337, 370] },
    ]),
    68,
    17,
  ).join('\n');
  assert.match(out, /2 implementation\(s\) across 68 script\(s\)/);
  assert.match(out, /17 test file\(s\) not scanned/);
  assert.match(out, /337,370/, 'the allowed lines are named, not counted');
  assert.match(
    out,
    new RegExp(ALLOWED[allowedFile].slice(0, 20).replace(/[(){}[\]*+?.\\^$|]/g, '\\$&')),
  );
});

test('the report counts move with their arguments', () => {
  // A number that never varies in a test is indistinguishable from a constant in the template --
  // reproduced twice in this repository, both times in a report parameter nothing asserted.
  const groups = classify([{ file: OWNER, lines: [25] }]);
  assert.match(censusLines(groups, 5, 1)[0], /across 5 script\(s\) scanned, 1 test file/);
  assert.match(censusLines(groups, 9, 4)[0], /across 9 script\(s\) scanned, 4 test file/);
});

test('an unowned implementation produces the remedy, naming the owner', () => {
  const out = censusLines(classify([{ file: path.join('tools', 'x.mjs'), lines: [9] }]), 1, 0).join(
    '\n',
  );
  assert.match(out, /Independent fence-predicate implementation\(s\)/);
  assert.match(out, /tools[\\/]x\.mjs:9/);
  assert.match(out, /CommonJS cannot load ESM/, 'the forced case is offered, not just the fix');
});

test('tests are excluded from the population and counted', () => {
  assert.equal(isScannedFile('check-x.mjs'), true);
  assert.equal(
    isScannedFile('check-x.js'),
    true,
    'CommonJS is scanned: it is the forced-copy case',
  );
  assert.equal(isScannedFile('check-x.test.mjs'), false, 'a fence test contains fences as data');
  assert.equal(isScannedFile('notes.md'), false);
});

test('both script directories are censused', () => {
  // scripts/ is where the CommonJS tools live, which is the population that structurally cannot
  // import the ESM owner. Censusing only tools/ would exclude the reason the allowlist exists.
  assert.deepEqual([...SCANNED_DIRECTORIES].sort(), ['scripts', 'tools']);
});

test('scripts are enumerated from disk, recursively, and the gate fires on a real tree', () => {
  // The end-to-end negative control: the census is only worth having if an added reimplementation
  // is actually caught. Asserting the classifier alone would pass on a walker that finds nothing.
  const root = mkdtempSync(path.join(tmpdir(), 'mdprim-'));
  const made = [];
  const write = (rel, body) => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
    made.push(full);
    return full;
  };
  try {
    write(path.join('tools', 'clean.mjs'), 'export const x = 1;\n');
    write(path.join('tools', 'nested', 'dup.mjs'), `const F = /^\\s*${TICK}/;\n`);
    write(path.join('tools', 'dup.test.mjs'), `const F = /^\\s*${TICK}/;\n`);
    write(path.join('scripts', 'clean.js'), 'module.exports = {};\n');

    const scripts = collectScripts(root);
    const names = scripts.map((f) => path.relative(root, f));
    assert.ok(names.includes(path.join('tools', 'nested', 'dup.mjs')), 'walks subdirectories');
    assert.ok(names.includes(path.join('scripts', 'clean.js')), 'walks every scanned directory');
    assert.equal(scripts.skippedTests.length, 1, 'the excluded test is counted, not discarded');
    assert.ok(!names.some((n) => n.endsWith('.test.mjs')));

    const sites = scripts
      .map((f) => ({
        file: path.relative(root, f),
        lines: fencePredicateLines(readFileSync(f, 'utf8')),
      }))
      .filter((s) => s.lines.length > 0);
    const groups = classify(sites);
    assert.equal(groups.unowned.length, 1, 'the added reimplementation is caught');
    assert.equal(groups.unowned[0].file, path.join('tools', 'nested', 'dup.mjs'));
    assert.match(
      censusLines(groups, scripts.length, 1).join('\n'),
      /Independent fence-predicate implementation/,
    );
  } finally {
    // Removed by name, innermost first: an empty directory is removed with rmdir, never with a
    // recursive delete. A cleanup that reaches for -rf is one typo from the wrong subtree.
    for (const full of made) rmSync(full, { force: true });
    for (const dir of [
      path.join(root, 'tools', 'nested'),
      path.join(root, 'tools'),
      path.join(root, 'scripts'),
      root,
    ]) {
      rmdirSync(dir);
    }
  }
});

test('a full predicate quoted inside a literal is a mention, not an implementation (#4330)', () => {
  // The CONTROL above rules out the *delimiter* alone being enough. It passed throughout, because
  // its inputs contain no predicate construct at all -- they could not have matched with or without
  // stripping. The adjacent, stronger case was broken the whole time: a complete predicate held as
  // data in a remediation string or a docstring counted as an independent implementation.
  //
  // A control that excludes the weakest form of a defect reads, to anyone auditing the file, as
  // excluding the class.
  const real = `if (/^\\s*${TICK}/.test(line)) toggle();`;
  assert.deepEqual(fencePredicateLines(real), [1], 'a real predicate must still be found');
  assert.deepEqual(fencePredicateLines(`const advice = '${real}';`), [], 'quoted: a mention');
  assert.deepEqual(fencePredicateLines(`// historical: ${real}`), [], 'commented: a mention');
});

test('every primitive names an owner, an allowlist, signatures, and remediation', () => {
  // The table is the extension point: adding a predicate must be a row, not a second tool. A row
  // missing a field degrades silently -- an absent allowlist throws only once something matches it.
  // Named rather than counted. A `>= 2` here would be an invented number, and it would keep
  // passing if a predicate were renamed or dropped and another added.
  const labels = PRIMITIVES.map((primitive) => primitive.label);
  assert.deepEqual([...new Set(labels)], labels, 'labels are distinct');
  for (const required of ['Fence-predicate', 'Literal-stripping']) {
    assert.ok(labels.includes(required), `${required} is registered`);
  }
  for (const primitive of PRIMITIVES) {
    assert.equal(typeof primitive.label, 'string', 'label');
    assert.equal(typeof primitive.owner, 'string', 'owner');
    assert.equal(typeof primitive.allowed, 'object', 'allowlist');
    assert.ok(Array.isArray(primitive.signatures) && primitive.signatures.length > 0, 'signatures');
    assert.ok(String(primitive.hint).length > 0, 'remediation');
  }
});

test('literal-stripping signatures reject quote-aware regexes that are not strippers', () => {
  // The first draft matched any negated class over one quote character, and reported a
  // SQL-injection pattern and an XML attribute parser as duplicate implementations. Both are
  // CommonJS, so the allowlist reason every other entry uses -- "require() cannot load the ESM
  // owner" -- was true of both, and would have recorded a correct sentence about two files that are
  // not members of the class at all. An allowlist asks why a file cannot use the owner; it never
  // asks whether the file is an instance, so a true reason is not evidence of membership.
  const literal = PRIMITIVES.find((primitive) => primitive.label === 'Literal-stripping');
  assert.ok(literal, 'the literal-stripping primitive is registered');
  const negatives = [
    `pattern: /${TICK[0]}[^${TICK[0]}]*\\$\\{[^}]+\\}[^${TICK[0]}]*(?:SELECT)/i,`,
    'const re = /<string\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)<\\/string>/g;',
    'const at = outsideLiterals.indexOf(EXEMPTION);',
  ];
  for (const line of negatives) {
    assert.deepEqual(predicateLines(line, literal.signatures), [], `not a stripper: ${line}`);
  }
  const q = TICK[0];
  assert.deepEqual(
    predicateLines(`line.replace(/'[^']*'|"[^"]*"|${q}[^${q}]*${q}/g, '');`, literal.signatures),
    [1],
    'the naive multi-delimiter form is a member',
  );
  assert.deepEqual(
    predicateLines(
      `line.replace(/(['"${q}])(?:\\\\.|(?!\\1)[^\\\\])*\\1/g, (m) => m);`,
      literal.signatures,
    ),
    [1],
    'the escape-aware form is a member',
  );
});

test('each primitive detects its own owner, so a census cannot pass by seeing nothing', () => {
  // Signatures that match no file pass with an empty population, which is indistinguishable from a
  // tree with no duplication. Requiring the owner to match its own signatures makes a detector that
  // has stopped detecting fail instead of certifying.
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const primitive of PRIMITIVES) {
    const source = readFileSync(path.join(root, primitive.owner), 'utf8');
    assert.ok(
      predicateLines(source, primitive.signatures).length > 0,
      `${primitive.label}: the owner ${primitive.owner} must match its own signatures`,
    );
  }
});
