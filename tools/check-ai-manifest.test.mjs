// Pins the two digest rules in check-ai-manifest.js against the sync engine.
//
// A comment recording a rule is not a check that the rule holds. This file exists because the
// managed-region rule was derived empirically from a corpus that could not separate it from a
// near-miss: `.trim()` agrees with the engine on every region body that does not begin with
// whitespace, and none of this repo's region entries begin with one. The sweep was honest and
// returned zero mismatches over inputs incapable of falsifying it (.github#659).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const {
  toLF,
  reachableEnvVars,
  validateEnvInputs,
  PROVENANCE_LINE,
  managedRegion,
  managedDigest,
  verifyLockCoverage,
  lockCoverage,
  WALK_SKIP,
  PROVENANCE_HINT,
  unstampSource,
  commentFamily,
  verifySourceReproduction,
  KNOWN_UNREPRODUCED,
  CANON_CITATIONS,
  ENFORCEMENT_WORKFLOW,
  driftEnforcement,
  enforcementFindings,
  BREADTH_FLOOR,
  FAMILY_SETS,
  corpusBreadth,
  HASH_EXTENSIONS,
  BLOCK_EXTENSIONS,
  HTML_EXTENSIONS,
  validateSyncLock,
  SYNC_LOCK,
  triggerPaths,
  triggerCovers,
  triggerFindings,
  checkInputs,
  METRICS,
  HELP_TEXT,
  VALIDATORS,
  dispatchValidators,
  activationRunners,
  EXPECTED_AGENTS,
  MANAGED_COUNTS,
  citationFindings,
  managedTargets,
  managedBasis,
  lockEntries,
  MANAGED_FLOOR,
  citationCorpus,
  validateCitationCoverage,
  BACKBONE_CLAIM,
  MAX_CITATION_BYTES,
  exemptionMatches,
  sourceDisclosureLines,
  DOC_FILES,
  scanDoc,
  scanDocs,
  countCoverageFindings,
} = require('./check-ai-manifest.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools', 'check-ai-manifest.js');

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const wrap = (body) => `<!-- studio:base:start -->\n${body}<!-- studio:base:end -->\n`;

test('a managed region body beginning with whitespace is significant, and .trim() is the near-miss', () => {
  for (const body of ['\ncanon line\n', '  indented\n', '\t tab\n']) {
    const digest = managedDigest(wrap(body));
    assert.equal(digest, sha(body.replace(/\s+$/, '')), 'must follow the engine rule');
    assert.notEqual(digest, sha(body.trim()), 'must not collapse to .trim()');
  }
});

test('PREMISE: the two rules agree on canon-shaped bodies, which is why the defect is latent', () => {
  // If this fails, the divergence is no longer latent and the test above is no longer
  // describing a near-miss -- rather than passing on a corpus that no longer contains the case.
  const body = 'canon line\n';
  assert.equal(managedDigest(wrap(body)), sha(body.trim()));
});

test('the whole-file rule strips nothing', () => {
  const text = 'no markers here\n';
  assert.equal(managedRegion(text), null);
  assert.equal(managedDigest(text), sha(text));
  assert.notEqual(managedDigest(text), sha(text.trim()));
});

test('lock coverage observes the non-Markdown corpus, not just .github Markdown', () => {
  // This check spent its whole life blind to 23 of 81 lock entries -- the vendored token tree
  // -- behind three independent filters: a .github-only root list, a `.mdx?` extension filter,
  // and a stamp regex matching one origin in one comment syntax. Measured as a 2^3 lattice,
  // every single-filter removal was a provable no-op (54 observed in all four of the 000/100/
  // 010/001 cells); only lifting all three moved it, to 64. So no single-variable audit could
  // have found it, and the pair that surfaced one file invites an explanation rather than an
  // audit (#4204). These assertions are over the delivered corpus, not a fixture.
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  const recorded = Object.keys(lock.entries || {});
  const nonMarkdown = recorded.filter((entry) => !/\.mdx?$/.test(entry));

  // PREMISE: if the lock ever holds only Markdown, this test proves nothing and should say so
  // rather than pass. The engine delivers CSS, Kotlin, Swift and TypeScript to this repo.
  assert.ok(nonMarkdown.length > 0, 'PREMISE: the lock must record non-Markdown targets');

  const present = nonMarkdown.filter((entry) => fs.existsSync(path.join(ROOT, entry)));
  assert.ok(present.length > 0, 'PREMISE: at least one non-Markdown target must be on disk');

  // The stamp on those files is a different origin AND a different comment syntax than the
  // canon stamp. Matching only the canon form is what made filter 3 load-bearing.
  const stamped = present.filter((entry) =>
    PROVENANCE_LINE.test(fs.readFileSync(path.join(ROOT, entry), 'utf8')),
  );
  assert.ok(
    stamped.length > 0,
    `no on-disk non-Markdown target matches PROVENANCE_LINE; the walk is blind again (${present.length} present)`,
  );

  // And the walk must actually reach them: a clean result from a walk that never entered
  // vendor/ is the failure this issue was about.
  assert.deepEqual(verifyLockCoverage(lock), [], 'baseline must stay clean over the wider walk');
});

test('lock coverage counts each file once when roots nest', () => {
  // The lock contributes `.github` as a root, which contains all four MANAGED_BASES, so every
  // managed file is reachable twice. Without dedupe the walk double-reports; the stamped-
  // unrecorded control caught exactly that as `2 !== 1` while this change was being written.
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  const dir = path.join(ROOT, '.github/skills/__nesting_probe__');
  const file = path.join(dir, 'SKILL.md');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      file,
      '<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->\n\n# probe\n',
    );
    const findings = verifyLockCoverage(lock);
    assert.equal(findings.length, 1, `a file reachable by nested roots must report once`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(verifyLockCoverage(lock), [], 'probe must leave no residue');
});

test('the two-sided premise guard fires when the walk observes only Markdown', () => {
  // Disabling this guard alone leaves the suite green, because it never fires against the real
  // corpus. It is nonetheless what kills the three filter mutants -- restoring any one of the
  // original filters drops non-Markdown observation to zero and this clause turns that into a
  // loud finding. So it is load-bearing in conjunction and invisible in isolation, which is
  // the exact shape that let #4204 survive. This test exercises it directly, on a synthetic
  // lock rather than by degrading the checker.
  const real = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  const markdownOnly = Object.fromEntries(
    Object.entries(real.entries).filter(([entry]) => /\.mdx?$/.test(entry)),
  );

  // PREMISE: the synthetic lock must still record Markdown, or the first clause fires instead
  // and this test would pass for the wrong reason.
  assert.ok(Object.keys(markdownOnly).length > 0, 'PREMISE: synthetic lock must record Markdown');

  const findings = verifyLockCoverage({ entries: markdownOnly });
  assert.ok(
    findings.some((f) => f.includes('observed only Markdown')),
    `the Markdown-only guard must fire; got ${JSON.stringify(findings.slice(0, 3))}`,
  );
  assert.ok(
    !findings.some((f) => f.includes('check is not observing')),
    'the zero-observation clause must NOT fire; Markdown was observed',
  );
});

test('the stamp reader skips files past the size cap', () => {
  // The cap was inert when added: nothing in the corpus is near 512 KB, so disabling it left
  // the suite green. A guard that cannot fire is indistinguishable from one that was deleted,
  // so the condition is constructed here rather than waited for. The probe is stamped and
  // unrecorded, which is the state that produces a finding -- so if the cap stops working the
  // file is read, matched, and reported, and this test says so.
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  const dir = path.join(ROOT, '.github/skills/__size_probe__');
  const file = path.join(dir, 'SKILL.md');
  const stamp = '<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->';
  try {
    fs.mkdirSync(dir, { recursive: true });

    // PREMISE: at the small size it IS reported, so a clean result at the large size is the
    // cap working rather than the walk failing to reach the directory at all.
    fs.writeFileSync(file, `${stamp}\n\n# probe\n`);
    assert.equal(verifyLockCoverage(lock).length, 1, 'PREMISE: small stamped probe is reported');

    fs.writeFileSync(file, `${stamp}\n\n${'x'.repeat(600 * 1024)}\n`);
    assert.deepEqual(verifyLockCoverage(lock), [], 'a file past the size cap must not be read');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(verifyLockCoverage(lock), [], 'probe must leave no residue');
});

test('CRLF input digests identically to LF, for both shapes', () => {
  // Every input this repo can read is already LF: `.gitattributes` sets `* text=auto eol=lf`
  // and 0 of 61 managed files carry CRLF. So deleting the tool's normalization altogether
  // left the whole suite green and `--strict` at exit 0 -- correct code, held up by a
  // checkout setting rather than by anything that could fail (#4201). These assertions are
  // the ones that notice. They construct CRLF rather than reading it, so they do not depend
  // on the working tree's line endings and cannot decay if `.gitattributes` changes.
  for (const lf of ['no markers here\n', wrap('canon line\n'), wrap('\nleading blank\n')]) {
    const crlf = lf.replace(/\n/g, '\r\n');
    assert.notEqual(crlf, lf, 'PREMISE: the two inputs must actually differ');
    assert.equal(managedDigest(crlf), managedDigest(lf), 'digest must not depend on line endings');
  }
});

test('toLF is idempotent and leaves a lone CR alone', () => {
  // Idempotence is what lets the callers keep normalizing at the read without double-handling.
  // The lone-CR case pins the boundary: the engine's rule is CRLF -> LF, not "delete every CR".
  const mixed = 'a\r\nb\nc\r\n';
  assert.equal(toLF(mixed), 'a\nb\nc\n');
  assert.equal(toLF(toLF(mixed)), toLF(mixed));
  assert.equal(toLF('old\rmac'), 'old\rmac');
});

test('lock coverage: baseline is zero, and a stamped unrecorded file is caught', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));

  // BASELINE, printed before the treatment is read: a control that cannot show its baseline
  // cannot be distinguished from one that is not running.
  const baseline = verifyLockCoverage(lock);
  assert.deepEqual(baseline, [], `expected clean baseline, got ${JSON.stringify(baseline)}`);

  const dir = path.join(ROOT, '.github/skills/__coverage_probe__');
  const file = path.join(dir, 'SKILL.md');
  const stamp = '<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->';
  try {
    fs.mkdirSync(dir, { recursive: true });

    // Treatment A: stamped and unrecorded -> engine-written but not in the lock. Must fire.
    fs.writeFileSync(file, `${stamp}\n\n# probe\n`);
    const stamped = verifyLockCoverage(lock);
    assert.equal(stamped.length, 1, 'a stamped unrecorded file must be reported');
    assert.match(stamped[0], /__coverage_probe__/);

    // Treatment B: unrecorded but UNSTAMPED -> indistinguishable from a Finance-authored
    // file without canon's inventory. Must NOT fire. This pins the documented limitation as
    // a deliberate boundary rather than an accident, so narrowing it later is a visible change.
    fs.writeFileSync(file, '# probe\n');
    assert.deepEqual(verifyLockCoverage(lock), [], 'an unstamped file must not be reported');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.deepEqual(verifyLockCoverage(lock), [], 'fixture must be fully removed');
});

test('PREMISE: lock coverage fails loudly if it stops observing managed files', () => {
  // Guards the vacuity of the test above: with an empty lock nothing is recorded, so every
  // stamped file becomes a finding and the premise guard fires. A walk that silently reached
  // no files would return [] here and read exactly like the healthy baseline.
  const findings = verifyLockCoverage({ entries: {} });
  assert.ok(findings.length > 0, 'an empty lock must not read as complete coverage');
});

test('every present managed target still verifies against the lock', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  let regions = 0;
  let whole = 0;
  for (const [entry, metadata] of Object.entries(lock.entries || {})) {
    if (!metadata || !metadata.targetSha256) continue;
    const absolute = path.join(ROOT, entry);
    if (!fs.existsSync(absolute)) continue;
    const text = fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(managedDigest(text), metadata.targetSha256, `digest mismatch for ${entry}`);
    if (managedRegion(text) === null) whole += 1;
    else regions += 1;
  }
  // Guards the premise of the sweep itself: a corpus with no region entries would make the
  // real-corpus assertion vacuous while still reporting a pass.
  assert.ok(regions > 0, 'corpus contains no marker-managed entry to verify');
  assert.ok(whole > 0, 'corpus contains no whole-file entry to verify');
});

const CANON_STAMP = '<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->';

// Coverage regression guard. The first implementation matched one literal -- HTML comment,
// canon message -- and silently skipped 11 present entries stamped `#`, `/* */`, or with the
// studio "generated + synced" wording. It reported 54 and read as complete.
test('unstampSource recognizes every comment syntax and both messages', () => {
  const forms = [
    ['a.md', CANON_STAMP],
    ['agency.toml', '# synced from jrmoulckers/.github — canonical source; do not edit here'],
    ['t.css', '/* generated + synced from jrmoulckers/studio @jrm/tokens — do not edit here */'],
    ['r.md', '<!-- generated + synced from jrmoulckers/studio @jrm/tokens — do not edit here -->'],
  ];
  for (const [file, stamp] of forms) {
    assert.equal(unstampSource(file, `${stamp}\nbody\n`).status, 'ok', `not recognized: ${stamp}`);
  }
  assert.equal(unstampSource('a.md', '# Local file\nnot synced\n').status, 'no-stamp');
});

// The strip depth is decided by comment family, with frontmatter as an exception inside the
// html family only. An earlier version keyed on frontmatter alone and scored 55 of 65 by
// being right about `.md` and accidentally right elsewhere.
test('unstampSource strips the depth the engine injected, per family', () => {
  const cases = [
    ['x.md', `${CANON_STAMP}\n\nbody\n`, 'body\n'],
    ['x.md', `---\ntitle: t\n---\n${CANON_STAMP}\nbody\n`, '---\ntitle: t\n---\nbody\n'],
    ['x.toml', '# synced from jrmoulckers/.github — x\nbody\n', 'body\n'],
    ['x.css', '/* generated + synced from jrmoulckers/studio — x */\nbody\n', 'body\n'],
  ];
  for (const [file, delivered, expected] of cases) {
    assert.equal(unstampSource(file, delivered).body, expected, `wrong strip for ${file}`);
  }
});

// A stamped file whose extension is unclassified must be reported, never skipped. Skipping
// shrinks the denominator with nothing saying so -- the silent-channel defect this tool has
// already corrected twice.
test('an unclassified stamped file is surfaced rather than skipped', () => {
  assert.equal(unstampSource('weird.xyz', `${CANON_STAMP}\nbody\n`).status, 'unknown');
  assert.equal(commentFamily('weird.xyz'), null);
  assert.equal(commentFamily('.gitattributes'), 'hash', 'a dotfile is its own extension');
});

// The assertion the tool previously called impossible. The original measurement hashed each
// file AS DELIVERED and matched 0 of 65 -- which could not have come out otherwise, since
// sourceSha256 hashes canon before the stamp exists. That control is pinned below.
test('managed targets unstamp to their recorded canon source', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  let reproduced = 0;
  let asDelivered = 0;
  let corruptedReproduced = 0;
  const families = new Set();
  for (const [entry, metadata] of Object.entries(lock.entries || {})) {
    if (!metadata || !metadata.sourceSha256) continue;
    const absolute = path.join(ROOT, entry);
    if (!fs.existsSync(absolute)) continue;
    const text = fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
    if (managedRegion(text) !== null) continue;
    const source = unstampSource(entry, text);
    if (source.status !== 'ok') continue;
    families.add(commentFamily(entry));
    if (sha(source.body) === metadata.sourceSha256) reproduced += 1;
    if (sha(text) === metadata.sourceSha256) asDelivered += 1;
    // Corruption control: an edited body must not reproduce. Without this the strip could be
    // accepting far more than it should and still count 64.
    const corrupted = unstampSource(entry, `${text}\n/* edited */\n`);
    if (corrupted.status === 'ok' && sha(corrupted.body) === metadata.sourceSha256) {
      corruptedReproduced += 1;
    }
  }
  assert.ok(reproduced > 0, 'corpus contains no stamped entry to verify');
  assert.equal(asDelivered, 0, 'delivered form should never match a pre-stamp hash');
  assert.equal(corruptedReproduced, 0, 'a corrupted body must not reproduce');
  // Breadth guard: a corpus exercising one family would certify the switch on a third of it.
  // #4296: this read `>= 2` under a comment naming thirds. Derived from the family sets so the
  // bound moves if a fourth family is ever added, instead of silently admitting a narrower corpus.
  assert.equal(
    families.size,
    FAMILY_SETS.length,
    `switch exercised on only ${families.size} of ${FAMILY_SETS.length} comment families`,
  );
});

test('every recorded source is accounted for, not silently excluded', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  // The denominator is now every recorded entry, not just those carrying a sourceSha256.
  // Filtering the denominator by the same predicate the function skips on made the law
  // unable to see that skip at all -- it cancelled on both sides (#4207).
  const recorded = Object.keys(lock.entries || {}).length;
  const result = verifySourceReproduction(lock);
  const accounted =
    result.reproduced +
    result.unreproduced.length +
    result.knownUnreproduced.length +
    result.unobserved.length +
    result.unstated.length;
  // Conservation law rather than a scan for today's instance. The defect it pins (#4197) was
  // an early `continue` that dropped absent targets, which shrank the denominator with
  // nothing in the output saying so -- the printed ratio then read as coverage of everything
  // recorded. Any future exclusion, on any axis, breaks this equality instead of quietly
  // producing a smaller and more flattering number.
  assert.equal(
    accounted,
    recorded,
    `${recorded - accounted} recorded sources fell out of the accounting`,
  );
  assert.ok(recorded > 0, 'lock records no source hashes; conservation would be vacuous');
});

// --- #4209: an unreproducible source must reach the verdict, and the one pinned exemption
// must not generalise to a class, to a different corruption, or to its own obsolescence.

const REAL_LOCK = () =>
  JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));

// A lock holding exactly one entry, over a file that really exists on disk, so the walk
// reaches it and the digest is computed from delivered bytes rather than from a fixture.
const lockOf = (entry, metadata) => ({ entries: { [entry]: metadata } });

const KNOWN_ENTRY = Object.keys(KNOWN_UNREPRODUCED)[0];

test('the known-unreproducible entry is tolerated, and is the only one', () => {
  const result = verifySourceReproduction(REAL_LOCK());
  assert.deepEqual(
    result.knownUnreproduced,
    [KNOWN_ENTRY],
    'the pinned exemption should absorb exactly the entry it names',
  );
  assert.deepEqual(
    result.unreproduced,
    [],
    'no other entry should be failing to reproduce right now',
  );
  assert.deepEqual(result.findings, [], 'a tolerated known entry must not fail --strict');
  // Without this the test passes just as well on a walk that observed nothing at all.
  assert.ok(result.reproduced > 0, 'nothing reproduced; the check is not observing');
});

test('an unreproducible entry that is not the pinned one is a blocking finding', () => {
  // Take a healthy entry and corrupt only its recorded hash: the bytes are untouched and
  // real, so this is precisely "delivered bytes disagree with the record" and nothing else.
  const real = REAL_LOCK();
  const healthy = Object.entries(real.entries).find(
    ([entry, m]) =>
      entry !== KNOWN_ENTRY &&
      m &&
      m.sourceSha256 &&
      fs.existsSync(path.join(ROOT, entry)) &&
      verifySourceReproduction(lockOf(entry, m)).reproduced === 1,
  );
  assert.ok(healthy, 'no reproducing entry available to corrupt; the premise is gone');
  const [entry, metadata] = healthy;
  const result = verifySourceReproduction(
    lockOf(entry, { ...metadata, sourceSha256: 'f'.repeat(64) }),
  );
  assert.equal(result.unreproduced.length, 1);
  assert.equal(result.knownUnreproduced.length, 0, 'the exemption must not generalise');
  assert.ok(
    result.findings.some((f) => f.includes(entry) && f.includes('do not reproduce')),
    `expected a blocking finding for ${entry}, got ${JSON.stringify(result.findings)}`,
  );
});

test('the exemption is pinned to both hashes, so a second corruption is not inherited', () => {
  // Same path, same real bytes, but a recorded hash that is neither correct nor the one the
  // exemption names. Path-only pinning would swallow this; that is the mutant it kills.
  const result = verifySourceReproduction(
    lockOf(KNOWN_ENTRY, {
      ...REAL_LOCK().entries[KNOWN_ENTRY],
      sourceSha256: 'a'.repeat(64),
    }),
  );
  assert.equal(result.knownUnreproduced.length, 0, 'exemption matched a state it does not name');
  assert.equal(result.unreproduced.length, 1);
  assert.ok(result.findings.some((f) => f.includes('do not reproduce')));
});

test('the exemption self-liquidates: it is a finding once the entry reproduces again', () => {
  // The repaired future. `reproduces` is what the delivered bytes actually unstamp to, so
  // recording it is exactly what a sync run re-rendering this target would write.
  const result = verifySourceReproduction(
    lockOf(KNOWN_ENTRY, {
      ...REAL_LOCK().entries[KNOWN_ENTRY],
      sourceSha256: KNOWN_UNREPRODUCED[KNOWN_ENTRY].reproduces,
    }),
  );
  assert.equal(result.reproduced, 1, 'the repaired state should reproduce');
  assert.ok(
    result.findings.some((f) => f.includes('stale reproduction exemption')),
    `a tolerance outliving its defect must announce itself, got ${JSON.stringify(result.findings)}`,
  );
});

// --- #4222: the conjunct no test could vary -----------------------------------------------
//
// `exemptionMatches` is a conjunction over two hashes. Both existing tests above vary only the
// RECORDED half, because the digest half is computed from the delivered bytes of the one file
// this repo must not modify. So the mutant that deleted `known.reproduces === digest` left the
// suite 37/37 green -- under a test named "pinned to both hashes". The guard that went unpinned
// was the guard on the file I am forbidden to touch, and the inaccessibility is the reason.
//
// Answering the decision from arguments makes all four quadrants reachable without the bytes.

test('the exemption matches on both hashes, exercised in all four quadrants', () => {
  const known = KNOWN_UNREPRODUCED[KNOWN_ENTRY];
  const other = 'b'.repeat(64);
  assert.notEqual(known.recorded, other, 'PREMISE: the wrong value must really differ');
  assert.notEqual(known.reproduces, other, 'PREMISE: the wrong value must really differ');

  assert.equal(
    exemptionMatches(KNOWN_ENTRY, known.recorded, known.reproduces),
    true,
    'the exact pinned state must be absorbed',
  );
  // The quadrant no in-place test could reach: the record still reads as the pinned corruption
  // while the BYTES have become something else. That is a second, different corruption of this
  // path -- exactly what KNOWN_UNREPRODUCED promises not to inherit.
  assert.equal(
    exemptionMatches(KNOWN_ENTRY, known.recorded, other),
    false,
    'a second corruption of the same path must not inherit the exemption',
  );
  assert.equal(
    exemptionMatches(KNOWN_ENTRY, other, known.reproduces),
    false,
    'a record the exemption does not name must not be absorbed',
  );
  assert.equal(exemptionMatches(KNOWN_ENTRY, other, other), false);
});

test('the exemption is pinned to a path, and generalises to none', () => {
  const known = KNOWN_UNREPRODUCED[KNOWN_ENTRY];
  assert.equal(
    exemptionMatches('vendor/@jrm/tokens/js/index.js', known.recorded, known.reproduces),
    false,
    'an unnamed path must not borrow the pinned hashes',
  );
});

test('the disclosure names every path and never collapses to a count', () => {
  // The prose at KNOWN_UNREPRODUCED promises "listing each path means the set cannot grow
  // unnoticed, which is the property a bare count lacks". As a loop inside main() that promise
  // was unreachable by any test, and emptying it left the suite green (#4222).
  //
  // The population is a CONSTRUCTED register, not the live one. Driven from KNOWN_UNREPRODUCED
  // both sides of `lines.length === keys.length` moved together, so the assertion could not fail
  // by that register emptying -- and it is designed to empty, since an exemption register succeeds
  // by draining. The five tests that currently catch an empty register are fixtures built on
  // `Object.keys(KNOWN_UNREPRODUCED)[0]`, so they get repaired in the same edit that drains it:
  // the cover and the covered fail together (#4297).
  const register = {
    'a/first.css': { issue: '#1111' },
    'b/second.md': { issue: '#2222' },
  };
  const built = sourceDisclosureLines(Object.keys(register), register);
  assert.equal(built.length, 2, 'one line per exemption, never a single summarising count');
  for (const [entry, meta] of Object.entries(register)) {
    assert.ok(
      built.some((l) => l.includes(entry) && l.includes(meta.issue)),
      `every exemption must be disclosed by path and issue; ${entry} was not`,
    );
  }
  assert.ok(
    !built.some((l) => /\b2 (exemptions|entries|paths)\b/.test(l)),
    'a count is exactly what this disclosure must not collapse to',
  );

  // The live register too, with its premise stated: it may legitimately be empty, and on that day
  // this arm proves nothing and the constructed arm above is what still holds the property.
  const live = Object.keys(KNOWN_UNREPRODUCED);
  const lines = sourceDisclosureLines(live);
  assert.equal(lines.length, live.length, 'one line per exemption');
  for (const entry of live) {
    assert.ok(
      lines.some((l) => l.includes(entry) && l.includes(KNOWN_UNREPRODUCED[entry].issue)),
      `every exemption must be disclosed by path and issue; ${entry} was not`,
    );
  }
  assert.deepEqual(sourceDisclosureLines([]), [], 'no exemptions discloses nothing, not a zero');
});

// --- #4226: citations that decay in another repository ------------------------------------
//
// Six claims about the engine were pinned by line number. Two had rotted by 11 and 17 lines,
// and nothing here could notice: the file that moved is in a repository this check never reads.
// The claims were still TRUE -- only the coordinates were wrong -- so the durable half is the
// symbol and the fragile half is the offset.
//
// The guard is narrower than the claim on purpose. Whether the engine still behaves as
// described needs the network at check time (#4141, owner-gated). What is checkable offline is
// that no citation reverts to a coordinate and that every registered row is complete.

test('no tracked file cites a file this repository does not own by line number', () => {
  // Was: this one file. The rule now runs over every file that makes a backbone claim, with
  // OWNERSHIP resolved against the walk and the lock, so a self-reference is exempt and a
  // coordinate into a received target is not (#4270, narrowed in #4281).
  const { findings } = validateCitationCoverage();
  assert.deepEqual(
    findings,
    [],
    'a line number in another repo decays silently; cite the symbol instead',
  );
});

test('the coordinate rule catches a citation, including in its own historical record', () => {
  // PREMISE: the pattern must actually fire, or the test above passes vacuously over a rule
  // that matches nothing -- the failure mode this whole exchange keeps producing.
  // The needle is ASSEMBLED rather than written, so this control is not itself a violation once
  // the rule scans every claimant file. The alternative was exempting this file by name, which
  // would have put the rule's own corpus back under a hand-written list (#4270).
  const needle = `lock.mjs:${57}`;
  const findings = citationFindings(`see ${needle} for the hashing rule`);
  assert.equal(findings.length, 1, 'the rule must fire on a bare coordinate');
  assert.ok(findings[0].includes(needle), 'the finding must name the offending citation');
  // And the SHA-pinned form the registry uses must NOT fire, because a measurement fixed at a
  // commit does not decay. This is the distinction the fix rests on, so it is asserted.
  assert.deepEqual(
    citationFindings('at 79faef3a, `hashText` sits at line 68'),
    [],
    'a measurement pinned to a commit is not a decaying citation',
  );
});

test('the citation registry is complete and non-empty', () => {
  assert.deepEqual(citationFindings('', CANON_CITATIONS), [], 'every row needs file, symbol, sha');
  assert.ok(CANON_CITATIONS.length > 0, 'PREMISE: rows exist to be checked');
  const empty = citationFindings('', []);
  assert.ok(
    empty.some((f) => f.includes('not observing')),
    'an empty registry must be a finding, not a clean result',
  );
  const incomplete = citationFindings('', [{ file: 'sync/lib/lock.mjs', symbol: 'hashText' }]);
  assert.ok(
    incomplete.some((f) => f.includes('incomplete')),
    'a row without a verification commit must be reported',
  );
});

test('every registered citation names a symbol this file actually mentions', () => {
  // Otherwise the registry drifts the other way: rows outliving the comments that motivated
  // them, which is the stale-exemption shape (#4190) pointed at documentation.
  const source = fs.readFileSync(path.join(ROOT, 'tools', 'check-ai-manifest.js'), 'utf8');
  for (const row of CANON_CITATIONS) {
    assert.ok(
      source.includes(`\`${row.symbol}\``),
      `CANON_CITATIONS names ${row.symbol}, but no comment in this file cites it`,
    );
  }
});

// --- #4230: the tool's own advertisement was outside every arm it advertises ---------------

// Mirrors scanDoc's normalization so these assertions test the METRIC rules rather than a
// second, divergent copy of the matching logic.
function metricHits(text) {
  const normalized = text.replace(/[*`_]+/g, ' ');
  const hits = [];
  for (const metric of METRICS) {
    metric.regex.lastIndex = 0;
    let match;
    while ((match = metric.regex.exec(normalized)) !== null) {
      hits.push(`${metric.label}=${match[1]}`);
    }
  }
  return hits;
}
//
// `--help` claimed a "23-agent roster" and an "81-entry inventory" as hard-coded literals, in a
// file absent from DOC_FILES, written in a compound-adjective form that matches no METRIC. Three
// independent reasons the count arm could never read the sentence that advertises the count arm.

test('the help text derives its counts instead of transcribing them', () => {
  const claims = [...HELP_TEXT.matchAll(/(\d+)-(agent|entry)/g)];
  assert.equal(claims.length, 2, 'PREMISE: both advertised counts are present to be checked');
  const byNoun = Object.fromEntries(claims.map((c) => [c[2], Number(c[1])]));
  assert.equal(byNoun.agent, EXPECTED_AGENTS.length, 'help agent count must track the roster');
  assert.equal(byNoun.entry, MANAGED_COUNTS.total, 'help entry count must track the lock total');
});

test('a compound-adjective count claim is a claim, not an invisible one', () => {
  // The evasion #4212 named for `twenty-three agents`, in the form a copy editor produces by
  // accident. Both spellings must reach the same metric or the arm certifies text it never read.
  const hyphen = metricHits('the exact 23-agent activated roster');
  const spaced = metricHits('the exact 23 agents activated roster');
  assert.deepEqual(hyphen, ['agents=23'], 'hyphenated form must be detected');
  assert.deepEqual(spaced, ['agents=23'], 'spaced form must still be detected');
});

test('closing the hyphen gap widened matching only where a digit precedes the noun', () => {
  // A separator class is blunt, so the cost is measured rather than assumed. `multi-agent` has
  // no digit and stays prose; `2019-agent-era` newly matches and is the accepted false positive
  // -- a spurious finding a human clears, which is the safe polarity for this arm. `v2 agents`
  // matched under the old `\s+` rule too, so it is not evidence about this change either way.
  assert.deepEqual(metricHits('multi-agent orchestration across the fleet'), []);
  assert.deepEqual(metricHits('agents-of-change tooling'), []);
  assert.deepEqual(metricHits('see the 2019-agent-era notes'), ['agents=2019']);
});

test('the corpus yields the claims it yielded before, not merely more than zero', () => {
  // The existing observation guard asserts claimCount > 0. Changing COUNT_GAP from `\s+` to
  // `[-\s]` dropped AGENTS.md's skills claim -- 4 became 3 -- and every one of 47 tests passed,
  // because a guard armed against the empty corpus is blind at n=3. Pinning the cardinality is
  // what makes a silently narrowed regex fail here instead of in the report nobody re-reads.
  const counts = { agents: 23, skills: 20, instructions: 5, mcpServers: 0, prompts: 8 };
  const total = DOC_FILES.reduce((sum, doc) => sum + scanDoc(doc, counts).findings.length, 0);
  assert.equal(total, 4, 'the declared corpus carries four count claims');
});

// --- #4233: what a green check actually asserts ---------------------------------------------//
// The drift step runs with STRICT: '0'. It prints findings and exits 0, so "AI Manifest Check ✅"
// in the PR list is compatible with drift being present. The workflow discloses this in its own
// comments; the reader deciding to merge sees the check name. Disclosure one click from the
// decision is the same shape as a real disagreement printed above an exit 0 (#4210).

test('the docs describe the enforcement the workflow actually applies', () => {
  const workflow = fs.readFileSync(path.join(ROOT, ENFORCEMENT_WORKFLOW), 'utf8');
  const doc = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  assert.deepEqual(enforcementFindings(workflow, doc), []);
  // PREMISE: the mode was really read, not defaulted. Asserting [] above is satisfied by an
  // unreadable workflow only if driftEnforcement fails open -- it does not, and this pins that.
  assert.equal(driftEnforcement(workflow).mode, 'warn-only', 'drift is warn-only today');
});

test('a renamed or unreadable drift step is a finding, not a clean read', () => {
  assert.ok(driftEnforcement('jobs:\n  steps:\n    - name: Something else\n').error);
  assert.equal(
    driftEnforcement('- name: Check for drift\n  run: node tool.js\n').error !== undefined,
    true,
  );
  const findings = enforcementFindings('- name: Renamed\n', 'AI Manifest Check is warn-only');
  assert.equal(findings.length, 1, 'an unreadable workflow must report, not pass');
  assert.match(findings[0], /cannot read drift enforcement/);
});

test('prose and workflow must move together in both directions', () => {
  const warnOnly = "- name: Check for drift\n  env:\n    STRICT: '0'\n  run: node tool.js\n";
  const blocking = "- name: Check for drift\n  env:\n    STRICT: '1'\n  run: node tool.js\n";
  const saysWarn = 'The AI Manifest Check drift arm is warn-only.';
  const saysNothing = 'The AI Manifest Check workflow validates the roster.';
  assert.deepEqual(enforcementFindings(warnOnly, saysWarn), [], 'agreement is clean');
  assert.deepEqual(enforcementFindings(blocking, saysNothing), [], 'agreement is clean');
  assert.match(enforcementFindings(warnOnly, saysNothing)[0], /do not say the check is warn-only/);
  assert.match(enforcementFindings(blocking, saysWarn)[0], /now blocks/);
});

test('--help reaches this tool, rather than exiting inside a require', () => {
  // HELP_TEXT was unreachable: ai-manifest.js called process.exit(0) at module scope whenever
  // --help appeared in argv, so requiring it killed the process at line 7 and the drift checker
  // printed the GENERATOR's help. No count arm could read the sentence because no one could see
  // it. Asserted by execution, since the defect was in reachability, not content.
  const out = execFileSync(process.execPath, [TOOL, '--help'], { encoding: 'utf8' });
  assert.match(out, /AI Manifest Drift Check/, 'must print this tool, not the generator');
  assert.doesNotMatch(out, /AI Manifest Generator/, 'a required module must not answer --help');
  assert.equal(out, HELP_TEXT, 'the printed help is the constant the derivation test pins');
});

test('an entry stating no source hash is named rather than silently skipped', () => {
  // #4207. The population is 0 in the real lock, so this is the only place the bucket can
  // be exercised non-vacuously -- and an unexercised partition proves nothing.
  const result = verifySourceReproduction(lockOf('AGENTS.md', { targetSha256: 'x'.repeat(64) }));
  assert.deepEqual(result.unstated, ['AGENTS.md']);
  assert.equal(
    result.reproduced + result.unreproduced.length + result.unobserved.length,
    0,
    'the entry must land in exactly one bucket',
  );
  assert.ok(
    result.findings.every((f) => !f.includes('accounting lost')),
    'conservation must hold with the entry accounted for',
  );
});

// --- #4212: the count-claim arm must not certify a corpus it did not read ---------------------
//
// The success line asserts "counts ... are consistent". It was gated on zero DRIFTED claims, and
// zero drifted is byte-identical to zero INSPECTED. Rewriting `**23** agents` as `twenty-three
// agents` retires the claim, matches no METRIC, leaves AGENTS.md's managed region untouched, and
// the tool exits 0 having read no claim at all. These pin the judgement rather than the printout.

test('an empty claim set is a finding, not a clean result', () => {
  const findings = countCoverageFindings({ claimCount: 0, missing: [] });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /not observing/);
});

test('a missing declared document is a finding, not a printed skip', () => {
  const findings = countCoverageFindings({ claimCount: 4, missing: ['docs/INDEX.md'] });
  assert.deepEqual(findings, ['count-claim document is missing: docs/INDEX.md']);
});

test('every declared document missing reports absence AND non-observation', () => {
  const findings = countCoverageFindings({ claimCount: 0, missing: [...DOC_FILES] });
  // Both axes must be named: which documents vanished, and that nothing was measured. Reporting
  // only the absences would leave the reader to infer the second, which is the inference this
  // whole issue is about.
  assert.equal(findings.length, DOC_FILES.length + 1);
  assert.match(findings.at(-1), /not observing/);
});

test('claims present with nothing missing yields no finding', () => {
  assert.deepEqual(countCoverageFindings({ claimCount: 1, missing: [] }), []);
});

test('a document present but contributing no claims is inert, not missing', () => {
  // docs/INDEX.md is in this state today. It must not fail the build, and it must not be
  // silently folded into the inspected count as though it had contributed something.
  const scan = scanDocs({ agents: 0, skills: 0, instructions: 0, mcpServers: 0 }, [
    'docs/INDEX.md',
  ]);
  assert.deepEqual(scan.missing, []);
  assert.deepEqual(scan.inert, ['docs/INDEX.md']);
  assert.equal(scan.inspected, 1);
});

test('the declared corpus is really observing right now', () => {
  // The premise the guard rests on: this repo's documents do carry count claims. If this test
  // ever fails, the guard above is the thing that stopped the tool certifying nothing.
  const counts = { agents: 23, skills: 20, instructions: 14, mcpServers: 7 };
  const scan = scanDocs(counts);
  assert.deepEqual(scan.missing, []);
  assert.ok(scan.claims.length > 0, 'declared corpus matched no count claims');
  assert.deepEqual(scan.findings, []);
});

test('a retired claim is detected as non-observation, not as agreement', () => {
  // The reproduction itself, at the seam: a document whose claims no longer match any METRIC
  // yields the same empty set as a document with no drift. Only the guard separates them.
  const real = scanDocs({ agents: 23, skills: 20, instructions: 14, mcpServers: 7 });
  const retired = scanDocs({ agents: 23, skills: 20, instructions: 14, mcpServers: 7 }, [
    'docs/INDEX.md',
  ]);
  assert.ok(real.claims.length > 0);
  assert.equal(retired.claims.length, 0);
  assert.deepEqual(real.findings, []);
  assert.match(retired.findings.join('\n'), /not observing/);
});

test('scanDoc reports absence rather than throwing', () => {
  const result = scanDoc('docs/does-not-exist-4212.md', { agents: 0 });
  assert.equal(result.missing, true);
  assert.deepEqual(result.findings, []);
});
test('inspected counts documents actually read, not documents declared', () => {
  // Mutation D survived the first harness: `inspected` is printed in the passing summary and no
  // test constrained it, so it could have reported the declared total while a document was
  // absent -- a number in the report that nothing measures, which is the defect this issue is
  // about, one level up in the fix for it.
  const scan = scanDocs({ agents: 23, skills: 20, instructions: 14, mcpServers: 7 }, [
    'docs/INDEX.md',
    'docs/does-not-exist-4212.md',
  ]);
  assert.deepEqual(scan.missing, ['docs/does-not-exist-4212.md']);
  assert.equal(scan.declared, 2);
  assert.equal(scan.inspected, 1);
});

// --- #4217: the walk must reach the population the claim covers -------------------------------
//
// verifyLockCoverage claims something repo-wide -- no stamped file anywhere is missing from the
// lock -- while deriving its walk roots FROM the lock. So a stamped file could only be found in a
// directory the lock already mentioned, and an unrecorded engine write is by definition the case
// where it does not. 14 of 16 top-level directories were never entered, and the three root-level
// managed files were structurally unreachable via `top !== entry`.
//
// Nothing asked, because the numerator was large: 65 stamped files reads as thorough. A zero
// invites the question a 65 closes.

test('the walk reaches every recorded target that exists on disk', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  const coverage = lockCoverage(lock);
  // Before #4217 this was 65 of 68: .gitattributes, AGENTS.md and agency.toml sit at the repo
  // root, and `if (top && top !== entry)` excluded exactly the entries with no directory part.
  assert.equal(
    coverage.visitedRecorded,
    coverage.recordedPresent,
    'every recorded target present on disk must be visited by the walk',
  );
  assert.ok(coverage.recordedPresent > 0, 'PREMISE: some recorded target exists on disk');
});

test('a recorded target the walk cannot reach is reported as unvisited', () => {
  // DISCLOSURE: the test above asserts the conservation property but does not exercise the
  // guard -- today every recorded target IS visited, so disabling the guard changed nothing and
  // the mutant survived. A property that happens to hold is not a pinned guard. This constructs
  // the state the guard exists for: a recorded entry that is present on disk and structurally
  // outside the walk, by putting it behind a WALK_SKIP directory.
  // Must be a real directory: in a git worktree `.git` is a FILE, so existsSync alone picks a
  // name that cannot hold a probe. The predicate has to match the thing the walk skips.
  const skipped = [...WALK_SKIP].find((name) => {
    const candidate = path.join(ROOT, name);
    return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
  });
  assert.ok(skipped, 'PREMISE: at least one excluded directory exists to hide a file behind');
  const rel = `${skipped}/__unvisited_probe_4217__.md`;
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  try {
    // Deliberately unstamped: the finding under test is about reach, not about provenance.
    fs.writeFileSync(path.join(ROOT, rel), '# probe\n');
    lock.entries[rel] = { sourceSha256: 'x', targetSha256: 'y', syncedAt: '1970-01-01T00:00:00Z' };
    const coverage = lockCoverage(lock);
    assert.ok(
      coverage.findings.some((f) => f.includes('never visited') && f.includes(rel)),
      `an unreachable recorded target must be named; got ${JSON.stringify(coverage.findings.slice(0, 3))}`,
    );
    assert.ok(
      coverage.visitedRecorded < coverage.recordedPresent,
      'the reported numerator must fall short of the population it claims to cover',
    );
  } finally {
    fs.rmSync(path.join(ROOT, rel), { force: true });
  }
});

test('root-level managed files are inside the walk', () => {
  // The three that were unreachable. Named individually rather than counted, so that losing one
  // is a failure rather than a smaller number.
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  const rootLevel = Object.keys(lock.entries).filter((entry) => !entry.includes('/'));
  assert.ok(rootLevel.length > 0, 'PREMISE: the lock records root-level entries');
  const stray = path.join(ROOT, '__coverage_root_probe_4217__.md');
  try {
    fs.writeFileSync(
      stray,
      '<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->\n\n# probe\n',
    );
    const findings = verifyLockCoverage(lock);
    assert.ok(
      findings.some((f) => f.includes('__coverage_root_probe_4217__')),
      `a stamped file at the repo root must be reported; got ${JSON.stringify(findings.slice(0, 3))}`,
    );
  } finally {
    fs.rmSync(stray, { force: true });
  }
  assert.deepEqual(verifyLockCoverage(lock), [], 'probe must leave no residue');
});

test('a stamped file in a directory the lock never mentions is caught', () => {
  // The defect itself. `apps/` holds no lock entry, so the old lock-derived roots could not
  // reach it -- and `apps/web/vendor/@jrm/tokens` is where this repo's tokens actually lived
  // until the repo-root migration, so a regressed delivery lands exactly here.
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  assert.ok(
    !Object.keys(lock.entries).some((entry) => entry.startsWith('apps/')),
    'PREMISE: no lock entry lives under apps/, so only a repo-wide walk reaches it',
  );
  const dir = path.join(ROOT, 'apps', '__coverage_probe_4217__');
  const file = path.join(dir, 'stray.css');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      file,
      '/* generated + synced from jrmoulckers/studio @jrm/tokens — do not edit here */\n\na{}\n',
    );
    const findings = verifyLockCoverage(lock);
    assert.ok(
      findings.some((f) => f.includes('__coverage_probe_4217__')),
      `a stamped file under apps/ must be reported; got ${JSON.stringify(findings.slice(0, 3))}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(verifyLockCoverage(lock), [], 'probe must leave no residue');
});

test('the prescreen is implied by the pattern, not an independent guess', () => {
  // The prescreen exists for cost: without it the repo-wide walk runs a multiline regex over
  // ~44 MB. A filter is exactly what hid the token corpus for the life of this check (#4204),
  // so it is admissible ONLY because every string the regex accepts contains the literal. This
  // asserts that relation over all delivered stamp forms rather than trusting the reading.
  const delivered = [
    '<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->',
    '/* generated + synced from jrmoulckers/studio @jrm/tokens — do not edit here */',
    '# synced from jrmoulckers/.github — canonical source; do not edit here',
    '<!-- generated + synced from jrmoulckers/studio — do not edit here -->',
  ];
  for (const stamp of delivered) {
    assert.ok(PROVENANCE_LINE.test(stamp), `PREMISE: pattern must accept ${stamp.slice(0, 24)}`);
    assert.ok(
      stamp.includes(PROVENANCE_HINT),
      `prescreen would reject a stamp the pattern accepts: ${stamp}`,
    );
  }
  // And the relation must hold structurally, not only on these four samples.
  assert.ok(
    PROVENANCE_LINE.source.includes('synced from jrmoulckers'),
    'the pattern must mandate the prescreen literal',
  );
});

test('the walk names its exclusions rather than dropping them silently', () => {
  // WALK_SKIP is a filter over the walked population and therefore has to be stated. This does
  // not assert the list is correct -- it asserts it is finite, declared, and cannot quietly
  // grow to include a directory the engine delivers into.
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  const tops = new Set(
    Object.keys(lock.entries)
      .map((entry) => entry.split('/')[0])
      .filter((top) => top),
  );
  for (const skipped of WALK_SKIP) {
    assert.ok(
      !tops.has(skipped),
      `WALK_SKIP excludes a directory the lock delivers into: ${skipped}`,
    );
  }
});

test('the report states CI enforcement, not just this invocation mode (#4233)', () => {
  // The whole finding is that the deciding reader never opens the workflow. Asserting the constant
  // would repeat #4230's vacuous test, so this asserts by execution.
  const out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
  assert.match(
    out,
    /CI drift enforcement \(\.github\/workflows\/ai-manifest-check\.yml\): warn-only/,
  );
  assert.ok(
    out.indexOf('CI drift enforcement') < out.indexOf('Canonical runtime activation:'),
    'enforcement disclosure must precede the verdict it qualifies',
  );
});

// --- #4251: a path-filtered check cannot fire on the files outside its filter ------------
//
// An edit outside `on.pull_request.paths` produces no run, which renders as an ABSENT check in
// the PR list rather than a failing one. The self-referential case is the sharp one and it is
// why this exists: `enforcementFindings` reads the workflow to catch prose/workflow
// disagreement, so a workflow-only edit is exactly what that guard is for and exactly what
// cannot trigger it.

test('an unreadable trigger is an error, never an empty glob list (#4251)', () => {
  // Failing closed matters more here than elsewhere: an empty list would make triggerCovers
  // return false for everything, which reads as "total coverage gap" rather than "unknown",
  // while a silently-empty parse would read as "nothing excluded". Both are wrong; error is not.
  assert.ok('error' in triggerPaths('name: x\non:\n  workflow_dispatch:\n'));
  assert.ok('error' in triggerPaths('on:\n  pull_request:\n    branches: [main]\n'));
  assert.ok('error' in triggerPaths('on:\n  pull_request:\n    paths:\n'));
  const ok = triggerPaths("on:\n  pull_request:\n    paths:\n      - 'AGENTS.md'\n");
  assert.deepEqual(ok.globs, ['AGENTS.md']);
});

test('trigger globs cover a subtree only via /** (#4251)', () => {
  const globs = ['.github/agents/**', 'AGENTS.md'];
  assert.equal(triggerCovers(globs, '.github/agents/architect.agent.md'), true);
  assert.equal(triggerCovers(globs, 'AGENTS.md'), true);
  // A prefix match without the separator would wrongly cover a sibling directory.
  assert.equal(triggerCovers(globs, '.github/agents-extra/x.md'), false);
  assert.equal(triggerCovers(globs, 'vendor/@jrm/tokens/css/default/tokens.css'), false);
  assert.equal(triggerCovers(globs, 'AGENTS.md.bak'), false);
});

test('the workflow this check reads must be able to trigger it (#4251)', () => {
  const covering =
    "on:\n  pull_request:\n    paths:\n      - '.github/workflows/ai-manifest-check.yml'\n" +
    "      - '.studio-sync.lock.json'\n";
  assert.deepEqual(
    triggerFindings(covering, checkInputs([], [])),
    [],
    'fully covered inputs are not a finding',
  );

  const blind = "on:\n  pull_request:\n    paths:\n      - 'AGENTS.md'\n";
  const findings = triggerFindings(blind, checkInputs([], []));
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => f.includes(ENFORCEMENT_WORKFLOW)));
  assert.ok(findings.some((f) => f.includes(SYNC_LOCK)));
});

test('uncovered managed entries are counted against the whole population (#4251)', () => {
  const globs =
    "on:\n  pull_request:\n    paths:\n      - '.github/workflows/ai-manifest-check.yml'\n" +
    "      - '.studio-sync.lock.json'\n      - '.github/agents/**'\n";
  const keys = ['.github/agents/a.md', 'vendor/@jrm/tokens/x.css', 'agency.toml'];
  const findings = triggerFindings(globs, checkInputs(keys, []));
  assert.equal(findings.length, 1);
  // The denominator is the point: "2 uncovered" alone cannot be read without the population.
  assert.match(findings[0], /2 of 3 managed entry path\(s\)/);
  assert.match(findings[0], /vendor\/@jrm/);
  assert.deepEqual(triggerFindings(globs, checkInputs(['.github/agents/a.md'], [])), []);
});

// --- #4256: a premise guard must live where a mutation can be seen -------------------------
//
// The suite asserts `unstampSource` across comment families and the walk across nesting depths.
// Both are only as strong as the recorded corpus, and the inline `assert.ok(x.length > 0)`
// premises that were supposed to protect them cannot: weakening `> 0` to `>= 0` is invisible to
// the same suite that contains the assertion. Measured on df65452a -- five such premises, all
// surviving at 0 failures. So the judgement moved into production, where these tests can
// construct the degenerate states instead of waiting for them.

test('an empty corpus is reported rather than passing vacuously (#4256)', () => {
  assert.deepEqual(corpusBreadth({}), [
    'lock records no entries; every corpus assertion is vacuous',
  ]);
  assert.equal(corpusBreadth({ entries: {} }).length, 1);
  assert.equal(corpusBreadth(null).length, 1, 'a missing lock is not a broad corpus');
});

test('a single-family corpus cannot certify the unstamp switch (#4256)', () => {
  const oneFamily = corpusBreadth({ entries: { 'AGENTS.md': {}, 'docs/x.md': {} } });
  assert.equal(oneFamily.length, 1);
  assert.match(oneFamily[0], /1 of 3 comment families/);
  // #4296: this line read `Two families clears the floor` and asserted []. It was true under a
  // floor of 2 and it is the defect written down as expected behaviour -- the prose named the
  // three-way switch while the assertion certified two thirds of it. Two families is now a
  // finding, and only a corpus exercising all three is silent.
  const twoFamilies = corpusBreadth({ entries: { 'AGENTS.md': {}, 'agency.toml': {} } });
  assert.equal(twoFamilies.length, 1, 'two of three families is a narrowed corpus');
  assert.match(twoFamilies[0], /2 of 3 comment families/);
  assert.deepEqual(
    corpusBreadth({ entries: { 'AGENTS.md': {}, 'agency.toml': {}, 'x.js': {} } }),
    [],
    'all three families with a root-level entry is the only silent case',
  );
});

test('a corpus with no root-level entry is reported (#4256)', () => {
  // Every family is present so the family arm stays silent and this isolates the depth arm --
  // the old fixture was itself a 2-of-3 corpus, which the corrected floor now reports (#4296).
  const nested = corpusBreadth({ entries: { 'x/a.md': {}, 'x/b.toml': {}, 'x/c.js': {} } });
  assert.equal(nested.length, 1);
  assert.match(nested[0], /no root-level entries/);
});

test('the real corpus clears the floor, and the floor is not zero (#4256)', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, SYNC_LOCK), 'utf8'));
  assert.deepEqual(
    corpusBreadth(lock),
    [],
    'the recorded corpus should support its own assertions',
  );
  // #4296: this was `>= 2` against a message naming a three-way switch, and it passed. An
  // inequality restating a constant cannot notice that the constant is wrong -- so assert the
  // derivation instead. The floor is the family count or the guard admits a corpus missing a
  // family, which is the exact narrowing it exists to report.
  assert.equal(
    BREADTH_FLOOR.families,
    FAMILY_SETS.length,
    'the floor must be the number of comment families, not a restatement of one',
  );
  assert.ok(BREADTH_FLOOR.rootLevel >= 1);
});

test('dropping any whole comment family is reported (#4296)', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, SYNC_LOCK), 'utf8'));
  const entries = Object.keys(lock.entries ?? {});
  const families = [...new Set(entries.map(commentFamily).filter((family) => family !== null))];
  // PREMISE: the recorded corpus exercises every family, so each drop is a real narrowing.
  assert.equal(families.length, FAMILY_SETS.length, 'PREMISE: the corpus covers every family');

  for (const dropped of families) {
    const kept = entries.filter((entry) => commentFamily(entry) !== dropped);
    const findings = corpusBreadth({
      entries: Object.fromEntries(kept.map((entry) => [entry, {}])),
    });
    // Under the old floor of 2 every one of these returned []. That is the whole defect: a
    // corpus certifying two thirds of a three-way switch was indistinguishable from a whole one.
    assert.equal(findings.length, 1, `dropping '${dropped}' must be reported, not tolerated`);
    assert.match(findings[0], /comment families/);
  }
});

test('validateSyncLock still reports a degenerate corpus (#4256)', () => {
  // Pins the wiring, not the guard: with the recorded lock the guard is silent, so unwiring it
  // from validateSyncLock is invisible unless a test supplies a corpus that should be reported.
  const nested = validateSyncLock({
    version: 1,
    backbone: 'jrmoulckers/.github',
    entries: { 'x/a.md': {} },
  });
  assert.ok(
    nested.some((finding) => /no root-level entries/.test(finding)),
    'the breadth guard must reach the verdict, not just exist',
  );
  assert.ok(
    validateSyncLock({ version: 1, backbone: 'jrmoulckers/.github', entries: {} }).some((finding) =>
      /every corpus assertion is vacuous/.test(finding),
    ),
  );
});

// --- #4264: an operand is not pinned just because its expression is -----------------------
//
// Every two-operand conjunction in the tool was mutated one operand at a time. Most died, but
// the `--strict` term died in NEITHER expression that mentions it, and `commentFamily`'s
// second operand died in neither direction. An expression can be well covered while one of its
// terms is carried entirely by the other.

test('the drift step is read as blocking via the --strict flag, not only via STRICT (#4264)', () => {
  const step = (run, env) =>
    ['      - name: Check for drift (informational)', env, `        run: ${run}`]
      .filter(Boolean)
      .join('\n');
  const env0 = "        env:\n          STRICT: '0'";

  // The flag alone must read as blocking. Dropping the flag term from the `blocking` disjunction
  // reports warn-only for a step that genuinely fails the build -- #4233 inside its own fix.
  assert.deepEqual(driftEnforcement(step('node tools/check-ai-manifest.js --strict', null)), {
    mode: 'blocking',
  });
  // The flag must also win over a STRICT that says otherwise: the process exits non-zero.
  assert.deepEqual(driftEnforcement(step('node tools/check-ai-manifest.js --strict', env0)), {
    mode: 'blocking',
  });
  // And the flag alone must not read as "declares neither" -- the other unpinned mention.
  assert.deepEqual(driftEnforcement(step('node tools/check-ai-manifest.js', env0)), {
    mode: 'warn-only',
  });
  const neither = driftEnforcement(step('node tools/check-ai-manifest.js', null));
  assert.match(neither.error, /declares neither/, 'a step declaring no mode fails closed');
});

test('a dotfile carrying a real extension is classified by that extension (#4264)', () => {
  // `.prettierrc.yml` is hash-commented; classifying the whole basename as the extension loses
  // it. 54 of 144 synthetic paths change family when this operand is dropped.
  assert.equal(commentFamily('a/.prettierrc.yml'), 'hash');
  assert.equal(commentFamily('.gitattributes.md'), 'html');
  // The recorded shape still holds: a dotfile with no further dot IS its own extension.
  assert.equal(commentFamily('.gitattributes'), 'hash');
  assert.equal(commentFamily('x/AGENTS.md'), 'html');
});

test('every classified extension starts with a dot, which is why the first operand is dead (#4264)', () => {
  // DISCLOSURE: dropping `base.startsWith('.')` produced 0 differences across 144 synthetic
  // paths -- an equivalent mutant, unpinnable because it currently decides nothing. It is dead
  // only while every classified extension is dot-led, so that invariant is what gets pinned.
  // Add an extension-less name (`Caddyfile`) to any family and this test fires, which is the
  // signal that the operand has become load-bearing and now needs a behavioural test.
  // The premise is stated PER FAMILY, not over the union. `[...A, ...B, ...C].length > 0` is
  // satisfied while any one family is empty, so it cannot see a member go to zero and the
  // invariant silently stops covering it. Measured: emptying each family in turn left this test
  // green 3 of 3, and the state was caught only by bystanders (#4297). Non-emptiness of a family
  // is a corpus fact, so this asserts only that each family HAS members -- never which ones.
  const families = {
    HASH_EXTENSIONS,
    BLOCK_EXTENSIONS,
    HTML_EXTENSIONS,
  };
  for (const [name, family] of Object.entries(families)) {
    assert.ok(family.size > 0, `PREMISE: ${name} must be non-empty or its members go unchecked`);
  }
  const all = [...HASH_EXTENSIONS, ...BLOCK_EXTENSIONS, ...HTML_EXTENSIONS];
  assert.ok(all.length > 0);
  for (const extension of all) {
    assert.ok(
      extension.startsWith('.'),
      `${extension} is not dot-led; the dead operand is now live`,
    );
  }
});

// --- #4270: a prohibition whose expected answer is zero cannot report its own blindness ------
//
// The coordinate rule had two independent narrowings, and a clean zero from both:
//
//   pattern   /\b[a-z][a-z0-9-]*\.mjs:\d+/   vs. 81 delivered entries -- overlap NONE
//   corpus    1 file, named as a literal here  vs. 72 files making backbone claims -- 1.4%
//
// Live violations found after widening both: ZERO. So the corpus was never stale and there is
// nothing to correct. That is luck, not hygiene: the instrument that would have said otherwise
// was blind in two directions at once, and on a prohibition a zero reads as compliance.

// Needles are ASSEMBLED, never written: this file is itself in the scanned corpus now, so a
// literal coordinate here would be a violation of the rule these tests pin (#4270).
const at = (file, line) => `${file}:${line}`;

test('the coordinate rule sees the extensions this repo is actually sent (#4270)', () => {
  // Every one of these is a file type the backbone DELIVERS here, so it is exactly the class
  // that moves under this repo without warning. The old `.mjs`-only pattern matched none.
  for (const needle of [
    at('AGENTS.md', 120),
    at('agency.toml', '14'),
    at('JrmTokens.kt', '12-34'),
    at('a/b.css', 9),
  ]) {
    const findings = citationFindings(`see ${needle} for the rule`);
    assert.equal(findings.length, 1, `the rule must fire on ${needle}`);
    assert.ok(findings[0].includes(needle), 'the finding must name the offending citation');
  }
  // And the SHA-pinned form still must not fire, or widening bought coverage with false alarms.
  assert.deepEqual(citationFindings('at 79faef3a, `hashText` sits at line 68'), []);
  assert.deepEqual(citationFindings('bumped to 1.2.3 in the manifest'), []);
});

test('a self-reference is exempt because it moves with the edit that moves it (#4270)', () => {
  const local = (cited) => cited === 'tools/check-ai-manifest.js';
  assert.deepEqual(
    citationFindings(`see ${at('tools/check-ai-manifest.js', 44)}`, CANON_CITATIONS, local),
    [],
    'a coordinate into this repo is refactored by the same commit; it does not decay',
  );
  const cross = citationFindings(`see ${at('sync/lib/copier.mjs', 410)}`, CANON_CITATIONS, local);
  assert.equal(cross.length, 1, 'a coordinate into another repository must still be reported');
});

test('the scanned population is derived from the surface, not narrowed to a sample (#4270)', () => {
  // The one-line fix -- widen the pattern -- leaves the corpus free to shrink to anything
  // non-empty, which is the guard shape that is indistinguishable from no guard. So the
  // population is cross-checked against an INDEPENDENT enumeration: git's index, not the walk.
  //
  // "Independent" now means it shares NO NARROWING with the walk, not merely a different
  // directory source. This filter used to apply the walk's own CITATION_TEXT, so narrowing that
  // constant shrank both sides together and this assertion still passed: `/\.mdx?$/` dropped 8
  // real claimants, left 64 -- above the floor -- and the suite stayed green (#4300). Only the
  // claim predicate is shared now, because that predicate IS the rule: a claimant is a file that
  // mentions the backbone. Everything else here is a property of the bytes.
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const expected = tracked.filter((relPath) => {
    // Same single-descriptor discipline as the production walk: stat-then-read is a TOCTOU race.
    let fd;
    try {
      fd = fs.openSync(path.join(ROOT, relPath), 'r');
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_CITATION_BYTES) return false;
      const buf = fs.readFileSync(fd);
      if (buf.includes(0)) return false;
      return BACKBONE_CLAIM.test(buf.toString('utf8'));
    } catch {
      return false;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  });
  const scanned = new Set(citationCorpus().map((entry) => entry.path));
  // unsourced-bound: nothing commits to how many files claim a citation; the number tracks the
  // repo's prose and moves with every doc edit. 5 says only "more than a handful" (#4296).
  assert.ok(expected.length > 5, 'PREMISE: git sees a non-trivial claimant population');
  for (const relPath of expected) {
    assert.ok(scanned.has(relPath), `citationCorpus omits a claimant file: ${relPath}`);
  }
  // The extension-less claimant the old allowlist reached only by a hand-cased exception. Named
  // because it is the one file proving the gate is not an extension list; if it stops making a
  // backbone claim this premise fails rather than the coverage assertion silently weakening.
  assert.ok(
    expected.includes('.prettierignore'),
    'PREMISE: an extension-less claimant exists to prove the gate is not an allowlist',
  );
});

test('the gate excludes bytes it cannot read as prose, and only those (#4300)', () => {
  // Dropping the binary check changed no result: nothing binary in this tree happens to carry a
  // backbone claim, so that guard was LATENT -- dead by an impoverished corpus, not by an
  // invariant (.github#880). Pinning "no blob makes a claim" would freeze an accident, so the
  // corpus is enriched instead: three probes with the SAME coordinate and the SAME extension,
  // differing only in the property under test. The text probe is the control that makes the two
  // absences mean something rather than reading as a bare zero.
  //
  // The oversize arm is here for a different reason. Dropping the size check ALSO changed no
  // result -- but it survived this enrichment too, with a real 400001-byte claimant present. That
  // is the diagnostic: a latent guard dies once the corpus can reach it, an equivalent one cannot.
  // The size cap had two implementations and the fstat gate in citationCorpus always decided
  // first, so the second could never fire. It was removed; this arm now mutation-covers the
  // remaining owner.
  const coordinate = at('sync/lib/copier.mjs', 410);
  // Per-process fixture names (#4308). These were fixed names created with `wx` OUTSIDE the try,
  // so a run killed between the writes and the `finally` left them on disk -- and the next run's
  // `wx` write threw EEXIST before entering `try`, meaning the cleanup could never run again. The
  // suite latched red (586/591) until someone deleted the files by hand, and the five failures
  // named citation-ownership rules rather than the stray files. A unique suffix makes the latch
  // structurally impossible: a leaked file cannot collide with a later run.
  const tag = `${process.pid}-${Date.now().toString(36)}`;
  const text = path.join(ROOT, `PROBE-4300-text-${tag}.md`);
  const binary = path.join(ROOT, `PROBE-4300-binary-${tag}.md`);
  const oversize = path.join(ROOT, `PROBE-4300-oversize-${tag}.md`);
  const named = (file) => path.basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    fs.writeFileSync(text, `see ${coordinate}\n`, { flag: 'wx' });
    fs.writeFileSync(
      binary,
      Buffer.concat([Buffer.from(`see ${coordinate}\n`), Buffer.from([0]), Buffer.from('tail\n')]),
      { flag: 'wx' },
    );
    fs.writeFileSync(oversize, `see ${coordinate}\n`.padEnd(MAX_CITATION_BYTES + 1, 'x'), {
      flag: 'wx',
    });
    let out;
    try {
      out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
    } catch (error) {
      out = String(error.stdout || '');
    }
    assert.match(
      out,
      new RegExp(`${named(text)}: cites a file this repository does not own`),
      'CONTROL: the same coordinate in readable prose must be reported',
    );
    assert.ok(!out.includes(path.basename(binary)), 'a NUL-bearing blob is not prose');
    assert.ok(!out.includes(path.basename(oversize)), 'a file over the cap is not scanned');
  } finally {
    // force: true so an already-absent file does not mask the real failure with ENOENT.
    for (const file of [text, binary, oversize]) fs.rmSync(file, { force: true });
  }
});

test('a claimant is scanned for what it contains, not for its extension (#4300)', () => {
  // Behavioural arm. The enumeration above proves the corpus covers git's claimants; this proves
  // the gate itself admits a file type the old allowlist excluded, by driving the whole tool.
  // `.kt` is delivered into this repo by the backbone and was never in CITATION_TEXT.
  const tag = `${process.pid}-${Date.now().toString(36)}`;
  const probe = path.join(ROOT, `PROBE-4300-${tag}.kt`);
  try {
    fs.writeFileSync(probe, `// engine detail at ${at('sync/lib/copier.mjs', 410)}\n`, {
      flag: 'wx',
    });
    let out;
    try {
      out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
    } catch (error) {
      out = String(error.stdout || '');
    }
    assert.match(
      out,
      new RegExp(`\\[DRIFT\\] ${path.basename(probe)}: cites a file this repository does not own`),
      'a claimant with an excluded extension must still reach the report',
    );
  } finally {
    fs.rmSync(probe, { force: true });
  }
});

test('a constructed cross-repo coordinate reaches the report, not just the function (#4270)', () => {
  // Constructs the state the guard exists for, rather than asserting the premise inline. This
  // pins the whole chain at once: derivation, pattern, locality, the disclosure count, and the
  // wiring into the activation findings -- each of which is silent against the healthy tree.
  const probe = path.join(ROOT, 'PROBE-4270.md');
  fs.writeFileSync(probe, `The engine at ${at('sync/lib/copier.mjs', 410)} does the hashing.\n`);
  try {
    let out;
    try {
      out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
    } catch (error) {
      out = String(error.stdout || '');
    }
    assert.match(out, /Unowned-file citations: 1 coordinate\(s\) in \d+ file\(s\)/);
    assert.match(out, /\[DRIFT\] PROBE-4270\.md: cites a file this repository does not own/);
  } finally {
    fs.unlinkSync(probe);
  }
  const clean = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
  assert.match(clean, /Unowned-file citations: 0 coordinate\(s\) in \d+ file\(s\)/);
  assert.ok(
    clean.indexOf('Unowned-file citations:') < clean.indexOf('Canonical runtime activation:'),
    'the population must be stated before the verdict it qualifies',
  );
});

// --- #4278: the advertisement was transcribed while the numbers inside it were derived --------
//
// `--help` is this tool's front door and it enumerated what the tool validates. The comment
// above HELP_TEXT reasoned explicitly about the two COUNTS in that sentence -- interpolating
// both so they could not decay -- and left the sentence itself hand-written. Three validators
// added in #4233, #4251 and #4270 therefore never appeared in it, each shipping past a green
// test whose name is about this exact text, because that test pins the counts and not the list.
//
// Measured before the fix: 7 advertised phrases, 7 validators wired, 3 of them unadvertised.
// The list is now derived from the registry `main` dispatches over, so the two cannot diverge.

test('every validator that runs is advertised, and every advertisement runs (#4278)', () => {
  // The real registry against the real dispatch, by construction rather than by transcription.
  const runners = Object.fromEntries(VALIDATORS.map((validator) => [validator.id, () => []]));
  assert.deepEqual(dispatchValidators(runners).findings, [], 'registry and dispatch must agree');
});

test('a validator wired without an advertisement is reported (#4278)', () => {
  // The state that actually occurred, three times, constructed rather than asserted about.
  const runners = Object.fromEntries(VALIDATORS.map((validator) => [validator.id, () => []]));
  runners.somethingNew = () => [];
  const { findings } = dispatchValidators(runners);
  assert.equal(findings.length, 1, 'exactly the unadvertised validator must be reported');
  assert.match(findings[0], /--help never mentions it: somethingNew/);
});

test('an advertisement with no validator behind it is reported (#4278)', () => {
  const runners = Object.fromEntries(VALIDATORS.map((validator) => [validator.id, () => []]));
  const dropped = VALIDATORS.at(-1).id;
  delete runners[dropped];
  const { findings } = dispatchValidators(runners);
  assert.equal(findings.length, 1, 'exactly the unbacked advertisement must be reported');
  assert.match(findings[0], new RegExp(`advertised by --help but never run: ${dropped}`));
});

test('an unadvertised validator still contributes its findings (#4278)', () => {
  // Reporting the documentation defect must not convert it into a missing check: running only
  // the advertised set would drop a real finding to punish a missing label.
  const runners = Object.fromEntries(VALIDATORS.map((validator) => [validator.id, () => []]));
  runners.somethingNew = () => ['a real finding from an unlabelled validator'];
  const { findings } = dispatchValidators(runners);
  assert.ok(
    findings.includes('a real finding from an unlabelled validator'),
    'findings from an unadvertised validator must survive',
  );
});

test('the printed help lists every validator, not a sentence about some of them (#4278)', () => {
  // Asserted by EXECUTION, not over the constant: a derivation nothing prints is the defect
  // one level up. The count claims are re-checked here because deriving the list must not
  // quietly drop the interpolation the older test pins.
  const out = execFileSync(process.execPath, [TOOL, '--help'], { encoding: 'utf8' });
  // unsourced-bound: the registry's size is not committed to anywhere; it is whatever
  // validators exist. 3 says only that a one-entry registry cannot certify a dispatch (#4296).
  assert.ok(VALIDATORS.length > 3, 'PREMISE: there is a non-trivial registry to advertise');
  for (const validator of VALIDATORS) {
    assert.ok(out.includes(validator.label), `--help omits a validator: ${validator.id}`);
  }
  assert.match(out, /23-agent/);
  assert.match(out, /81-entry/);
});

test('the printed help enumerates every environment input the tool reads (#4306)', () => {
  // The three guards on this template literal all covered the Validates list. The Usage block
  // three lines above it enumerated invocation modes and was covered by none of them, so
  // GITHUB_STEP_SUMMARY -- which decides whether a run publishes a summary at all -- was read and
  // never advertised. Asserted by EXECUTION against the derived set, not over the constant.
  const out = execFileSync(process.execPath, [TOOL, '--help'], { encoding: 'utf8' });
  const reached = reachableEnvVars(TOOL);
  // unsourced-bound: no artifact commits to how many variables this entry point reads; 1 says
  // only that a scan returning nothing cannot certify an enumeration.
  assert.ok(reached.length > 1, 'PREMISE: the closure scan found variables to advertise');
  for (const name of reached) {
    assert.ok(out.includes(name), `--help omits an environment variable the tool reads: ${name}`);
  }
  assert.match(out, /^Environment:$/m, 'the enumeration needs a heading a reader can find');
});

test('the environment enumeration is checked in both directions, by construction (#4306)', () => {
  // Both controls construct the violating state rather than asserting the healthy tree lacks it.
  // The reverse direction needs this MORE: a healthy tree contains no advertised-but-unread
  // variable, so that half has nothing keeping it honest and can be weakened to a no-op with
  // nothing changing colour. Neither control re-implements the comparison it controls -- each
  // passes a population to the production predicate and reads the production finding (.github#941).
  assert.deepEqual(
    validateEnvInputs(),
    [],
    'this tree is consistent, so the controls mean something',
  );

  const undocumented = validateEnvInputs(['STRICT'], ['STRICT', 'GITHUB_STEP_SUMMARY']);
  assert.equal(undocumented.length, 1, 'a variable read but not advertised must be reported');
  assert.match(undocumented[0], /read but --help never mentions it: GITHUB_STEP_SUMMARY/);

  const unread = validateEnvInputs(['STRICT', 'CI'], ['STRICT']);
  assert.equal(unread.length, 1, 'a variable advertised but never read must be reported');
  assert.match(unread[0], /advertised by --help but never read: CI/);
});

test('the environment population is derived from reachability, not from the repository (#4306)', () => {
  // NEGATIVE CONTROL on the derivation, not on the list. 20 sibling tools under tools/ read 30+
  // variables this entry point cannot reach, including SUPABASE_DB_PASSWORD and GITHUB_TOKEN.
  // Widening the population to "present in the repository" would demand this help text advertise
  // them -- a second defect wearing the fix's clothes. Pinned so a widened walk fails here.
  const reached = reachableEnvVars(TOOL);
  for (const unreachable of ['SUPABASE_DB_PASSWORD', 'GITHUB_TOKEN', 'JAVA_HOME', 'NO_COLOR']) {
    assert.ok(
      !reached.includes(unreachable),
      `the closure must not reach a sibling tool's variable: ${unreachable}`,
    );
  }

  // The walk itself, proved on a constructed tree rather than on a premise about this one: it
  // must follow a require edge, and collect from the file it lands on.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envscan-'));
  try {
    fs.writeFileSync(path.join(dir, 'leaf.js'), 'process.env.DEEP_ONLY;\n');
    fs.writeFileSync(path.join(dir, 'root.js'), "require('./leaf');\nprocess.env.ROOT_ONLY;\n");
    assert.deepEqual(
      reachableEnvVars(path.join(dir, 'root.js')),
      ['DEEP_ONLY', 'ROOT_ONLY'],
      'the scan must cross a require edge, not stop at the entry file',
    );
    assert.deepEqual(
      reachableEnvVars(path.join(dir, 'leaf.js')),
      ['DEEP_ONLY'],
      'and must not reach a file that only requires IT',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('the registry is checked against the dispatch, not against itself (#4278)', () => {
  // DISCLOSURE: every test above builds its expectation FROM `VALIDATORS`, so deleting a row
  // survived the entire suite at 0 failures -- the population and the expectation were the same
  // object. This is the class reported to me and then reproduced inside my own fix for it.
  // The independent enumeration is the dispatch `main` really passes: runner keys, not labels.
  const wired = Object.keys(activationRunners({})).sort();
  const advertised = VALIDATORS.map((validator) => validator.id).sort();
  // unsourced-bound: mirrors the registry premise above; no artifact states a dispatch size.
  assert.ok(wired.length > 3, 'PREMISE: a non-trivial dispatch exists to compare against');
  assert.deepEqual(advertised, wired, 'every dispatched validator needs a --help row, and back');
});

test('the report states how many validators ran against how many it advertises (#4278)', () => {
  // Asserted by execution, and by the EQUALITY of the two printed numbers rather than by either
  // one, so this survives legitimate growth of the registry while still failing on divergence.
  const out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
  const line = out.match(/Validators: (\d+) advertised, (\d+) run/);
  assert.ok(line, 'the report must disclose the validator populations');
  assert.equal(line[1], line[2], 'advertised and run must agree');
  assert.equal(Number(line[2]), Object.keys(activationRunners({})).length);
});

// --- #4281: the exemption is keyed to OWNERSHIP, not presence and not basename ----------------
//
// Every state below is CONSTRUCTED. The live corpus contains zero coordinates, so a test that
// merely ran the corpus would pass under all of the mutations these pin -- the same concealing
// zero that hid the narrow detector in #4270.
const ownedOnly = (present, managed) => (cited) => present.has(cited) && !managed.has(cited);

test('a coordinate into a received file is reported though the path is present here (#4281)', () => {
  // The exemption's stated reason is that a self-reference moves with the edit that moves it.
  // A managed target moves when the BACKBONE re-delivers it: present, but not owned.
  const present = new Set(['AGENTS.md', 'agency.toml', 'tools/check-ai-manifest.js']);
  const managed = new Set(['AGENTS.md', 'agency.toml']);
  const findings = citationFindings(
    `see ${at('AGENTS.md', 120)} and ${at('agency.toml', 14)}`,
    CANON_CITATIONS,
    ownedOnly(present, managed),
  ).filter((f) => f.startsWith('cites a file'));
  assert.equal(findings.length, 2, 'both received coordinates must be reported');
  assert.ok(findings.some((f) => f.includes(at('AGENTS.md', 120))));
  assert.ok(findings.some((f) => f.includes(at('agency.toml', 14))));
});

test('a coordinate is not exempted by a basename collision with an unrelated file (#4281)', () => {
  // `sync/README.md` does not exist here at all. The old predicate exempted it because finance
  // has files named README.md -- suppressing a coordinate into a path this repo does not contain,
  // which is the literal case the function's docstring says it reports.
  const present = new Set(['docs/README.md', 'apps/web/README.md']);
  const findings = citationFindings(
    `see ${at('sync/README.md', 12)}`,
    CANON_CITATIONS,
    ownedOnly(present, new Set()),
  ).filter((f) => f.startsWith('cites a file'));
  assert.equal(findings.length, 1, 'a basename match is not a path match');
  assert.ok(findings[0].includes(at('sync/README.md', 12)));
});

test('a coordinate into a locally authored file stays exempt (#4281)', () => {
  // The counter-state. Narrowing an exemption must not become deleting it: a self-reference
  // really does move with the edit that moves it, and reporting it would be noise.
  const present = new Set(['tools/check-ai-manifest.js', 'docs/ai/README.md']);
  const managed = new Set(['AGENTS.md']);
  const findings = citationFindings(
    `see ${at('tools/check-ai-manifest.js', 100)} and ${at('docs/ai/README.md', 82)}`,
    CANON_CITATIONS,
    ownedOnly(present, managed),
  ).filter((f) => f.startsWith('cites a file'));
  assert.deepEqual(findings, [], 'owned self-references must not be reported');
});

test('the received set is read from the lock, not written down beside the rule (#4281)', () => {
  // Independent enumeration, per #4278: the set the rule consults is compared against the lock
  // on disk rather than against itself, so a hardcoded or emptied set is visible.
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  const recorded = Object.keys(lock.entries ?? lock);
  const managed = managedTargets();
  // unsourced-bound: the lock's entry count is the sync engine's output, and nothing declares
  // an expected size. Pinning the current 81 would fail on every legitimate sync (#4296).
  assert.ok(recorded.length > 20, 'PREMISE: the lock records a non-trivial delivered surface');
  assert.equal(managed.size, recorded.length, 'every recorded target counts as received');
  for (const entry of recorded)
    assert.ok(managed.has(entry), `missing from received set: ${entry}`);
});

test('this tool states received paths without offsets, as its own rule requires (#4281)', () => {
  // The two coordinates this comment block used as EXAMPLES were the only two the corpus ever
  // contained, and the old exemption hid both. With the rule repaired they would be findings,
  // so the prose names the files without offsets -- the tool complying with itself.
  const source = fs.readFileSync(TOOL, 'utf8');
  const managed = managedTargets();
  const owned = (cited) => !managed.has(cited);
  const findings = citationFindings(source, CANON_CITATIONS, owned).filter((f) =>
    f.startsWith('cites a file'),
  );
  assert.deepEqual(findings, [], 'this tool must not cite a received file by line number');
});

test('the report states the received population the exemption depends on (#4281)', () => {
  // The count of files scanned made a zero meaningful (#4270); the size of the exempted set is
  // the other half, because a silently empty received set restores the defect at a clean zero.
  const out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
  const line = out.match(
    /Unowned-file citations: (\d+) coordinate\(s\) in (\d+) file\(s\)[^;]*; (\d+) received/,
  );
  assert.ok(line, 'the report must state coordinates, corpus size and received-set size');
  // unsourced-bound: corpus size is discovered by a walk, not declared. The received-set size
  // on the next line IS sourced -- from managedTargets() -- which is the contrast (#4296).
  assert.ok(Number(line[2]) > 10, 'the corpus must be non-trivial');
  assert.equal(Number(line[3]), managedTargets().size);
  // unsourced-bound: guards against an emptied set; the exact size is asserted separately
  // against managedTargets(), so this bound only has to exclude the degenerate case (#4296).
  assert.ok(Number(line[3]) > 20, 'an empty received set would silently restore the exemption');
});
test('the PRODUCTION predicate, not a test copy, distinguishes owned from received (#4281)', () => {
  // DISCLOSURE: the three tests above build their own `ownedOnly` and hand it in, so they pin the
  // CONTRACT of citationFindings and say nothing about the predicate validateCitationCoverage
  // actually constructs. Reverting that predicate -- restoring the basename widening, or dropping
  // the ownership conjunct -- survived the whole suite at 0 failures. A test that re-implements
  // the thing it is checking is the mutant-F hazard with the operands swapped.
  //
  // So this constructs the state on disk and runs the real walk: one coordinate into a RECEIVED
  // target (present here, owned upstream) and one into a path this repo does not contain whose
  // basename collides with local files. Both must be reported by the production code path.
  const probe = path.join(ROOT, 'PROBE-4281.md');
  // Non-dotfile, no `@`: the coordinate pattern begins on a word character, so a received target
  // like `.github/agents/x.agent.md` is still REPORTED but with its leading dot trimmed from the
  // message. That truncation is cosmetic and out of scope here; this test avoids depending on it.
  const received = [...managedTargets()].find(
    (entry) => entry.endsWith('.md') && !entry.startsWith('.') && !entry.includes('@'),
  );
  assert.ok(received, 'PREMISE: the lock records a received markdown target to cite');
  assert.ok(
    fs.existsSync(path.join(ROOT, received)),
    'PREMISE: that target is PRESENT here, so only ownership can distinguish it',
  );
  const collides = 'sync/README.md';
  assert.ok(!fs.existsSync(path.join(ROOT, collides)), 'PREMISE: the colliding path is absent');
  assert.ok(
    fs.existsSync(path.join(ROOT, 'README.md')),
    'PREMISE: a file with the same basename exists, so the old widening would exempt it',
  );
  fs.writeFileSync(
    probe,
    `Backbone note: jrmoulckers/.github at ${at(received, 3)} and ${at(collides, 12)}.\n`,
  );
  try {
    const { findings } = validateCitationCoverage();
    const text = findings.join('\n');
    assert.ok(
      text.includes(at(received, 3)),
      'a coordinate into a received target must be reported though the path is present',
    );
    assert.ok(
      text.includes(at(collides, 12)),
      'a basename collision must not exempt a path this repo does not contain',
    );
  } finally {
    fs.unlinkSync(probe);
  }
  assert.deepEqual(
    validateCitationCoverage().findings,
    [],
    'the tree is clean once the probe is gone',
  );
});

// --- #4287: the read-set is composed from its producers, not enumerated -----------------------
//
// `triggerFindings` used to take the lock's managed keys plus two hand-named files. That list was
// correct when written (#4251) and was outgrown by the citation corpus (#4270): ten files the
// coordinate rule reads were neither managed nor named, so the guard whose purpose is to notice
// unfireable inputs could not report them. These tests pin the composition, not the list.

test('the read-set composes every producing population (#4287)', () => {
  const inputs = checkInputs(['.github/agents/a.md'], ['README.md', '.github/agents/a.md']);
  assert.equal(inputs.get('.github/agents/a.md'), 'managed entry', 'managed wins over corpus');
  assert.equal(inputs.get('README.md'), 'citation corpus');
  assert.equal(inputs.get(ENFORCEMENT_WORKFLOW), 'named input');
  assert.equal(inputs.get(SYNC_LOCK), 'named input');
});

test('corpus files outside the trigger are reported against their own population (#4287)', () => {
  const globs =
    "on:\n  pull_request:\n    paths:\n      - '.github/workflows/ai-manifest-check.yml'\n" +
    "      - '.studio-sync.lock.json'\n      - '.github/agents/**'\n";
  // One corpus file covered, two not: the denominator must be the corpus, not the whole read-set,
  // or a small uncovered count reads as reassuring against an inflated population.
  const findings = triggerFindings(
    globs,
    checkInputs(['.github/agents/a.md'], ['.github/agents/a.md', 'README.md', 'PRODUCT.md']),
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0], /2 of 2 citation corpus path\(s\)/);
  assert.match(findings[0], /README\.md/);
});

test('an empty read-set is unverifiable, never fully covered (#4287)', () => {
  const globs = "on:\n  pull_request:\n    paths:\n      - 'AGENTS.md'\n";
  const findings = triggerFindings(globs, new Map());
  // Nothing to check and everything covered are the same verdict from a count alone. Only one of
  // them is a report, so the empty case must not render as the clean one.
  assert.equal(findings.length, 1);
  assert.match(findings[0], /read-set is empty/);
});

test('the PRODUCTION walk, not a test list, supplies the corpus population (#4287)', () => {
  // The call site is the claim. `checkInputs` accepting a corpus proves nothing about whether
  // `validateTriggerCoverage` passes it one: the previous shape called triggerFindings with the
  // lock keys alone and every unit test still passed. So this constructs a corpus file on disk,
  // in a directory the trigger globs do not cover, and asserts the real validator reports it.
  const probeDir = path.join(ROOT, 'docs', 'ops');
  const probe = path.join(probeDir, `PROBE-4287-${process.pid}-${Date.now().toString(36)}.md`);
  assert.ok(fs.existsSync(probeDir), 'PREMISE: the probe directory exists');

  const before = activationRunners({}).triggerCoverage();
  const corpusBefore = before.find((f) => f.includes('citation corpus'));

  // `wx` makes creation itself the existence check. Asserting the path is free and then writing
  // it is a genuine TOCTOU race (CodeQL js/file-system-race) — the same finding `citationCorpus`
  // resolved by taking one descriptor — and here it would also silently clobber a real file.
  // The name is per-process (#4308): a fixed `wx` name turns a killed run into a permanent latch,
  // because the next run's exclusive create throws before its cleanup can be reached.
  try {
    fs.writeFileSync(probe, '# probe\n\nA claim about jrmoulckers/.github and copier.mjs.\n', {
      flag: 'wx',
    });
    const after = activationRunners({}).triggerCoverage();
    const corpusAfter = after.find((f) => f.includes('citation corpus'));
    assert.ok(corpusAfter, 'the corpus population must be reported by the production validator');
    assert.notEqual(
      corpusAfter,
      corpusBefore,
      'a new uncovered corpus file must move the production count',
    );
    assert.match(corpusAfter, /docs\/ops/);
  } finally {
    fs.rmSync(probe, { force: true });
  }
  assert.deepEqual(
    activationRunners({}).triggerCoverage(),
    before,
    'the report returns once the probe is gone',
  );
});

// --- #4292: an unknown ownership basis is a finding, never a clean zero -----------------------
//
// `managedTargets` resolved the entry map as `Object.keys(lock.entries ?? lock)`. That fallback
// degrades to the lock's own top-level keys, not to empty, so a renamed `entries` yielded four
// plausible target names and every ownership verdict kept reporting confident numbers about the
// wrong set. The exemption widens as the managed set shrinks, so the failure is SILENCE: measured
// before the fix, 0 coordinates across 72 files while disclosing "4 received target(s)".

test('a lock whose entry map is missing or misshapen is unverifiable, not empty (#4292)', () => {
  assert.ok('error' in lockEntries({ version: 1, files: { 'AGENTS.md': {} } }), 'renamed key');
  assert.ok('error' in lockEntries({ entries: null }), 'null entries');
  assert.ok('error' in lockEntries({ entries: [] }), 'array entries');
  assert.ok('error' in lockEntries(null), 'no lock at all');

  // A NON-EMPTY array is the case that needs the Array.isArray arm specifically: an empty one is
  // already refused by the floor, so testing only `[]` leaves the arm unexercised and it can be
  // deleted with the suite green (survived a mutant that did exactly that). A populated array
  // clears the floor and would otherwise hand back its indices as delivered target names.
  const indexed = lockEntries({ entries: [{ targetSha256: 'a' }, { targetSha256: 'b' }] });
  assert.ok('error' in indexed, 'a populated array clears the floor and must still be refused');
  assert.ok(!('targets' in indexed), 'array indices must never be mistaken for delivered targets');

  // The specific regression: the old `?? lock` fallback returned these four as target names.
  const reshaped = lockEntries({ version: 1, backbone: 'x', generatedAt: 'y', files: {} });
  assert.ok('error' in reshaped);
  assert.ok(
    !('targets' in reshaped),
    'top-level meta keys must never be mistaken for delivered targets',
  );
});

test('the managed population is a floor, not a pin on the current fleet (#4292)', () => {
  assert.equal(MANAGED_FLOOR, 1, 'a floor above 1 would pin the check to a particular fleet size');

  const below = lockEntries({ entries: {} });
  assert.ok('error' in below);
  assert.match(below.error, /below the floor/);

  // The other direction, and the reason this is a floor: a one-entry lock MUST validate. Without
  // this arm the floor can be tightened into a pin on today's 81 with the suite still green, and
  // a pin gets reverted the first time the fleet legitimately shrinks — a reverted check is a
  // deleted check (.github#834).
  const minimal = lockEntries({ entries: { 'AGENTS.md': { targetSha256: 'a' } } });
  assert.ok('targets' in minimal, 'a one-entry lock is a small fleet, not a broken basis');
  assert.deepEqual([...minimal.targets], ['AGENTS.md']);
});

test('the PRODUCTION ownership rule refuses to report a zero it cannot justify (#4292)', () => {
  // Unit tests on `lockEntries` say nothing about whether `validateCitationCoverage` consults it:
  // the previous shape called `managedTargets()` and would pass every assertion above. So this
  // constructs the state on disk and drives the real validators, restoring the engine-owned lock
  // in `finally` and asserting byte-identical restoration afterwards.
  const lockPath = path.join(ROOT, '.studio-sync.lock.json');
  const original = fs.readFileSync(lockPath);
  const real = JSON.parse(original.toString('utf8'));

  const healthy = validateCitationCoverage();
  assert.equal(healthy.findings.length, 0, 'PREMISE: the real basis is healthy');
  assert.ok(healthy.scanned > 0, 'PREMISE: the real corpus is non-empty');

  try {
    // Valid JSON, every byte of data intact, one key renamed.
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ version: real.version, files: real.entries }, null, 2) + '\n',
    );
    const basis = managedBasis();
    assert.ok('error' in basis, 'a renamed entry map must not resolve to targets');

    const blind = validateCitationCoverage();
    assert.equal(blind.findings.length, 1, 'silence is the failure mode, so it must be reported');
    assert.match(blind.findings[0], /ownership is unverifiable/);
    assert.equal(blind.scanned, 0, 'a population of 0 must not read as a clean sweep of 72');

    const trigger = activationRunners({}).triggerCoverage();
    assert.ok(
      trigger.some((f) => f.includes('cannot establish the managed population')),
      'the denominator is part of the claim, so it is reported rather than substituted',
    );
  } finally {
    fs.writeFileSync(lockPath, original);
  }

  assert.deepEqual(fs.readFileSync(lockPath), original, 'the engine-owned lock is restored');
  assert.deepEqual(validateCitationCoverage(), healthy, 'and the healthy verdict returns');
});
