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
  enumerationOnLine,
  fencedSuppressions,
  findRestatedEnumerations,
  isFenceAware,
  isScannedFile,
  violationLines,
  exemptedSuppressions,
  exemptionInventory,
  hasExemption,
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
  const [header] = violationLines([VIOLATION], 3161, 4, 0);
  assert.match(header, /— 1 across 3161 scanned file\(s\)/);
  assert.match(header, /with 4 line\(s\) exempted/);
  assert.ok(header.includes(`"${EXEMPTION}"`), 'the marker name must be named, not described');
});

test('violationLines counts violations, not scanned files, in the first bucket', () => {
  const [header] = violationLines([VIOLATION, { ...VIOLATION, line: 43 }], 10, 0, 0);
  assert.match(header, /— 2 across 10 scanned file\(s\)/);
});

test('violationLines emits file, line, id, enumeration and source text per finding', () => {
  const lines = violationLines([VIOLATION], 1, 0, 0);
  assert.ok(lines.includes('  docs/guides/x.md:42  ENG-SEC-008'), lines.join('\n'));
  assert.ok(lines.includes('    enumerates: accounts, balances, and transactions'));
  assert.ok(lines.some((l) => l.includes(VIOLATION.text)));
});

test('violationLines closes with the remedy and cites ADR-0003', () => {
  const lines = violationLines([VIOLATION], 1, 0, 0);
  assert.match(lines.at(-1), /ADR-0003 \(four-authority topology\)/);
  assert.ok(lines.some((l) => l.includes('drifts by losing an item')));
});

test('violationLines line count scales by three per finding', () => {
  const one = violationLines([VIOLATION], 1, 0, 0).length;
  const two = violationLines([VIOLATION, VIOLATION], 1, 0, 0).length;
  assert.equal(two - one, 3);
});

test('cleanLine reports both the scanned and exempted counts', () => {
  const line = cleanLine(3161, 4, 0);
  assert.match(line, /3161 file\(s\) scanned/);
  assert.match(line, /4 line\(s\) exempted/);
  assert.match(line, /No principle enumeration is restated as an obligation\./);
});

test('cleanLine discloses the line-at-a-time limitation that makes a wrapped list invisible', () => {
  assert.match(
    cleanLine(1, 0, 0),
    /Read one line at a time, so a list wrapped across a line break/,
  );
});

test('a zero-exemption green result still names the exemption bucket', () => {
  // Omitting the bucket when it is empty would make "0 exempted" and "not measured"
  // render identically -- the failure mode this tool's own comment warns about.
  assert.match(cleanLine(3161, 0, 0), /0 line\(s\) exempted/);
});

test('the defect this was written for is caught', () => {
  const text =
    'Notably, `ENG-TEST-004` (distinct static signals) requires lint, format, type-check, and tests'; // enumeration-fixture: input the detector must flag
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
  const found = findRestatedEnumerations('`ENG-SEC-001` requires alpha, beta, gamma'); // enumeration-fixture: Oxford-comma-free list under test
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
  const text = ['first', 'second', '`ENG-SEC-001` requires a, b, and c'].join('\n'); // enumeration-fixture: line number must be 3
  assert.equal(findRestatedEnumerations(text)[0].line, 3);
});

test('every violation on a line is reported once, not once per matching word', () => {
  const found = findRestatedEnumerations(
    '`ENG-SEC-001` requires a, b, and c and mandates d, e, and f', // enumeration-fixture: two enumerations on one line
  ); // enumeration-fixture
  assert.equal(found.length, 1);
});

test('CRLF input is split the same as LF', () => {
  const text = 'x\r\n`ENG-SEC-001` requires a, b, and c\r\n'; // enumeration-fixture: CRLF line numbering
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
  const text = '`ENG-SEC-001` requires a, b, and c // enumeration-fixture: fixture text'; // enumeration-fixture: marker inside the fixture string is data
  assert.deepEqual(findRestatedEnumerations(text), []);
  assert.equal(countExemptions(text), 1);
  assert.equal(EXEMPTION, 'enumeration-fixture');
});

test('exempting one line does not exempt its neighbours', () => {
  // The failure mode a path exclusion would have: one deliberate fixture
  // silently covering a real defect beside it.
  const text = [
    '`ENG-SEC-001` requires a, b, and c // enumeration-fixture: fixture text', // enumeration-fixture: exempt element beside a live one
    '`ENG-SEC-002` requires d, e, and f', // enumeration-fixture: the live element of that pair
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
  const violatingLine = 'ENG-TEST-004 requires type, lint, build, format, and security checks.\n'; // enumeration-fixture: the spawn test's input
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

// --- fence awareness (#4315) -------------------------------------------------------------------
//
// This gate false-accused a fenced *illustration* of the violation it exists to describe: prose
// showing what a restated enumeration looks like was reported as a restated enumeration. Two other
// scanners in this repository had already grown the same guard independently, and one of them
// exported it -- with zero importers.

// The fixture sentence is assembled rather than written out: this gate scans its own test file,
// and a `.mjs` file has no fence semantics, so a literal restatement here is a real violation.
// Assembling the ID keeps `CITATION` from matching the source line while the runtime value is
// exactly what a document would contain. The alternative -- the `enumeration-fixture` marker --
// cannot be used, because the marker also suppresses detection at runtime, so the fixture would
// stop exercising the thing under test.
const FIXTURE_ID = ['ENG', 'TEST', '004'].join('-');
const RESTATEMENT = `\`${FIXTURE_ID}\` requires lint, format, and type-check.`;

const FENCED_DOC = [
  'Prose about the rule.',
  '',
  '```md',
  RESTATEMENT,
  '```',
  '',
  'That block illustrates the violation; it does not commit it.',
].join('\n');

test('a fenced illustration is not reported when fence semantics apply', () => {
  assert.equal(findRestatedEnumerations(FENCED_DOC, { fenceAware: true }).length, 0);
});

test('CONTROL: the same line outside a fence is still reported', () => {
  // Without this the test above would pass on a detector that finds nothing at all, which is the
  // failure mode of every scope narrowing: the exclusion and a broken predicate look identical.
  assert.equal(findRestatedEnumerations(RESTATEMENT, { fenceAware: true }).length, 1);
});

test('fence semantics are off by default, so source files are unaffected', () => {
  assert.equal(
    findRestatedEnumerations(FENCED_DOC).length,
    1,
    'a backtick run in .mjs is a comment',
  );
});

test('isFenceAware selects markdown and nothing else', () => {
  assert.equal(isFenceAware('docs/guides/x.md'), true);
  assert.equal(isFenceAware('docs/guides/X.MD'), true);
  assert.equal(isFenceAware('tools/x.mjs'), false);
  assert.equal(isFenceAware('.github/workflows/ci.yml'), false);
});

test('the exclusion reports what it removed, not that it happened', () => {
  const suppressed = fencedSuppressions(FENCED_DOC);
  assert.equal(suppressed.length, 1);
  assert.equal(suppressed[0].id, FIXTURE_ID);
  assert.equal(suppressed[0].line, 4, 'the one-based line inside the fence');
});

test('fencedSuppressions counts nothing when nothing was excluded', () => {
  assert.deepEqual(fencedSuppressions(RESTATEMENT), []);
});

test('both populations are decided by the same predicate', () => {
  // Two copies of a detector, one per branch, is how a filter and its census come to disagree
  // about what they were counting.
  const direct = enumerationOnLine(RESTATEMENT, 0);
  assert.equal(direct.id, FIXTURE_ID);
  assert.deepEqual(findRestatedEnumerations(RESTATEMENT, { fenceAware: true }), [direct]);
  assert.equal(fencedSuppressions(['```', RESTATEMENT, '```'].join('\n'))[0].id, direct.id);
});

test('the exemption marker still wins inside and outside a fence', () => {
  const exempt = `${RESTATEMENT} <!-- ${EXEMPTION}: illustration, not an obligation -->`;
  assert.equal(enumerationOnLine(exempt, 0), null);
  assert.deepEqual(fencedSuppressions(['```', exempt, '```'].join('\n')), []);
});

// --- the fenced count is asserted, not merely printed -------------------------------------------

test('the clean line states the fenced-skip count', () => {
  // Added as a fourth argument, and every existing call site passed three. The reports read
  // "undefined markdown line(s) skipped" and the whole suite stayed green -- an unasserted report
  // parameter, reproduced in code written minutes earlier by someone who had just measured the
  // same defect in fifteen other tools.
  assert.match(cleanLine(3161, 4, 9), /9 markdown line\(s\) skipped inside fenced blocks/);
  assert.doesNotMatch(cleanLine(3161, 4, 0), /undefined/);
});

test('the failing header states the fenced-skip count too', () => {
  const [header] = violationLines([VIOLATION], 3161, 4, 9);
  assert.match(header, /9 markdown line\(s\) skipped inside fenced blocks/);
  assert.doesNotMatch(header, /undefined/);
});

test('the fenced count moves with its argument on both paths', () => {
  // A count that never varies in a test is indistinguishable from a constant in the template.
  assert.match(cleanLine(1, 0, 7), /7 markdown line/);
  assert.match(violationLines([VIOLATION], 1, 0, 7)[0], /7 markdown line/);
});

// --- the marker is hardened as a class, not as an instance (#4320) -----------------------------
//
// A sibling checker's marker was hardened against three acceptance defects one change earlier. The
// fix was written as a comment on that marker, and the comment was completely accurate -- which is
// exactly why it read as describing the class. All three defects survived untreated in this file.

test('a bare marker does not excuse: an exemption must say why', () => {
  assert.equal(hasExemption(`x // ${EXEMPTION}`), false);
  assert.equal(hasExemption(`x // ${EXEMPTION}: fixture input`), true);
  assert.equal(hasExemption(`x // ${EXEMPTION} - fixture input`), true);
});

test('the marker as string data does not excuse its own file', () => {
  // The marker appearing as a value is a mention. Treating it as a claim lets any file excuse
  // itself by quoting the pragma, which is how a checker comes to return green over real hits.
  assert.equal(hasExemption(`const M = '${EXEMPTION}: not a real exemption';`), false);
  assert.equal(
    hasExemption(`const M = "${EXEMPTION}: x"; // ${EXEMPTION}: this one is real`),
    true,
  );
});

test('a comment terminator is not a reason', () => {
  // `<!-- marker -->` parses as marker, separator `-`, then `->`. The closing punctuation of the
  // comment carrying the marker satisfied the requirement that the marker be justified. Found by
  // the inventory below on its first run, in a line that had been exempt for four changes.
  assert.equal(hasExemption(`x <!-- ${EXEMPTION} -->`), false);
  assert.equal(hasExemption(`x <!-- ${EXEMPTION}: the quotation under discussion -->`), true);
  assert.equal(hasExemption(`x /* ${EXEMPTION} */`), false);
});

test('the marker in unrelated prose does not excuse a real hit', () => {
  const prose = `${RESTATEMENT} and see the ${EXEMPTION} docs for how to exempt a line`;
  assert.notEqual(enumerationOnLine(prose, 0), null, 'prose about the marker is not a marker');
});

test('exemptedSuppressions names what the marker removed, not where it appears', () => {
  // countExemptions counted marker *occurrences*: 22 in this tree, of which 10 suppressed a real
  // hit. A count that is 55% not-an-exemption cannot detect composition change, because one real
  // exemption can be added while a decorative one is deleted. The rule -- count what the exclusion
  // removed -- was written into fencedSuppressions a hundred lines above, in the same file, one
  // change earlier, and was not applied here.
  const text = [
    `${RESTATEMENT} <!-- ${EXEMPTION}: real -->`,
    `A sentence mentioning ${EXEMPTION} and nothing else.`,
    `const M = '${EXEMPTION}';`,
  ].join('\n');
  assert.deepEqual(exemptedSuppressions(text), [1]);
  assert.equal(countExemptions(text), 1, 'three occurrences, one suppression');
});

test('CONTROL: an exempted line is a line the detector would otherwise report', () => {
  assert.equal(findRestatedEnumerations(RESTATEMENT).length, 1);
  assert.deepEqual(exemptedSuppressions(RESTATEMENT), [], 'unmarked, so not an exemption');
});

test('the inventory names every exempted line by file and line', () => {
  const lines = exemptionInventory([
    { file: 'docs/a.md', lines: [7121] },
    { file: 'tools/b.test.mjs', lines: [93, 141] },
    { file: 'tools/c.mjs', lines: [] },
  ]);
  assert.match(lines.join('\n'), /docs\/a\.md:7121/);
  assert.match(lines.join('\n'), /tools\/b\.test\.mjs:93,141/);
  assert.doesNotMatch(lines.join('\n'), /c\.mjs/, 'a file with no exemptions is not listed');
});

test('the inventory is empty when nothing was excused', () => {
  // A report that prints a heading over an empty list claims an exclusion happened.
  assert.deepEqual(exemptionInventory([{ file: 'tools/c.mjs', lines: [] }]), []);
});
