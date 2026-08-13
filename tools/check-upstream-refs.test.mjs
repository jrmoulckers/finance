import test from 'node:test';
import assert from 'node:assert/strict';
import {
  refForm,
  collectRefs,
  census,
  isFixtureFile,
  listExecutedFiles,
  verdict,
  BASELINE,
  EXECUTED_BASELINE,
  SELF_REPO,
} from './check-upstream-refs.mjs';

const url = (repo, ref, path) => `https://github.com/jrmoulckers/${repo}/blob/${ref}/${path}`;
const raw = (repo, ref, path) =>
  `https://raw.githubusercontent.com/jrmoulckers/${repo}/${ref}/${path}`;
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

test('a raw.githubusercontent url is a reference too', () => {
  // The form a *program* uses. The first version of this tool matched only the
  // `blob` host, so the one ref that changes a gate verdict was invisible.
  const [r] = collectRefs(raw('engineering', 'main', 'principles/index.json'));
  assert.deepEqual(
    { repo: r.repo, ref: r.ref, path: r.path, form: r.form },
    { repo: 'engineering', ref: 'main', path: 'principles/index.json', form: 'branch' },
  );
});

test('a raw url with refs/heads still yields the branch name', () => {
  const [r] = collectRefs(
    'https://raw.githubusercontent.com/jrmoulckers/engineering/refs/heads/main/p/index.json',
  );
  assert.equal(r.ref, 'main');
  assert.equal(r.path, 'p/index.json');
});

test('a raw url on a tag is immutable', () => {
  const [r] = collectRefs(raw('engineering', 'v0.145.0', 'principles/index.json'));
  assert.equal(r.form, 'tag');
});

test('blob and raw links on one line are both found', () => {
  const line = `${url('a', 'main', 'x.md')} ${raw('b', 'main', 'y.json')}`;
  assert.equal(collectRefs(line).length, 2);
});

test('a link to this repository is not a cross-repo reference', () => {
  // finance -> finance moves in the same commit as the text citing it, so
  // counting it inflates both populations with refs that cannot go stale.
  assert.equal(collectRefs(url(SELF_REPO, 'main', 'LICENSE')).length, 0);
  assert.equal(collectRefs(raw(SELF_REPO, 'main', 'LICENSE')).length, 0);
});

test('the self-repo exclusion does not swallow other repositories', () => {
  // Survives a mutant that drops the equality and excludes everything.
  assert.equal(collectRefs(url('engineering', 'main', 'x.md')).length, 1);
});

test('fence awareness can be turned off for source files', () => {
  // A triple-backtick line in a .ts file is not a fence, and treating it as one
  // would silently halve the scanned region of any file containing one.
  const body = ['```', url('engineering', 'main', 'a.md'), '```'].join('\n');
  assert.equal(collectRefs(body, 'x.ts', { fenceAware: false }).length, 1);
});

test('test files are fixtures because their mutable refs are the assertion', () => {
  for (const f of [
    'tools/check-upstream-refs.test.mjs',
    'apps/web/src/x.test.ts',
    'a/b.test.tsx',
    'apps/web/src/x.spec.jsx',
    'tools/__fixtures__/refs.mjs',
  ]) {
    assert.equal(isFixtureFile(f), true, f);
  }
});

test('a source file is not a fixture merely for containing the word test', () => {
  // Survives a mutant matching /test/ anywhere: that would exclude real code.
  for (const f of ['tools/latest.mjs', 'src/testing.ts', 'tools/check.mjs']) {
    assert.equal(isFixtureFile(f), false, f);
  }
});

test('the executed surface excludes markdown, fixtures and binaries', () => {
  const all = ['a.md', 'b.mjs', 'c.test.mjs', 'd.png', 'e.ts', 'package-lock.json'];
  const executed = listExecutedFiles(all, ['a.md']);
  assert.deepEqual(executed, ['b.mjs', 'e.ts', 'package-lock.json']);
});

test('the executed surface is not merely the complement of the markdown list', () => {
  // A mutant using only `!seen.has(f)` would re-admit untracked markdown and
  // every fixture, so the executed count would absorb the prose population.
  const executed = listExecutedFiles(['x.md', 'y.test.mjs', 'z.mjs'], []);
  assert.deepEqual(executed, ['z.mjs']);
});

test('the two baselines are recorded separately', () => {
  // One number over both populations would report a reader following a stale
  // link and a gate returning a different verdict as the same quantity.
  assert.notEqual(BASELINE, EXECUTED_BASELINE);
  assert.ok(EXECUTED_BASELINE >= 0);
});
test('a count above the prose baseline fails', () => {
  const v = verdict({ mutableCount: BASELINE + 1, executedCount: 0 });
  assert.equal(v.ok, false);
  assert.equal(v.failures.length, 1);
  assert.match(v.failures[0], /prose refs exceeds/);
});

test('a count above the executed baseline fails on its own', () => {
  // The executed population is the consequential one; a mutant that dropped
  // this branch left the prose ratchet green and the verdict-changing ref
  // unguarded.
  const v = verdict({ mutableCount: 0, executedCount: EXECUTED_BASELINE + 1 });
  assert.equal(v.ok, false);
  assert.equal(v.failures.length, 1);
  assert.match(v.failures[0], /executed files exceeds/);
});

test('both populations can fail at once and are reported separately', () => {
  const v = verdict({ mutableCount: BASELINE + 1, executedCount: EXECUTED_BASELINE + 1 });
  assert.equal(v.failures.length, 2);
});

test('counts at the baseline pass', () => {
  const v = verdict({ mutableCount: BASELINE, executedCount: EXECUTED_BASELINE });
  assert.equal(v.ok, true);
  assert.deepEqual(v.lowerable, []);
});

test('the failing branch names both populations, not just the one that broke', () => {
  // The defect this suite could not previously see: a scope line printed only
  // on success tells the reader nothing at the moment they have a verdict to
  // doubt.
  const v = verdict({
    mutableCount: BASELINE + 1,
    executedCount: 0,
    proseFiles: 593,
    executedFiles: 3615,
  });
  assert.match(v.populations, new RegExp(`${BASELINE + 1}/${BASELINE} prose \\(593 file`));
  assert.match(v.populations, new RegExp(`0/${EXECUTED_BASELINE} executed \\(3615 file`));
});

test('a drop below either baseline is offered as a new floor', () => {
  const v = verdict({ mutableCount: BASELINE - 1, executedCount: EXECUTED_BASELINE - 1 });
  assert.equal(v.ok, true);
  assert.equal(v.lowerable.length, 2);
});
test('the executed baseline is exactly one, and that one is named', () => {
  // Written as a literal on purpose. Every other baseline test here is phrased
  // relative to the constant (`EXECUTED_BASELINE + 1`), which means the whole
  // suite moves when the constant moves -- a mutant raising it 1 -> 9 survived
  // all of them. A ratchet whose tests are expressed in terms of the ratchet
  // cannot notice the ratchet being loosened.
  //
  // The one permitted ref is the engineering index URL in the vendored citation
  // checker. It should fall to 0 when that is pinned to a release tag; it must
  // never rise.
  assert.equal(EXECUTED_BASELINE, 1);
});

test('the prose baseline is exactly the measured count', () => {
  assert.equal(BASELINE, 23);
});
