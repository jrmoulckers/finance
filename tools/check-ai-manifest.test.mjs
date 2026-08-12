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
  managedRegion,
  managedDigest,
  verifyLockCoverage,
  unstampCandidates,
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
test('unstampCandidates recognizes every comment syntax and both messages', () => {
  const forms = [
    CANON_STAMP,
    '# synced from jrmoulckers/.github — canonical source; do not edit here',
    '/* generated + synced from jrmoulckers/studio @jrm/tokens — do not edit here */',
    '<!-- generated + synced from jrmoulckers/studio @jrm/tokens — do not edit here -->',
  ];
  for (const stamp of forms) {
    assert.equal(unstampCandidates(`${stamp}\nbody\n`).length, 2, `not recognized: ${stamp}`);
  }
  assert.deepEqual(unstampCandidates('# Local file\nnot synced\n'), []);
});

// The caller accepts a match under either strip, so both must be offered. A single-strip
// implementation would reproduce one stamper's shape and silently drop the other's.
test('unstampCandidates offers both the one-line and two-line strip', () => {
  const noBlank = `${CANON_STAMP}\nbody\n`;
  const blank = `${CANON_STAMP}\n\nbody\n`;
  assert.deepEqual(unstampCandidates(noBlank), ['body\n', 'body\n'.replace('body\n', '')]);
  assert.ok(unstampCandidates(blank).includes('body\n'));
});

// The assertion the tool previously called impossible. The original measurement hashed each
// file AS DELIVERED and matched 0 of 65 -- which could not have come out otherwise, since
// sourceSha256 hashes canon before the stamp exists. That control is pinned below.
test('managed targets unstamp to their recorded canon source', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, '.studio-sync.lock.json'), 'utf8'));
  let reproduced = 0;
  let asDelivered = 0;
  let corruptedReproduced = 0;
  for (const [entry, metadata] of Object.entries(lock.entries || {})) {
    if (!metadata || !metadata.sourceSha256) continue;
    const absolute = path.join(ROOT, entry);
    if (!fs.existsSync(absolute)) continue;
    const text = fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
    if (managedRegion(text) !== null) continue;
    const candidates = unstampCandidates(text);
    if (candidates.length === 0) continue;
    if (candidates.some((body) => sha(body) === metadata.sourceSha256)) reproduced += 1;
    if (sha(text) === metadata.sourceSha256) asDelivered += 1;
    // Corruption control: an edited body must reproduce under NEITHER candidate. Without
    // this the disjunction could be accepting far more than it should and still count 64.
    const corrupted = unstampCandidates(`${text}\n/* edited */\n`);
    if (corrupted.some((body) => sha(body) === metadata.sourceSha256)) corruptedReproduced += 1;
  }
  assert.ok(reproduced > 0, 'corpus contains no stamped entry to verify');
  assert.equal(asDelivered, 0, 'delivered form should never match a pre-stamp hash');
  assert.equal(corruptedReproduced, 0, 'a corrupted body must not reproduce under either strip');
});
