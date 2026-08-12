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
  managedRegion,
  managedDigest,
  verifyLockCoverage,
  unstampSource,
  commentFamily,
  verifySourceReproduction,
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
  const recorded = Object.values(lock.entries || {}).filter((m) => m && m.sourceSha256).length;
  const result = verifySourceReproduction(lock);
  const accounted = result.reproduced + result.unreproduced.length + result.unobserved.length;
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
