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
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  toLF,
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
  exemptionMatches,
  sourceDisclosureLines,
  DOC_FILES,
  scanDoc,
  scanDocs,
  countCoverageFindings,
} = require('./check-ai-manifest.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  assert.ok(families.size >= 2, `switch exercised on only ${families.size} comment family`);
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
  const lines = sourceDisclosureLines(Object.keys(KNOWN_UNREPRODUCED));
  assert.equal(lines.length, Object.keys(KNOWN_UNREPRODUCED).length, 'one line per exemption');
  for (const entry of Object.keys(KNOWN_UNREPRODUCED)) {
    assert.ok(
      lines.some((l) => l.includes(entry) && l.includes(KNOWN_UNREPRODUCED[entry].issue)),
      `every exemption must be disclosed by path and issue; ${entry} was not`,
    );
  }
  assert.deepEqual(sourceDisclosureLines([]), [], 'no exemptions discloses nothing, not a zero');
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
