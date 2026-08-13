import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  CITATION,
  EXEMPTION,
  ENUMERATION,
  OBLIGATION,
  SCANNED_EXTENSIONS,
  cleanLine,
  countExemptions,
  findRestatedEnumerations,
  isScannedFile,
  violationLines,
} from './check-citation-enumerations.mjs';

// Report-line tests (#4303).
//
// The predicates above were well covered while the report was not covered at all, and from the
// outside the two states were indistinguishable: the suite was green either way. A sentinel sweep
// scored this tool 0/7. The tests below read the interpolated counts, because the counts are the
// whole content -- a report that names the right violation with the wrong denominator is worse
// than no report, since the denominator is what a reader uses to judge whether the scan was broad.

const VIOLATION = {
  file: 'docs/guides/x.md',
  line: 42,
  id: 'ENG-SEC-008',
  enumeration: 'accounts, balances, and transactions',
  text: 'finance requires accounts, balances, and transactions to be redacted.',
};

test('violationLines states all three buckets of the partition', () => {
  const [header] = violationLines([VIOLATION], 3161, 4);
  assert.match(header, /— 1 across 3161 scanned file\(s\)/);
  assert.match(header, /with 4 line\(s\) exempted/);
  assert.ok(header.includes(`"${EXEMPTION}"`), 'the marker name must be named, not described');
});

test('violationLines counts violations, not scanned files, in the first bucket', () => {
  const [header] = violationLines([VIOLATION, { ...VIOLATION, line: 43 }], 10, 0);
  assert.match(header, /— 2 across 10 scanned file\(s\)/);
});

test('violationLines emits file, line, id, enumeration and source text per finding', () => {
  const lines = violationLines([VIOLATION], 1, 0);
  assert.ok(lines.includes('  docs/guides/x.md:42  ENG-SEC-008'), lines.join('\n'));
  assert.ok(lines.includes('    enumerates: accounts, balances, and transactions'));
  assert.ok(lines.some((l) => l.includes(VIOLATION.text)));
});

test('violationLines closes with the remedy and cites ADR-0003', () => {
  const lines = violationLines([VIOLATION], 1, 0);
  assert.match(lines.at(-1), /ADR-0003 \(four-authority topology\)/);
  assert.ok(lines.some((l) => l.includes('drifts by losing an item')));
});

test('violationLines line count scales by three per finding', () => {
  const one = violationLines([VIOLATION], 1, 0).length;
  const two = violationLines([VIOLATION, VIOLATION], 1, 0).length;
  assert.equal(two - one, 3);
});

test('cleanLine reports both the scanned and exempted counts', () => {
  const line = cleanLine(3161, 4);
  assert.match(line, /3161 file\(s\) scanned/);
  assert.match(line, /4 line\(s\) exempted/);
  assert.match(line, /No principle enumeration is restated as an obligation\./);
});

test('cleanLine discloses the line-at-a-time limitation that makes a wrapped list invisible', () => {
  assert.match(cleanLine(1, 0), /Read one line at a time, so a list wrapped across a line break/);
});

test('a zero-exemption green result still names the exemption bucket', () => {
  // Omitting the bucket when it is empty would make "0 exempted" and "not measured"
  // render identically -- the failure mode this tool's own comment warns about.
  assert.match(cleanLine(3161, 0), /0 line\(s\) exempted/);
});

test('the defect this was written for is caught', () => {
  const text =
    'Notably, `ENG-TEST-004` (distinct static signals) requires lint, format, type-check, and tests'; // enumeration-fixture
  const found = findRestatedEnumerations(text);
  assert.equal(found.length, 1);
  assert.equal(found[0].id, 'ENG-TEST-004'); // enumeration-fixture
  assert.equal(found[0].line, 1);
  assert.match(found[0].enumeration, /lint, format, type-check, and tests/);
});

test('a citation with no obligation verb is not a restatement', () => {
  // Citing a principle beside a list is normal prose. Only an attributed
  // obligation makes the list a restatement of what the principle demands.
  assert.deepEqual(
    findRestatedEnumerations('`ENG-TEST-004` covers lint, format, type-check, and tests'), // enumeration-fixture
    [],
  );
});

test('an obligation with no enumeration is not a restatement', () => {
  assert.deepEqual(
    findRestatedEnumerations('`ENG-PERF-009` forbids trading accessibility away'),
    [],
  );
});

test('an enumeration with no citation is ordinary prose', () => {
  assert.deepEqual(findRestatedEnumerations('CI requires lint, format, type-check, and tests'), []);
});

test('the floor of three rejects a two-item serial list', () => {
  // "a, and b" is the ONLY shape the floor decides. An earlier version of this
  // test used comma-less prose ("budgets and Lighthouse"), which passes whether
  // the floor is two or three — it asserted nothing, and a mutant lowering the
  // floor survived it.
  assert.deepEqual(findRestatedEnumerations('`ENG-SEC-001` requires alpha, and beta'), []); // enumeration-fixture
});

test('comma-less two-item prose is not an enumeration', () => {
  assert.deepEqual(findRestatedEnumerations('`ENG-PERF-007` requires budgets and Lighthouse'), []);
  assert.deepEqual(
    findRestatedEnumerations('`ENG-TEST-004` requires automated and deterministic gates'),
    [],
  );
});

test('the closing conjunction is optional', () => {
  // Measured on the same 171 citations as the rejected widenings: allowing a
  // bare "a, b, c" adds reach at no false-positive cost. Pinned so that
  // narrowing it back to a required "and"/"or" fails here.
  const found = findRestatedEnumerations('`ENG-SEC-001` requires alpha, beta, gamma'); // enumeration-fixture
  assert.equal(found.length, 1);
  assert.equal(found[0].id, 'ENG-SEC-001'); // enumeration-fixture
});
test('a list without a serial comma is a known blind spot, not a pass', () => {
  // The adoption guide's "requires format, lint and type-check" was a real
  // instance of this defect and is invisible here. Pinned so the limit cannot
  // be mistaken for coverage, and so widening the pattern fails this test
  // loudly rather than silently changing the tool's reach.
  assert.deepEqual(
    findRestatedEnumerations('`ENG-TEST-004` requires format, lint and type-check'), // enumeration-fixture
    [],
  );
});

test('the line number is the line of the violation, not of the file', () => {
  const text = ['first', 'second', '`ENG-SEC-001` requires a, b, and c'].join('\n'); // enumeration-fixture
  assert.equal(findRestatedEnumerations(text)[0].line, 3);
});

test('every violation on a line is reported once, not once per matching word', () => {
  const found = findRestatedEnumerations(
    '`ENG-SEC-001` requires a, b, and c and mandates d, e, and f', // enumeration-fixture
  ); // enumeration-fixture
  assert.equal(found.length, 1);
});

test('CRLF input is split the same as LF', () => {
  const text = 'x\r\n`ENG-SEC-001` requires a, b, and c\r\n'; // enumeration-fixture
  assert.equal(findRestatedEnumerations(text)[0].line, 2);
});

test('the patterns are anchored to the shapes they claim', () => {
  assert.match('ENG-TEST-004', CITATION); // enumeration-fixture
  assert.doesNotMatch('ENG-TEST-4', CITATION);
  assert.match('mandates', OBLIGATION);
  assert.doesNotMatch('suggests', OBLIGATION);
  assert.match('a, b, and c', ENUMERATION);
  assert.doesNotMatch('a and b', ENUMERATION);
});

test('only prose and source extensions are scanned', () => {
  assert.equal(isScannedFile('AGENTS.md'), true);
  assert.equal(isScannedFile('tools/x.mjs'), true);
  assert.equal(isScannedFile('image.png'), false);
  assert.equal(isScannedFile('lock.json'), false);
  assert.ok(SCANNED_EXTENSIONS.has('.md'));
});
test('a marked line is exempt and is counted', () => {
  const text = '`ENG-SEC-001` requires a, b, and c // enumeration-fixture';
  assert.deepEqual(findRestatedEnumerations(text), []);
  assert.equal(countExemptions(text), 1);
  assert.equal(EXEMPTION, 'enumeration-fixture');
});

test('exempting one line does not exempt its neighbours', () => {
  // The failure mode a path exclusion would have: one deliberate fixture
  // silently covering a real defect beside it.
  const text = [
    '`ENG-SEC-001` requires a, b, and c // enumeration-fixture', // enumeration-fixture
    '`ENG-SEC-002` requires d, e, and f', // enumeration-fixture
  ].join('\n');
  const found = findRestatedEnumerations(text);
  assert.equal(found.length, 1);
  assert.equal(found[0].id, 'ENG-SEC-002');
  assert.equal(countExemptions(text), 1);
});

// -- scope on the failure path ---------------------------------------------
// The green path printed scanned AND exempted; the red path printed scanned
// only. The missing bucket is the one that can HIDE a violation, since an
// exempted line is one this check chose not to see.

const enumToolDirectory = dirname(fileURLToPath(import.meta.url));
const ENUM_TOOL = join(enumToolDirectory, 'check-citation-enumerations.mjs');
const enumRepositoryRoot = resolve(enumToolDirectory, '..');

test('a failing run states both the scanned and the exempted bucket', () => {
  const probe = join(enumRepositoryRoot, 'docs', '_scope_probe_fixture.md');
  // enumeration-fixture -- this literal IS a violation, which is the point: a
  // test for an enumeration checker cannot avoid containing an enumeration as
  // data. The exclusion is structural, not a temporary narrowing.
  const violatingLine = 'ENG-TEST-004 requires type, lint, build, format, and security checks.\n'; // enumeration-fixture
  writeFileSync(probe, violatingLine, 'utf8');
  let result;
  try {
    result = spawnSync(process.execPath, [ENUM_TOOL], { encoding: 'utf8' });
  } finally {
    unlinkSync(probe);
  }
  assert.equal(result.status, 1, 'the probe must actually fail, or this asserts nothing');
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, /\d+ across \d+ scanned file\(s\), with \d+ line\(s\) exempted/);
});

test('a passing run states the same two buckets', () => {
  const result = spawnSync(process.execPath, [ENUM_TOOL], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\d+ file\(s\) scanned, \d+ line\(s\) exempted/);
});
