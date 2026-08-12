import test from 'node:test';
import assert from 'node:assert/strict';
import { refForm, collectRefs, census, BASELINE } from './check-upstream-refs.mjs';

const url = (repo, ref, path) => `https://github.com/jrmoulckers/${repo}/blob/${ref}/${path}`;
const SHA = '3a752c11856515a74eb204675d5d5198cac1e48e';

test('a 40-character hex ref is immutable', () => {
  assert.equal(refForm(SHA), 'sha40');
});

test('a 39-character hex ref is not a sha40', () => {
  assert.equal(refForm(SHA.slice(1)), 'branch');
});

test('an uppercase 40-char ref is not treated as a sha', () => {
  // Git object names are lowercase hex. Accepting uppercase would classify a
  // branch literally named like a SHA as immutable.
  assert.equal(refForm(SHA.toUpperCase()), 'branch');
});

test('a ref merely containing a sha is not immutable', () => {
  // Survived mutation testing until this existed: without the ^$ anchors a
  // branch named `backup-<sha>` classifies as an immutable commit ref.
  assert.equal(refForm(`backup-${SHA}`), 'branch');
  assert.equal(refForm(`${SHA}-old`), 'branch');
});
test('a semver tag is its own form, not a branch', () => {
  assert.equal(refForm('v0.1.0'), 'tag');
  assert.equal(refForm('0.1.0'), 'tag');
});

test('main and other names are mutable branches', () => {
  for (const r of ['main', 'master', 'release', 'v1']) assert.equal(refForm(r), 'branch');
});

test('extracts repo, ref and path from a blob link', () => {
  const [r] = collectRefs(`see ${url('engineering', 'main', 'practices/testing.md')}`);
  assert.deepEqual(
    { repo: r.repo, ref: r.ref, path: r.path, form: r.form },
    { repo: 'engineering', ref: 'main', path: 'practices/testing.md', form: 'branch' },
  );
});

test('a fragment is not captured as part of the path', () => {
  const [r] = collectRefs(url('engineering', 'main', 'practices/testing.md') + '#heading');
  assert.equal(r.path, 'practices/testing.md');
});

test('a markdown autolink does not leave a trailing angle bracket', () => {
  // Found by running the tool: `<url>` form captured the closing bracket into
  // the path, so the reported path did not exist even when the real one did.
  const [r] = collectRefs(`<${url('.github', 'main', 'SECURITY.md')}>`);
  assert.equal(r.path, 'SECURITY.md');
});

test('a markdown link does not capture the closing paren', () => {
  const [r] = collectRefs(`[x](${url('product', SHA, 'principles/compliance.md')})`);
  assert.equal(r.path, 'principles/compliance.md');
});

test('two links on one line are both found', () => {
  const line = `${url('a', 'main', 'x.md')} and ${url('b', SHA, 'y.md')}`;
  assert.equal(collectRefs(line).length, 2);
});

test('line numbers are 1-based and per-line', () => {
  const [r] = collectRefs(`\n\n${url('engineering', 'main', 'p.md')}`, 'f.md');
  assert.equal(r.line, 3);
  assert.equal(r.file, 'f.md');
});

test('a link inside a fenced block is an illustration, not a reference', () => {
  const body = ['```', url('engineering', 'main', 'practices/testing.md'), '```'].join('\n');
  assert.equal(collectRefs(body).length, 0);
});

test('links after a closed fence are counted again', () => {
  const body = ['```', 'x', '```', url('engineering', 'main', 'a.md')].join('\n');
  assert.equal(collectRefs(body).length, 1);
});

test('a tilde fence also suppresses', () => {
  const body = ['~~~', url('engineering', 'main', 'a.md'), '~~~'].join('\n');
  assert.equal(collectRefs(body).length, 0);
});
test('a non-jrmoulckers owner is ignored', () => {
  assert.equal(collectRefs('https://github.com/other/repo/blob/main/x.md').length, 0);
});

test('a non-blob github url is ignored', () => {
  assert.equal(collectRefs('https://github.com/jrmoulckers/engineering/tree/main/x').length, 0);
});

test('a repository name containing a dot is captured whole', () => {
  const [r] = collectRefs(url('.github', 'main', 'x.md'));
  assert.equal(r.repo, '.github');
});

test('census groups by repo and form', () => {
  const refs = collectRefs(
    [
      url('engineering', 'main', 'a.md'),
      url('product', SHA, 'b.md'),
      url('product', SHA, 'c.md'),
    ].join('\n'),
  );
  const c = census(refs);
  assert.equal(c.get('engineering,branch'), 1);
  assert.equal(c.get('product,sha40'), 2);
});

test('census of no refs is empty rather than absent', () => {
  assert.equal(census([]).size, 0);
});

test('the baseline is a recorded number, not a target of zero', () => {
  // A baseline of 0 would mean the ratchet had been silently reset; a baseline
  // below the count would fail the gate on unchanged input.
  assert.ok(BASELINE > 0);
});
