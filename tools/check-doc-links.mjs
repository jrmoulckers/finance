#!/usr/bin/env node
/**
 * Verify that relative markdown links point at files that exist.
 *
 * The vendored citation checker only follows links whose target sits under
 * `principles/`. That filter is the publisher's, not this repository's fork -- it is
 * `scripts/check-citations.mjs` upstream -- and finance has no `principles/` directory,
 * so the filter matches nothing here and every relative link is verified by nothing.
 *
 * A moved file leaves the citing document syntactically intact, so nothing in a lint or
 * format pass notices. This check closes that gap for existence, and for the one further
 * case a link can express: when the link names a section, that the section still exists.
 *
 * The second case bounds itself. Only 7.3% of this repository's relative links name a
 * section at all; the rest assert no more than "this file is relevant", which almost no
 * content change falsifies. That limit is a property of the citing sentences, not of this
 * check, so the specificity split is printed rather than left implicit -- see `scopeLines`.
 *
 * Cites ENG-OBS-004.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const FENCE = /^\s*(?:```|~~~)/;
const INLINE_CODE = /`[^`]*`/g;

/**
 * Stale anchors this repository accepts. Empty, and it should stay that way: unlike
 * `UNRESOLVED_BASELINE`, a stale anchor is never a gap awaiting a document that does not
 * exist yet -- the target file is present and simply no longer has the heading. Every such
 * link is repointable now, so there is nothing to grandfather.
 *
 * Asserted in tests as a literal rather than as `STALE_ANCHOR_BASELINE.length`: a ratchet
 * phrased in terms of itself moves when the constant moves and cannot detect being
 * loosened.
 */
export const STALE_ANCHOR_BASELINE = [];

/**
 * Targets that name a document this repository has never contained. Each is a real gap in
 * the docs rather than a stale path, so the fix is to write the document or drop the
 * reference -- neither of which this check should guess at. The list is a ratchet: it may
 * shrink, and any target not on it fails.
 */
export const UNRESOLVED_BASELINE = [
  'docs/architecture/0005-design-system-approach.md -> ./0002-cross-platform-framework-selection.md',
  'docs/architecture/0006-cicd-strategy.md -> ./0002-cross-platform-framework-selection.md',
  'docs/architecture/0009-legal-monetization-analysis.md -> ./0008-competitive-protection-strategy.md',
  'docs/architecture/0018-offline-conflict-resolution.md -> ./sync-architecture.md',
  'docs/architecture/overview.md -> ./sync-architecture.md',
  'docs/business/marketing/marketing-plan-sprints-6-10.md -> growth-strategy-post-launch.md',
  'docs/business/marketing/marketing-plan-sprints-6-10.md -> launch-retrospective-week-1.md',
  'docs/business/marketing/marketing-plan-sprints-6-10.md -> review-strategy.md',
  'docs/guides/release-process.md -> ../audits/accessibility-checklist.md',
];

/**
 * Slugify a heading the way GitHub's renderer does.
 *
 * Two details here are not cosmetic; each one, alone, produced a confident list of false
 * positives when this was first measured:
 *
 * 1. Spaces are replaced **one for one**, not collapsed. Removing punctuation leaves the
 *    surrounding spaces behind, so `Android distribution -- Google Play` renders an anchor
 *    with a *double* hyphen. A `\s+` collapse mis-slugged 89 valid links as stale.
 * 2. U+FE0F (variation selector) survives. GitHub strips the warning sign from a heading
 *    beginning with a warning emoji but keeps the selector, so the real anchor begins with
 *    an invisible character. Stripping it mis-slugged a further 3.
 * 3. The trim happens **before** the strip, not after. GitHub trims the raw heading text,
 *    so punctuation removed from the front leaves its space behind and the anchor begins
 *    with a hyphen: `## 🚀 Getting Started` is `#-getting-started`. Trimming afterwards
 *    swallows that hyphen and mis-slugged 7 valid links in `docs/INDEX.md`.
 *
 * 96.8% of the first reported stale count was this function disagreeing with the renderer,
 * and nothing about a wrong slugger looks wrong -- it names real files and plausible
 * anchors. All three cases are covered by tests for that reason.
 *
 * Case 3 was written four lines below the note describing cases 1 and 2, and survived
 * because the only links that exercise it are same-file anchors, which this checker did
 * not read at all. A defect and the checked population can fail to intersect, and then a
 * green result is evidence about that intersection rather than about the corpus.
 *
 * @param {string} heading
 * @returns {string}
 */
export function slugify(heading) {
  return String(heading)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\uFE0F-]/g, '')
    .replace(/\s/g, '-');
}

/**
 * Every anchor a document offers: one per heading, outside fenced blocks.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function headingSlugs(text) {
  const slugs = new Set();
  for (const { line, fenced } of markFences(text)) {
    if (fenced) continue;
    const match = line.match(/^#{1,6}\s+(.*?)\s*$/);
    if (match) slugs.add(slugify(match[1]));
  }
  return slugs;
}

/**
 * Split a document into lines, marking which are inside a fenced code block.
 *
 * A census that reads fenced blocks reports illustrative paths as real links. The census
 * that first measured this defect in the citation checker was itself fence-blind and
 * reported an elided example as a broken link, so this is measured rather than assumed:
 * the count of skipped links is printed.
 *
 * @param {string} text
 * @returns {{ line: string, fenced: boolean }[]}
 */
export function markFences(text) {
  let fenced = false;
  return String(text)
    .split('\n')
    .map((line) => {
      if (FENCE.test(line)) {
        fenced = !fenced;
        return { line, fenced: true };
      }
      return { line, fenced };
    });
}

/**
 * Collect markdown links from one document: relative `.md` targets, and same-file anchors.
 *
 * Same-file anchors (`[text](#section)`) were excluded here until they were counted. They
 * are the largest link class in this repository -- 2,799 against 246 cross-file fragments,
 * 11.4x -- and none of them had ever been resolved. They are also the *most* falsifiable
 * kind of link: a same-file anchor names a section and nothing else, so any rename or
 * renumber of that heading breaks it, with no path change to make the break visible.
 *
 * @param {string} text
 * @returns {{ links: {href: string, target: string, fragment: string, sameFile: boolean, line: number}[], skipped: number }}
 */
export function collectLinks(text) {
  const links = [];
  let skipped = 0;
  const marked = markFences(text);
  for (let i = 0; i < marked.length; i += 1) {
    // Blank out inline code spans so a path shown as `../x.md` is not read as a link.
    const line = marked[i].line.replace(INLINE_CODE, (m) => ' '.repeat(m.length));
    for (const match of line.matchAll(LINK)) {
      const href = match[1];
      if (href.startsWith('#')) {
        if (marked[i].fenced) {
          skipped += 1;
          continue;
        }
        links.push({
          href,
          target: '',
          fragment: href.slice(1).trim(),
          sameFile: true,
          line: i + 1,
        });
        continue;
      }
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
      const hash = href.indexOf('#');
      const target = (hash === -1 ? href : href.slice(0, hash)).trim();
      if (!target.endsWith('.md')) continue;
      if (marked[i].fenced) {
        skipped += 1;
        continue;
      }
      const fragment = hash === -1 ? '' : href.slice(hash + 1).trim();
      links.push({ href, target, fragment, sameFile: false, line: i + 1 });
    }
  }
  return { links, skipped };
}

/**
 * Walk every tracked markdown file and resolve its relative links.
 *
 * @param {(args: string[]) => string} git
 * @param {(p: string) => boolean} exists
 * @param {(p: string) => string} read
 * @returns {{files: number, total: number, fenced: number, broken: string[], staleAnchors: string[], fragmentless: number, checkedAnchors: number}}
 */
export function census(git, exists, read) {
  const files = git(['ls-files', '*.md']).trim().split('\n').filter(Boolean);
  const broken = [];
  const staleAnchors = [];
  const anchorCache = new Map();
  let total = 0;
  let fenced = 0;
  let fragmentless = 0;
  let checkedAnchors = 0;
  let sameFileAnchors = 0;

  const anchorsOf = (p) => {
    if (!anchorCache.has(p)) anchorCache.set(p, headingSlugs(read(p)));
    return anchorCache.get(p);
  };

  for (const file of files) {
    const { links, skipped } = collectLinks(read(file));
    fenced += skipped;
    for (const link of links) {
      total += 1;

      if (link.sameFile) {
        // A same-file anchor cannot have a broken path, so it goes straight to resolution.
        // It is counted in its own population: folding it into `checkedAnchors` would let
        // 2,799 newly-checked links inflate a figure whose whole purpose is to say how
        // little of the corpus the anchor check reaches.
        sameFileAnchors += 1;
        let decodedSelf = link.fragment;
        try {
          decodedSelf = decodeURIComponent(link.fragment);
        } catch {
          // Compared as written; the renderer does not decode it either.
        }
        if (!anchorsOf(file.split(path.sep).join('/')).has(slugify(decodedSelf))) {
          staleAnchors.push(`${file}:${link.line} -> ${link.href}`);
        }
        continue;
      }

      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(file.split(path.sep).join('/')), link.target),
      );
      if (!exists(resolved)) {
        broken.push(`${file} -> ${link.href}`);
        continue;
      }
      if (!link.fragment) {
        fragmentless += 1;
        continue;
      }
      // A link that names a section is the only kind a moved-content change can falsify,
      // so it is the only kind worth resolving further.
      checkedAnchors += 1;
      let decoded = link.fragment;
      try {
        decoded = decodeURIComponent(link.fragment);
      } catch {
        // A fragment that is not valid percent-encoding is compared as written rather
        // than reported as stale; the renderer does not decode it either.
      }
      if (!anchorsOf(resolved).has(slugify(decoded))) {
        staleAnchors.push(`${file}:${link.line} -> ${link.href}`);
      }
    }
  }
  return {
    files: files.length,
    total,
    fenced,
    broken,
    staleAnchors,
    fragmentless,
    checkedAnchors,
    sameFileAnchors,
  };
}

/**
 * Lines describing what was and was not measured, printed on both the passing and the
 * failing path. A control that reports its population only when it passes cannot be
 * distinguished from one that measured nothing.
 *
 * The specificity split is printed because it bounds what this check can ever find. A link
 * naming only a file asserts "this file is relevant", and almost no content change
 * falsifies that; a link naming a section asserts something a heading rename breaks. That
 * is a property of the citing sentence, not of the instrument, so no improvement here
 * reaches the majority -- the only fix is to write a more specific link. Stating the split
 * keeps a green result from reading as "the docs are verified".
 *
 * Same-file anchors are reported separately rather than added to `checkedAnchors`. They
 * are the most falsifiable class here and the last one to be checked, so merging them
 * would improve the ratio this paragraph exists to disclose -- a scope line that gets
 * flattered by a fix is not measuring what it claims to.
 *
 * @param {{files: number, total: number, fenced: number, fragmentless: number, checkedAnchors: number, sameFileAnchors?: number}} scope
 * @returns {string[]}
 */
export function scopeLines({
  files,
  total,
  fenced,
  fragmentless,
  checkedAnchors,
  sameFileAnchors = 0,
}) {
  const cross = total - sameFileAnchors;
  const share = cross === 0 ? '0.0' : ((100 * fragmentless) / cross).toFixed(1);
  const unresolved = cross - fragmentless - checkedAnchors;
  return [
    `Scope: ${total} markdown link(s) across ${files} tracked file(s); ${fenced} inside fenced blocks were skipped.`,
    `Specificity: of ${cross} cross-file link(s), ${fragmentless} name only a file (${share}%); ${checkedAnchors} name a section and had their anchor resolved; ${unresolved} point at a file that does not exist and were not classified.`,
    `Same-file anchors: ${sameFileAnchors} link(s) of the form [text](#section), every one resolved against its own document's headings.`,
    'Not measured: URL targets, links to non-markdown files, or whether a target still',
    'contains the content the citing text claims. A file that keeps its name while its',
    'content moves elsewhere stays green here unless the link named the section that moved.',
  ];
}

/**
 * The full report, as lines, for a given census.
 *
 * This is exported rather than inlined into `main()` because the numbers here are the
 * half that testing usually misses. Every assertion in this file's suite covered the
 * *computation*; none read the *sentence*. A count can be correct and still be
 * interpolated into the wrong noun, and no test over `census()` can see that.
 *
 * The pair below is the specific hazard. `broken` counts occurrences and the baseline
 * names distinct targets -- three targets here are linked from two places apiece, so the
 * two numbers genuinely differ, and printing one as the other reports twelve gaps against
 * a nine-entry list and invites exactly the wrong correction. That confusion is old enough
 * to have been written into a comment, and it still had no assertion until now.
 *
 * @param {{files: number, total: number, fenced: number, broken: string[], staleAnchors: string[], fragmentless: number, checkedAnchors: number}} result
 * @param {{baseline?: string[], staleBaseline?: string[]}} [options]
 * @returns {{lines: string[], failed: boolean}}
 */
export function reportLines(result, options = {}) {
  const { broken, staleAnchors, checkedAnchors, sameFileAnchors = 0 } = result;
  const baseline = options.baseline ?? UNRESOLVED_BASELINE;
  const staleBaseline = options.staleBaseline ?? STALE_ANCHOR_BASELINE;

  const baselineSet = new Set(baseline);
  const unexpected = broken.filter((b) => !baselineSet.has(b));
  const fixed = [...baselineSet].filter((b) => !broken.includes(b));
  const unexpectedAnchors = staleAnchors.filter((a) => !staleBaseline.includes(a));
  const distinctBroken = new Set(broken).size;

  const lines = [];
  let failed = false;

  if (unexpected.length > 0) {
    failed = true;
    lines.push(`${unexpected.length} broken relative markdown link(s):`);
    for (const b of unexpected) lines.push(`  ${b}`);
    lines.push('');
    lines.push('A moved or renamed file leaves the citing document syntactically intact,');
    lines.push('so nothing in a lint or format pass notices. Repoint or remove the link.');
    lines.push('');
  }

  if (unexpectedAnchors.length > 0) {
    failed = true;
    lines.push(`${unexpectedAnchors.length} stale anchor(s):`);
    for (const a of unexpectedAnchors) lines.push(`  ${a}`);
    lines.push('');
    lines.push('The target file exists and the link is syntactically intact, but no heading');
    lines.push('in it produces this anchor. The section was renamed, renumbered, or moved;');
    lines.push('a reader following the link lands at the top of the document instead.');
    lines.push('');
  }

  // Both axes report before the verdict. Failing on the first one found would let broken
  // paths mask every stale anchor: the reader repoints the paths, sees green, and
  // concludes the anchors had been checked all along.
  if (failed) {
    lines.push(...scopeLines(result));
    lines.push(
      `${broken.length} broken occurrence(s) over ${distinctBroken} distinct target(s); ${baselineSet.size - fixed.length} of those targets are recorded gaps where the document does not exist.`,
    );
    return { lines, failed };
  }

  lines.push('All resolvable relative markdown links point at files that exist.');
  // Both anchor populations, named separately. `checkedAnchors` alone would report 246
  // where 3,042 links were resolved, understating the check by a factor of twelve -- and
  // an understated success line is the direction that reads as modest rather than wrong,
  // so nothing about it invites a second look.
  lines.push(
    `All ${checkedAnchors} cross-file section-naming link(s) and ${sameFileAnchors} same-file anchor(s) resolve to a heading that exists.`,
  );
  lines.push(...scopeLines(result));
  lines.push(
    `${distinctBroken} recorded gap(s) remain across ${broken.length} link(s), where the target names a document this repository has never contained.`,
  );
  if (fixed.length > 0) {
    lines.push('');
    lines.push(
      `${fixed.length} recorded gap(s) no longer broken -- remove them from the baseline:`,
    );
    for (const f of fixed) lines.push(`  ${f}`);
    return { lines, failed: true };
  }
  return { lines, failed: false };
}

function main() {
  const git = (args) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const root = process.cwd();
  const exists = (p) => fs.existsSync(path.join(root, p));
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

  const result = census(git, exists, read);
  const { lines, failed } = reportLines(result);
  const write = failed ? console.error : console.log;
  for (const line of lines) write(line);
  if (failed) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('check-doc-links.mjs')) {
  main();
}
