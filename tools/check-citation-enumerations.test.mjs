import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CITATION,
  EXEMPTION,
  ENUMERATION,
  OBLIGATION,
  SCANNED_EXTENSIONS,
  countExemptions,
  findRestatedEnumerations,
  isScannedFile,
} from './check-citation-enumerations.mjs';

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
