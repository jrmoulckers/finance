// SPDX-License-Identifier: BUSL-1.1

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  UNRESOLVED_BASELINE,
  census,
  collectLinks,
  markFences,
  scopeLines,
} from './check-doc-links.mjs';

test('a relative markdown link is collected', () => {
  const { links } = collectLinks('See [x](../guides/x.md) here.');
  assert.equal(links.length, 1);
  assert.equal(links[0].target, '../guides/x.md');
});

test('an anchor is stripped from the target but kept in the href', () => {
  const { links } = collectLinks('[x](./a.md#section)');
  assert.equal(links[0].target, './a.md');
  assert.equal(links[0].href, './a.md#section');
});

test('absolute URLs are not treated as files', () => {
  const { links } = collectLinks('[x](https://example.com/a.md) [y](mailto:a@b.md)');
  assert.equal(links.length, 0);
});

test('a protocol-relative URL is not treated as a file', () => {
  const { links } = collectLinks('[x](//example.com/a.md)');
  assert.equal(links.length, 0, 'a leading // is a URL, not a relative path');
});

test('a bare fragment is not treated as a file', () => {
  const { links } = collectLinks('[x](#anchor)');
  assert.equal(links.length, 0);
});

test('non-markdown targets are out of scope', () => {
  const { links } = collectLinks('[x](./a.png) [y](./b.ts)');
  assert.equal(links.length, 0);
});

test('links inside a fenced block are skipped and counted', () => {
  const doc = ['before [a](./a.md)', '```', 'inside [b](./b.md)', '```', 'after [c](./c.md)'].join(
    '\n',
  );
  const { links, skipped } = collectLinks(doc);
  assert.deepEqual(
    links.map((l) => l.target),
    ['./a.md', './c.md'],
  );
  assert.equal(skipped, 1, 'the skip must be reported, not silent');
});

test('a tilde fence opens and closes a block too', () => {
  const doc = ['~~~', '[b](./b.md)', '~~~'].join('\n');
  assert.equal(collectLinks(doc).links.length, 0);
});

test('an inline code span is not a link', () => {
  const { links } = collectLinks('write `[x](./a.md)` to link');
  assert.equal(links.length, 0, 'a path shown as code is an illustration');
});

test('blanking a code span does not shift the line number of a real link', () => {
  const doc = ['first', '`[x](./a.md)` and [y](./b.md)'].join('\n');
  const { links } = collectLinks(doc);
  assert.equal(links.length, 1);
  assert.equal(links[0].line, 2);
});

test('markFences marks the fence line itself as fenced', () => {
  const marked = markFences('a\n```\nb\n```\nc');
  assert.deepEqual(
    marked.map((m) => m.fenced),
    [false, true, true, true, false],
  );
});

test('an unclosed fence swallows the rest of the file rather than reopening', () => {
  const marked = markFences('a\n```\nb\nc');
  assert.deepEqual(
    marked.map((m) => m.fenced),
    [false, true, true, true],
  );
});

function fakeCensus(filesByPath, existing) {
  const git = (args) => {
    assert.equal(args[0], 'ls-files');
    return Object.keys(filesByPath).join('\n');
  };
  const exists = (p) => existing.has(p);
  const read = (p) => filesByPath[p];
  return census(git, exists, read);
}

test('census resolves a link relative to the citing file, not the repo root', () => {
  const result = fakeCensus(
    { 'docs/guides/a.md': '[x](../architecture/b.md)' },
    new Set(['docs/architecture/b.md']),
  );
  assert.deepEqual(result.broken, []);
  assert.equal(result.total, 1);
});

test('census reports a link that escapes above the resolved target', () => {
  const result = fakeCensus(
    { 'docs/guides/a.md': '[x](../../architecture/b.md)' },
    new Set(['docs/architecture/b.md']),
  );
  assert.deepEqual(result.broken, ['docs/guides/a.md -> ../../architecture/b.md']);
});

test('census counts files and fenced skips as well as links', () => {
  const result = fakeCensus(
    {
      'a.md': '[x](./b.md)\n```\n[y](./nope.md)\n```',
      'b.md': 'no links',
    },
    new Set(['b.md']),
  );
  assert.equal(result.files, 2);
  assert.equal(result.total, 1);
  assert.equal(result.fenced, 1);
  assert.deepEqual(result.broken, []);
});

test('census returns an empty result for a repository with no markdown', () => {
  const result = census(
    () => '',
    () => false,
    () => '',
  );
  assert.deepEqual(result, { files: 0, total: 0, fenced: 0, broken: [] });
});

test('scopeLines states the population on any branch that prints them', () => {
  const out = scopeLines({ files: 593, total: 3353, fenced: 2 }).join('\n');
  assert.match(out, /3353 relative markdown link\(s\)/);
  assert.match(out, /593 tracked file\(s\)/);
  assert.match(out, /2 inside fenced blocks/);
});

test('scopeLines names the failure this check cannot see', () => {
  const out = scopeLines({ files: 1, total: 1, fenced: 0 }).join('\n');
  assert.match(
    out,
    /keeps its name[\s\S]*content moves/,
    'a target that keeps its path while losing its content stays green',
  );
});

test('the baseline holds distinct entries only', () => {
  assert.equal(new Set(UNRESOLVED_BASELINE).size, UNRESOLVED_BASELINE.length);
});

test('every baseline entry is in the file -> href form the census emits', () => {
  for (const entry of UNRESOLVED_BASELINE) {
    assert.match(entry, /^[^ ]+\.md -> \S+\.md$/, `malformed baseline entry: ${entry}`);
  }
});
