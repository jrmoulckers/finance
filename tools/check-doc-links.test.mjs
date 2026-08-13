// SPDX-License-Identifier: BUSL-1.1

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STALE_ANCHOR_BASELINE,
  UNRESOLVED_BASELINE,
  UNRESOLVED_ENTRIES,
  census,
  collectLinks,
  headingSlugs,
  isRepoRelative,
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

test('a bare fragment is collected as a same-file anchor', () => {
  const { links } = collectLinks('[x](#anchor)');
  assert.equal(links.length, 1, 'same-file anchors were excluded until they were counted');
  assert.equal(links[0].sameFile, true);
  assert.equal(links[0].target, '');
  assert.equal(links[0].fragment, 'anchor');
});

test('non-markdown targets are collected and checked for existence (#4301)', () => {
  // This test previously asserted `links.length === 0` under the name "non-markdown targets
  // are out of scope". The scope it described was real -- `collectLinks` dropped them -- so
  // the test passed for as long as the defect existed and would have kept passing forever.
  //
  // A test can only ever confirm that the code does what the code does. What made this one
  // harmful was the *name*: "out of scope" reads as a considered boundary, so anyone
  // wondering whether .kt and .swift links were checked found an authoritative-sounding no.
  // 1,110 links, 22 of them broken, sat behind that sentence.
  const { links } = collectLinks('[x](./a.png) [y](./b.ts)');
  assert.deepEqual(
    links.map((l) => l.target),
    ['./a.png', './b.ts'],
  );
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
    sameFileAnchors: 0,
    nonMarkdown: 0,
    repoRelative: 0,
  });
});

test('scopeLines states the population on any branch that prints them', () => {
  const out = scopeLines({ files: 593, total: 3353, fenced: 2 }).join('\n');
  assert.match(out, /3353 markdown link\(s\)/);
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
    // The target side is no longer restricted to `.md`. It was, for as long as the census
    // dropped every non-markdown link before counting it -- so this assertion agreed with
    // the defect rather than detecting it, which is what a test written against a filtered
    // population always does.
    assert.match(entry, /^[^ ]+\.md -> \S+$/, `malformed baseline entry: ${entry}`);
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
  assert.match(specificity, /of 10 cross-file link\(s\), 7 name only a markdown file \(70\.0%\)/);
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
  assert.equal(
    lines[1],
    'All 1 cross-file section-naming link(s) and 0 same-file anchor(s) resolve to a heading that exists.',
  );
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
    '1 recorded gap(s) remain across 2 link(s). 0 moved and are repointable; 0 name a document this repository has never contained; 1 carry no recorded reason.',
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

// ---------------------------------------------------------------------------
// Same-file anchors, and the third slugger defect they were hiding.
//
// The trim-order bug lived four lines below a comment documenting two defects of
// exactly its shape. It never fired because the only links that exercise it are
// same-file anchors, and this checker discarded those before resolving anything.
// A defect and the checked population can fail to intersect, and a green result
// is then evidence about that intersection rather than about the corpus.
// ---------------------------------------------------------------------------

const SELF_DOC = ['# Doc', '', '## 🚀 Getting Started', '', 'See [start](#-getting-started).'].join(
  '\n',
);

test('a leading emoji leaves a leading hyphen, because GitHub trims before stripping', () => {
  assert.equal(slugify('🚀 Getting Started'), '-getting-started');
});

test('trimming after the strip would swallow that hyphen', () => {
  const trimLast = (h) =>
    String(h)
      .toLowerCase()
      .replace(/[^\w\s\uFE0F-]/g, '')
      .trim()
      .replace(/\s/g, '-');
  assert.equal(trimLast('🚀 Getting Started'), 'getting-started');
  assert.notEqual(trimLast('🚀 Getting Started'), slugify('🚀 Getting Started'));
});

test('a trailing emoji leaves a trailing hyphen for the same reason', () => {
  assert.equal(slugify('Done ✅'), 'done-');
});

test('the two previously documented cases stay fixed under the new trim order', () => {
  // Case 1: one-for-one space replacement, not a collapse.
  assert.equal(slugify('Android distribution — Google Play'), 'android-distribution--google-play');
  // Case 2: U+FE0F survives.
  assert.equal(slugify('⚠️ Warning'), '\uFE0F-warning');
});

test('surrounding whitespace is still trimmed, just earlier', () => {
  assert.equal(slugify('   Spaced Out   '), 'spaced-out');
});

test('census resolves a same-file anchor against its own headings', () => {
  const result = census(
    () => 'a.md\n',
    () => true,
    () => SELF_DOC,
  );
  assert.equal(result.sameFileAnchors, 1);
  assert.deepEqual(result.staleAnchors, []);
});

test('census reports a same-file anchor that names no heading', () => {
  const doc = ['# Doc', '', '## Real Heading', '', '[x](#imagined-heading)'].join('\n');
  const result = census(
    () => 'a.md\n',
    () => true,
    () => doc,
  );
  assert.equal(result.sameFileAnchors, 1);
  assert.deepEqual(result.staleAnchors, ['a.md:5 -> #imagined-heading']);
});

test('a same-file anchor is not counted as a cross-file section-naming link', () => {
  const result = census(
    () => 'a.md\n',
    () => true,
    () => SELF_DOC,
  );
  assert.equal(result.checkedAnchors, 0, 'folding the two would flatter the specificity ratio');
  assert.equal(result.sameFileAnchors, 1);
  assert.equal(result.fragmentless, 0);
});

test('a same-file anchor inside a fenced block is skipped and counted', () => {
  const doc = ['# Doc', '', '```md', '[x](#nowhere)', '```'].join('\n');
  const result = census(
    () => 'a.md\n',
    () => true,
    () => doc,
  );
  assert.equal(result.fenced, 1);
  assert.equal(result.sameFileAnchors, 0);
  assert.deepEqual(result.staleAnchors, []);
});

test('a same-file anchor in an inline code span is not a link', () => {
  const { links } = collectLinks('Write `[x](#anchor)` to link.');
  assert.equal(links.length, 0);
});

test('the specificity share is taken over cross-file links only', () => {
  const lines = scopeLines({
    files: 1,
    total: 10,
    fenced: 0,
    fragmentless: 3,
    checkedAnchors: 1,
    sameFileAnchors: 6,
  });
  // 3 of 4 cross-file links, not 3 of 10. Both the share and the residual must use the
  // cross-file denominator: over `total` the share reads 30.0% and the residual reads 6,
  // and 6 unclassified links is a plausible-looking number that names nothing real.
  assert.match(lines[1], /of 4 cross-file link\(s\), 3 name only a markdown file \(75\.0%\)/);
  assert.match(lines[1], /0 point at a file that does not exist/);
  assert.doesNotMatch(lines[1], /30\.0%/);
  assert.match(lines[2], /6 link\(s\) of the form/);
});

test('the residual counts links whose target is missing, not same-file anchors', () => {
  const lines = scopeLines({
    files: 1,
    total: 9,
    fenced: 0,
    fragmentless: 2,
    checkedAnchors: 1,
    sameFileAnchors: 5,
  });
  // cross = 4; 2 fragmentless + 1 resolved leaves exactly 1 unresolved.
  assert.match(lines[1], /of 4 cross-file link\(s\)/);
  assert.match(lines[1], /1 point at a file that does not exist/);
});

test('the green report names both anchor populations', () => {
  const { lines, failed } = reportLines(
    {
      files: 1,
      total: 9,
      fenced: 0,
      broken: [],
      staleAnchors: [],
      fragmentless: 0,
      checkedAnchors: 2,
      sameFileAnchors: 7,
    },
    { baseline: [], staleBaseline: [] },
  );
  assert.equal(failed, false);
  const claim = lines.find((l) => l.startsWith('All 2 cross-file'));
  assert.ok(claim, 'the success line must name the count it verified');
  assert.match(claim, /All 2 cross-file section-naming link\(s\) and 7 same-file anchor\(s\)/);
});

test('the green report does not report the same population twice', () => {
  const { lines } = reportLines(
    {
      files: 1,
      total: 9,
      fenced: 0,
      broken: [],
      staleAnchors: [],
      fragmentless: 0,
      checkedAnchors: 2,
      sameFileAnchors: 7,
    },
    { baseline: [], staleBaseline: [] },
  );
  const claim = lines.find((l) => l.startsWith('All 2 cross-file'));
  // A mutant printing checkedAnchors for both halves reads as a plausible sentence.
  assert.doesNotMatch(claim, /and 2 same-file/);
  assert.doesNotMatch(claim, /All 7 cross-file/);
});

test('a stale same-file anchor fails the report on the same axis as a cross-file one', () => {
  const { lines, failed } = reportLines(
    {
      files: 1,
      total: 1,
      fenced: 0,
      broken: [],
      staleAnchors: ['a.md:5 -> #imagined-heading'],
      fragmentless: 0,
      checkedAnchors: 0,
      sameFileAnchors: 1,
    },
    { baseline: [], staleBaseline: [] },
  );
  assert.equal(failed, true);
  assert.ok(lines.some((l) => l === '1 stale anchor(s):'));
  // Scope prints on the red path too, so a failure still says what was measured.
  assert.ok(lines.some((l) => l.startsWith('Same-file anchors: 1 link(s)')));
});

test('scopeLines tolerates a census taken before same-file anchors existed', () => {
  const lines = scopeLines({ files: 1, total: 4, fenced: 0, fragmentless: 3, checkedAnchors: 1 });
  assert.match(lines[1], /of 4 cross-file link\(s\)/);
  assert.match(lines[2], /Same-file anchors: 0 link\(s\)/);
});

// --- non-markdown targets, previously dropped before being counted (#4301) ---

test('a link to a source file is collected, not dropped (#4301)', () => {
  const { links } = collectLinks('See [aria](../apps/web/src/accessibility/aria.ts) here.');
  assert.equal(links.length, 1);
  assert.equal(links[0].target, '../apps/web/src/accessibility/aria.ts');
  assert.equal(links[0].sameFile, false);
  assert.equal(links[0].repoRelative, false);
});

test('a link to a directory is collected (#4301)', () => {
  const { links } = collectLinks('See [fn](../../services/api/supabase/functions/x/) here.');
  assert.equal(links.length, 1);
  assert.equal(links[0].target, '../../services/api/supabase/functions/x/');
});

test('every non-markdown extension present in the corpus is collected (#4301)', () => {
  // The dropped population was 470 .kt, 341 .swift, 126 directory, 68 .ts, 22 .tsx and
  // eleven further extensions. Enumerated rather than sampled: a filter that dropped all
  // of them was invisible precisely because no single case was ever asserted.
  const extensions = [
    '.kt',
    '.swift',
    '.ts',
    '.tsx',
    '.yml',
    '.sql',
    '.example',
    '.yaml',
    '.xml',
    '.json',
    '.ps1',
    '.sh',
    '.css',
    '.mjs',
    '.kts',
    '.txt',
    '.js',
  ];
  for (const ext of extensions) {
    const { links } = collectLinks(`[x](../a/b${ext})`);
    assert.equal(links.length, 1, `a link to a ${ext} file must be collected`);
    assert.equal(links[0].target, `../a/b${ext}`);
  }
});

test('a broken link to a source file fails the census (#4301)', () => {
  const result = census(
    () => 'a.md',
    (p) => p === 'ok.ts',
    () => '# T\n\n[good](ok.ts) [bad](gone.ts)\n',
  );
  assert.deepEqual(result.broken, ['a.md -> gone.ts']);
  assert.equal(result.nonMarkdown, 1);
});

test('a non-markdown target with a fragment is not resolved as an anchor (#4301)', () => {
  // There is no heading structure in a .ts file, so counting it as a checked anchor would
  // overstate the anchor check's reach -- the figure whose whole purpose is to be honest
  // about how little of the corpus it reaches.
  const result = census(
    () => 'a.md',
    () => true,
    () => '# T\n\n[x](y.ts#L40)\n',
  );
  assert.equal(result.checkedAnchors, 0);
  assert.equal(result.nonMarkdown, 1);
  assert.deepEqual(result.staleAnchors, []);
});

test('a directory target never reaches read(), which would throw EISDIR (#4301)', () => {
  // exists() passing does not imply read() will succeed. Reading a directory throws, and
  // an uncaught throw takes the whole gate down rather than reporting a finding.
  const result = census(
    () => 'a.md',
    () => true,
    (p) => {
      if (p === 'sub') throw Object.assign(new Error('EISDIR'), { code: 'EISDIR' });
      return '# T\n\n[x](sub#frag)\n';
    },
    (p) => p === 'sub',
  );
  assert.deepEqual(result.broken, []);
  assert.equal(result.nonMarkdown, 1);
});

// --- GitHub repo-relative idiom (#4301) ---

test('GitHub repo-relative targets are recognised (#4301)', () => {
  for (const t of [
    '../../issues/2609',
    '../../pull/44',
    '../../discussions/7',
    '../../tree/main/apps',
    '../../blob/main/a.ts',
    '../../releases/tag/v1',
  ]) {
    assert.equal(isRepoRelative(t), true, `${t} is GitHub repo-relative`);
  }
});

test('a path that merely contains a repo word is not repo-relative (#4301)', () => {
  // Over-reporting and under-reporting are both wrong; this guards the direction that
  // silently excuses a real broken link.
  for (const t of ['../issues.md', '../a/issuesx/b.ts', '../pullover.ts', '../my-issues.png']) {
    assert.equal(isRepoRelative(t), false, `${t} is an ordinary path`);
  }
});

test('a repo-relative link is counted but not resolved (#4301)', () => {
  // 40 such links exist here and an earlier census reported every one as broken -- 62
  // against 22 real. A checker that cries wolf makes its own exemption a rubber stamp.
  const result = census(
    () => 'a.md',
    () => false,
    () => '# T\n\n[#2609](../../issues/2609)\n',
  );
  assert.deepEqual(result.broken, []);
  assert.equal(result.repoRelative, 1);
});

// --- explicit HTML anchors (#4301) ---

test('an explicit <a id> anchor is offered by the document (#4301)', () => {
  const slugs = headingSlugs('# T\n\n<a id="spot"></a>\n');
  assert.ok(slugs.has('spot'));
  assert.ok(slugs.has('t'));
});

test('an explicit <a name> anchor is offered too (#4301)', () => {
  assert.ok(headingSlugs('<a name="legacy"></a>').has('legacy'));
});

test('an explicit anchor is matched verbatim, not slugified (#4301)', () => {
  // The author wrote the id the link has to match; GitHub does not transform it.
  const slugs = headingSlugs('<a id="Mixed_Case-42"></a>');
  assert.ok(slugs.has('Mixed_Case-42'));
  assert.equal(slugs.has('mixed_case-42'), false);
});

test('an explicit anchor inside a fenced block is not offered (#4301)', () => {
  assert.equal(headingSlugs('```html\n<a id="shown"></a>\n```\n').has('shown'), false);
});

test('a link to an explicit anchor is not reported stale (#4301)', () => {
  // finance's corpus contains zero explicit anchors, so this defect was green over an
  // empty population -- indistinguishable in the output from green over a checked one.
  const result = census(
    () => 'a.md',
    () => true,
    () => '# T\n\n<a id="spot"></a>\n\n[x](#spot)\n',
  );
  assert.deepEqual(result.staleAnchors, []);
  assert.equal(result.sameFileAnchors, 1);
});

// --- the scope line has to widen with the reach (#4301) ---

test('the scope line names the newly-checked populations (#4301)', () => {
  const lines = scopeLines({
    files: 1,
    total: 10,
    fenced: 0,
    fragmentless: 4,
    checkedAnchors: 1,
    sameFileAnchors: 2,
    nonMarkdown: 2,
    repoRelative: 1,
  });
  assert.match(lines[1], /2 point at source or a directory and were checked for existence only/);
  assert.match(lines[1], /1 are GitHub repo-relative/);
  // 8 cross-file - 4 fragmentless - 1 anchor - 2 non-markdown - 1 repo-relative = 0
  assert.match(lines[1], /0 point at a file that does not exist/);
});

test('the disclaimer no longer claims non-markdown links are unmeasured (#4301)', () => {
  // A disclaimer is the one kind of prose that fails toward false assurance when stale:
  // it under-claims, which reads as caution, so nothing about it invites a second look.
  const lines = scopeLines({ files: 1, total: 1, fenced: 0, fragmentless: 1, checkedAnchors: 0 });
  const notMeasured = lines.slice(3).join(' ');
  assert.equal(
    /links to non-markdown files/.test(notMeasured),
    false,
    'the "Not measured" note must not still disclaim a population that is now checked',
  );
  assert.match(notMeasured, /the contents of a non-markdown target/);
});

test('the unresolved baseline separates never-true targets from moved ones (#4301)', () => {
  // Rewritten in #4327. The original asserted `length === 2` over entries matching
  // fire-calculator.ts, under a test name claiming it separated never-true from moved. That
  // assertion is satisfied by either classification, so the property in the name was never
  // checked -- and when the entries were finally verified against git history, both turned
  // out to be *moved*, the opposite of what the surrounding comment said.
  const classified = UNRESOLVED_ENTRIES.filter((e) => /^(moved|never written):/.test(e.reason));
  assert.equal(classified.length, UNRESOLVED_ENTRIES.length);
  const fire = UNRESOLVED_ENTRIES.filter((e) => e.target.includes('fire-calculator.ts'));
  assert.equal(fire.length, 2);
  for (const entry of fire) assert.match(entry.reason, /^moved:/);
});

test('every baselined target carries a reason (#4327)', () => {
  for (const entry of UNRESOLVED_ENTRIES) {
    assert.equal(typeof entry.reason, 'string', `${entry.target} has no reason`);
    assert.match(entry.reason, /[a-z]/, `${entry.target} reason has no prose`);
    // unsourced-bound: 40 characters is a judgement, not a measurement -- it is long enough
    // to require a clause rather than a word, and short enough that no current reason is near
    // it. Its purpose is to reject `reason: 'legacy'`, not to certify anything above it.
    assert.ok(entry.reason.length >= 40, `${entry.target} reason is too thin to check`);
  }
});

test('a reason is attached to an entry, not to a position in the list', () => {
  // The defect this replaced: prose above the array said "the last two entries" are the
  // never-true kind. Those entries sat at positions 9 and 10 of 11, because the array is
  // sorted and the author appended mentally rather than positionally. Sorting the entries
  // must not change any reason's subject.
  const sorted = [...UNRESOLVED_ENTRIES].sort((a, b) => a.target.localeCompare(b.target));
  const shuffled = [...UNRESOLVED_ENTRIES].reverse();
  const pairs = (list) => list.map((e) => `${e.target}::${e.reason}`).sort();
  assert.deepEqual(pairs(sorted), pairs(shuffled));
});

test('the derived baseline cannot drift from the reason-bearing entries', () => {
  assert.deepEqual(
    UNRESOLVED_BASELINE,
    UNRESOLVED_ENTRIES.map((e) => e.target),
  );
});
