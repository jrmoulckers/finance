// SPDX-License-Identifier: BUSL-1.1

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STALE_ANCHOR_BASELINE,
  UNRESOLVED_BASELINE,
  census,
  collectLinks,
  headingSlugs,
  markFences,
  reportLines,
  scopeLines,
  slugify,
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
  assert.deepEqual(result, {
    files: 0,
    total: 0,
    fenced: 0,
    broken: [],
    staleAnchors: [],
    fragmentless: 0,
    checkedAnchors: 0,
  });
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

// --- Anchor and specificity checks (issue #4274) ---

test('slugify replaces each space individually, not runs of them', () => {
  // Removing the em dash leaves two spaces, and GitHub renders a double hyphen. A
  // `\s+` collapse here mis-slugged 89 valid links as stale when this was measured.
  assert.equal(
    slugify('3.1 Android distribution \u2014 Google Play (#1242)'),
    '31-android-distribution--google-play-1242',
  );
});

test('slugify keeps the variation selector a heading emoji leaves behind', () => {
  // GitHub strips the warning sign but not U+FE0F, so the real anchor begins with an
  // invisible character. Stripping it mis-slugged a further 3 valid links.
  assert.equal(
    slugify('\u26A0\uFE0F MANDATORY: Pre-Push Workflow (NEVER skip)'),
    '\uFE0F-mandatory-pre-push-workflow-never-skip',
  );
});

test('slugify lowercases and drops punctuation', () => {
  assert.equal(slugify('Data Retention & Deletion?'), 'data-retention--deletion');
});

test('headingSlugs collects every heading level', () => {
  const slugs = headingSlugs('# One\n\ntext\n\n### Two Words\n');
  assert.deepEqual([...slugs].sort(), ['one', 'two-words']);
});

test('headingSlugs ignores headings inside fenced blocks', () => {
  const slugs = headingSlugs('# Real\n\n```\n# Fake\n```\n');
  assert.equal(slugs.has('real'), true);
  assert.equal(slugs.has('fake'), false);
});

test('headingSlugs ignores a hash that is not a heading', () => {
  assert.equal(headingSlugs('#NoSpace\n').size, 0);
});

test('collectLinks exposes the fragment separately from the target', () => {
  const { links } = collectLinks('[x](./a.md#some-section)');
  assert.equal(links[0].target, './a.md');
  assert.equal(links[0].fragment, 'some-section');
});

test('a link with no fragment reports an empty fragment', () => {
  const { links } = collectLinks('[x](./a.md)');
  assert.equal(links[0].fragment, '');
});

const anchorFixture = (docs) => {
  const git = () => Object.keys(docs).join('\n');
  const exists = (p) => Object.prototype.hasOwnProperty.call(docs, p);
  const read = (p) => docs[p];
  return census(git, exists, read);
};

test('a link naming a heading that exists is not stale', () => {
  const out = anchorFixture({
    'a.md': '[x](b.md#the-section)',
    'b.md': '## The Section\n',
  });
  assert.deepEqual(out.staleAnchors, []);
  assert.equal(out.checkedAnchors, 1);
  assert.equal(out.fragmentless, 0);
});

test('a link naming a heading that does not exist is stale', () => {
  const out = anchorFixture({
    'a.md': '[x](b.md#renamed-away)',
    'b.md': '## The Section\n',
  });
  assert.deepEqual(out.staleAnchors, ['a.md:1 -> b.md#renamed-away']);
});

test('a fragmentless link is counted as such and never resolved', () => {
  const out = anchorFixture({ 'a.md': '[x](b.md)', 'b.md': 'no headings\n' });
  assert.equal(out.fragmentless, 1);
  assert.equal(out.checkedAnchors, 0);
  assert.deepEqual(out.staleAnchors, []);
});

test('a link to a missing file is not classified as either specificity class', () => {
  // It is already reported as broken; counting it as fragmentless would inflate the
  // share of links that were deliberately unspecific.
  const out = anchorFixture({ 'a.md': '[x](gone.md#s)' });
  assert.equal(out.broken.length, 1);
  assert.equal(out.fragmentless, 0);
  assert.equal(out.checkedAnchors, 0);
  assert.deepEqual(out.staleAnchors, []);
});

test('a percent-encoded fragment is decoded before comparison', () => {
  const out = anchorFixture({
    'a.md': '[x](b.md#caf%C3%A9-notes)',
    'b.md': '## Caf\u00E9 Notes\n',
  });
  assert.deepEqual(out.staleAnchors, []);
});

test('a malformed percent-encoding is compared as written rather than throwing', () => {
  // `decodeURIComponent('100%-done')` throws. The fallback compares the fragment as
  // written, which here slugifies to the same anchor the heading produces. Without the
  // catch this case does not merely misreport -- the whole census dies on one bad link.
  let out;
  assert.doesNotThrow(() => {
    out = anchorFixture({ 'a.md': '[x](b.md#100%-done)', 'b.md': '## 100 done\n' });
  });
  assert.equal(out.checkedAnchors, 1);
  assert.deepEqual(out.staleAnchors, []);
});

test('a malformed percent-encoding that matches nothing is still reported stale', () => {
  const out = anchorFixture({ 'a.md': '[x](b.md#100%-done)', 'b.md': '## Other\n' });
  assert.deepEqual(out.staleAnchors, ['a.md:1 -> b.md#100%-done']);
});

test('an anchor is resolved against the target file, not the citing one', () => {
  // The citing document has the heading; the target does not. Reading the wrong file
  // would call this clean.
  const out = anchorFixture({
    'a.md': '## The Section\n\n[x](b.md#the-section)\n',
    'b.md': '## Something Else\n',
  });
  assert.equal(out.staleAnchors.length, 1);
});

test('the stale-anchor baseline is empty', () => {
  // Asserted as a literal, not as its own length: a ratchet phrased in terms of itself
  // moves with the constant and cannot detect being loosened.
  assert.deepEqual(STALE_ANCHOR_BASELINE, []);
});

test('scopeLines states the specificity split on both paths', () => {
  const lines = scopeLines({
    files: 2,
    total: 10,
    fenced: 0,
    fragmentless: 7,
    checkedAnchors: 2,
  });
  const specificity = lines.find((l) => l.startsWith('Specificity:'));
  assert.match(specificity, /7 link\(s\) name only a file \(70\.0%\)/);
  assert.match(specificity, /2 name a section/);
  assert.match(specificity, /1 point at a file that does not exist/);
});

test('scopeLines no longer claims anchor fragments are unmeasured', () => {
  const text = scopeLines({
    files: 1,
    total: 1,
    fenced: 0,
    fragmentless: 1,
    checkedAnchors: 0,
  }).join('\n');
  assert.equal(text.includes('anchor fragments'), false);
});

test('scopeLines does not divide by zero on an empty tree', () => {
  const lines = scopeLines({ files: 0, total: 0, fenced: 0, fragmentless: 0, checkedAnchors: 0 });
  assert.match(
    lines.find((l) => l.startsWith('Specificity:')),
    /\(0\.0%\)/,
  );
});

// --- The printed report, read as a sentence (issue #4276) ---

const emptyCensus = (over = {}) => ({
  files: 1,
  total: 0,
  fenced: 0,
  broken: [],
  staleAnchors: [],
  fragmentless: 0,
  checkedAnchors: 0,
  ...over,
});

test('a clean census reports success and does not fail', () => {
  const { lines, failed } = reportLines(
    emptyCensus({ total: 3, fragmentless: 2, checkedAnchors: 1 }),
    {
      baseline: [],
      staleBaseline: [],
    },
  );
  assert.equal(failed, false);
  assert.equal(lines[0], 'All resolvable relative markdown links point at files that exist.');
  assert.equal(lines[1], 'All 1 section-naming link(s) resolve to a heading that exists.');
});

test('occurrences and distinct targets are not interchangeable in the report', () => {
  // Two occurrences of one target: the numbers differ, so a swap changes the text. With
  // a fixture where they coincide, the assertion would pass either way -- the same
  // symmetry defect that makes a 7/7 fixture unable to tell "both halves" from "one
  // half twice".
  // The same citing file links the same missing target twice, on two lines. That is
  // what makes the two counts differ; two *different* citing files would be two
  // distinct entries, which is the model this fixture originally got wrong.
  const broken = ['a.md -> gone.md', 'a.md -> gone.md'];
  const { lines, failed } = reportLines(emptyCensus({ broken, total: 2 }), {
    baseline: ['a.md -> gone.md'],
    staleBaseline: [],
  });
  assert.equal(failed, false);
  const verdict = lines.at(-1);
  assert.equal(
    verdict,
    '1 recorded gap(s) remain across 2 link(s), where the target names a document this repository has never contained.',
  );
});

test('the failing verdict states occurrences before distinct targets', () => {
  const broken = ['a.md -> gone.md', 'a.md -> gone.md', 'c.md -> other.md'];
  const { lines, failed } = reportLines(emptyCensus({ broken, total: 3 }), {
    baseline: ['a.md -> gone.md'],
    staleBaseline: [],
  });
  assert.equal(failed, true);
  assert.equal(
    lines.at(-1),
    '3 broken occurrence(s) over 2 distinct target(s); 1 of those targets are recorded gaps where the document does not exist.',
  );
});

test('an unexpected broken link is named and counted', () => {
  const { lines, failed } = reportLines(emptyCensus({ broken: ['a.md -> gone.md'], total: 1 }), {
    baseline: [],
    staleBaseline: [],
  });
  assert.equal(failed, true);
  assert.equal(lines[0], '1 broken relative markdown link(s):');
  assert.equal(lines[1], '  a.md -> gone.md');
});

test('an unexpected stale anchor is named and counted', () => {
  const { lines, failed } = reportLines(
    emptyCensus({ staleAnchors: ['a.md:1 -> b.md#gone'], total: 1, checkedAnchors: 1 }),
    { baseline: [], staleBaseline: [] },
  );
  assert.equal(failed, true);
  assert.equal(lines[0], '1 stale anchor(s):');
  assert.equal(lines[1], '  a.md:1 -> b.md#gone');
});

test('broken paths do not suppress the stale-anchor section', () => {
  // Reporting only the first failing axis would let a reader repoint paths, see green,
  // and conclude the anchors had been checked.
  const { lines } = reportLines(
    emptyCensus({
      broken: ['a.md -> gone.md'],
      staleAnchors: ['a.md:1 -> b.md#gone'],
      total: 2,
      checkedAnchors: 1,
    }),
    { baseline: [], staleBaseline: [] },
  );
  const text = lines.join('\n');
  assert.equal(text.includes('1 broken relative markdown link(s):'), true);
  assert.equal(text.includes('1 stale anchor(s):'), true);
});

test('the scope lines appear on the failing path as well as the passing one', () => {
  const red = reportLines(emptyCensus({ broken: ['a.md -> gone.md'], total: 1 }), {
    baseline: [],
    staleBaseline: [],
  });
  const green = reportLines(emptyCensus({ total: 1, fragmentless: 1 }), {
    baseline: [],
    staleBaseline: [],
  });
  for (const out of [red, green]) {
    assert.equal(
      out.lines.some((l) => l.startsWith('Specificity:')),
      true,
    );
  }
});

test('a baseline entry that is no longer broken fails the run', () => {
  const { lines, failed } = reportLines(emptyCensus({ total: 1, fragmentless: 1 }), {
    baseline: ['a.md -> gone.md'],
    staleBaseline: [],
  });
  assert.equal(failed, true);
  assert.equal(lines.at(-1), '  a.md -> gone.md');
  assert.equal(
    lines.some((l) => l === '1 recorded gap(s) no longer broken -- remove them from the baseline:'),
    true,
  );
});

test('a stale anchor on the baseline is not reported', () => {
  const { failed } = reportLines(emptyCensus({ staleAnchors: ['a.md:1 -> b.md#gone'] }), {
    baseline: [],
    staleBaseline: ['a.md:1 -> b.md#gone'],
  });
  assert.equal(failed, false);
});
test('the failing verdict discounts baseline entries that are no longer broken', () => {
  // Without a fixed entry the subtraction is invisible, and a mutant dropping it
  // survives -- which it did, until this case existed.
  const broken = ['a.md -> gone.md', 'c.md -> other.md'];
  const { lines, failed } = reportLines(emptyCensus({ broken, total: 2 }), {
    baseline: ['a.md -> gone.md', 'b.md -> vanished.md'],
    staleBaseline: [],
  });
  assert.equal(failed, true);
  assert.equal(
    lines.at(-1),
    '2 broken occurrence(s) over 2 distinct target(s); 1 of those targets are recorded gaps where the document does not exist.',
  );
});
