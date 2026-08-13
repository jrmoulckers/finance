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

import { markFences } from './lib/markdown.mjs';

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const INLINE_CODE = /`[^`]*`/g;

/**
 * An explicit anchor a document offers outside its heading structure.
 *
 * `headingSlugs` once collected `#` headings and nothing else, which made every link to an
 * `<a id>` target a reported stale anchor. finance's corpus contains zero of these, so the
 * defect was invisible: the check was green because its population was empty, which reads
 * in the output exactly like green because everything checked passed.
 */
const HTML_ANCHOR = /<a\s[^>]*?\b(?:id|name)\s*=\s*["']([^"']+)["']/gi;

/**
 * Link targets GitHub resolves against the *repository* rather than the file tree.
 *
 * `[#2609](../../issues/2609)` renders correctly and points at nothing on disk. Forty such
 * links exist here, and an earlier census counted every one of them as broken -- 62 reported
 * against 22 real. Reporting them would be a false accusation, and the cost of that is
 * specific: it makes the exemption below a rubber stamp, so the next genuinely broken link
 * gets waved through by an author who has learned the checker cries wolf.
 */
const GITHUB_REPO_RELATIVE =
  /(?:^|\/)(?:issues|pull|discussions|commit|compare|releases|wiki|tree|blob|labels|milestone|projects)(?:\/|$)/;

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
 *
 * The distinction this list encodes is between a target that *moved* and one that was
 * *never true*, which any resolver reports identically and only the first of which is a
 * regression. That distinction used to be recorded as prose naming "the last two entries",
 * and it was false the moment it was written (#4327): the two entries it described were
 * inserted into an alphabetically sorted array at positions 9 and 10 of 11, so they were
 * never last, and the entry that genuinely was last carried no reason at all.
 *
 * Attaching a reason to each entry then falsified the classification itself. Verified
 * against `git log --all --full-history`, the split is 4 moved / 7 never-written, and the
 * prose had it backwards for most of the list -- `./sync-architecture.md` resolves to
 * `0002-backend-sync-architecture.md` in the same directory, and `fire-calculator.ts`
 * existed from #1830 until #3512 deleted it. Both were describable as "never true" for as
 * long as the description named no entry. **A reason addressed to a position, or to a set,
 * cannot be checked against any member of it.**
 *
 * The 4/7 split above is stated here only because the report derives it independently; the
 * first draft of this sentence said 3/8, hand-counted, and the derived line contradicted it
 * on the next run -- which is the same defect one paragraph up, at one paragraph's distance.
 *
 * @type {{target: string, reason: string}[]}
 */
export const UNRESOLVED_ENTRIES = [
  {
    target:
      'docs/architecture/0005-design-system-approach.md -> ./0002-cross-platform-framework-selection.md',
    reason:
      'never written: no file of this name has ever been committed. The cross-platform ' +
      'framework ADR is 0001-cross-platform-framework.md -- wrong number and wrong slug.',
  },
  {
    target:
      'docs/architecture/0006-cicd-strategy.md -> ./0002-cross-platform-framework-selection.md',
    reason:
      'never written: same wrong reference as 0005, pointing at a number and slug that ' +
      'have never coexisted.',
  },
  {
    target:
      'docs/architecture/0009-legal-monetization-analysis.md -> ./0008-competitive-protection-strategy.md',
    reason:
      'never written: there is no ADR 0008 at all -- the sequence skips from 0007 to 0009. ' +
      'The nearest surviving content is docs/marketing/competitive-positioning.md.',
  },
  {
    target: 'docs/architecture/0018-offline-conflict-resolution.md -> ./sync-architecture.md',
    reason:
      'moved: resolves to 0002-backend-sync-architecture.md in the same directory. ' +
      'Repointable, and the prose that called this list never-written was wrong about it.',
  },
  {
    target: 'docs/architecture/overview.md -> ./sync-architecture.md',
    reason: 'moved: same target as 0018, same resolution to 0002-backend-sync-architecture.md.',
  },
  {
    target:
      'docs/business/marketing/marketing-plan-sprints-6-10.md -> growth-strategy-post-launch.md',
    reason:
      'never written: docs/business/marketing/ holds three files and this is not among them; ' +
      'zero commits have ever touched this path.',
  },
  {
    target:
      'docs/business/marketing/marketing-plan-sprints-6-10.md -> launch-retrospective-week-1.md',
    reason: 'never written: planned companion document, zero commits against this path.',
  },
  {
    target: 'docs/business/marketing/marketing-plan-sprints-6-10.md -> review-strategy.md',
    reason: 'never written: planned companion document, zero commits against this path.',
  },
  {
    target:
      'docs/design/ios-fi-calculator-flow.md -> ../../apps/web/src/lib/investment/fire-calculator.ts',
    reason:
      'moved: the file existed from #1830 until #3512 deleted it, consolidating the FIRE ' +
      'engines. calculateFINumber and calculateCoastFI occur zero times in the tree today, ' +
      'so repointing at fire-planning.ts would green the gate while making the citing ' +
      'sentence false.',
  },
  {
    target:
      'docs/design/ios-fire-results-goal-integration.md -> ../../apps/web/src/lib/investment/fire-calculator.ts',
    reason: 'moved: same deleted file as ios-fi-calculator-flow.md, deleted by #3512.',
  },
  {
    target: 'docs/guides/release-process.md -> ../audits/accessibility-checklist.md',
    reason:
      'never written: zero commits against this path. This is the entry the positional ' +
      'prose left unexplained -- it was last, and the prose that said "the last two ' +
      'entries" named two others.',
  },
];

/**
 * Baseline targets, derived from the reason-bearing entries.
 *
 * Derived rather than maintained separately: a second literal list would let the two drift,
 * and the drift would be invisible because only this one is consumed.
 */
export const UNRESOLVED_BASELINE = UNRESOLVED_ENTRIES.map((e) => e.target);

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
 * Every anchor a document offers: one per heading outside fenced blocks, plus any explicit
 * `<a id>` / `<a name>` target.
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
    // An explicit anchor is offered verbatim, not slugified: the author wrote the id the
    // link has to match.
    for (const anchor of line.matchAll(HTML_ANCHOR)) slugs.add(anchor[1]);
  }
  return slugs;
}

/**
 * Whether a relative target is GitHub's repo-relative idiom rather than a filesystem path.
 *
 * @param {string} target
 * @returns {boolean}
 */
export function isRepoRelative(target) {
  return GITHUB_REPO_RELATIVE.test(target);
}

/**
 * Split a document into lines, marking which are inside a fenced code block.
 *
 * A census that reads fenced blocks reports illustrative paths as real links. The census
 * that first measured this defect in the citation checker was itself fence-blind and
 * reported an elided example as a broken link, so this is measured rather than assumed:
 * the count of skipped links is printed.
 *
 * Re-exported from `lib/markdown.mjs`, where it now lives so other scanners can share it. It was
 * exported from here for months with zero external importers while two other tools rediscovered
 * the same guard; being importable is not the same as being imported.
 */
export { markFences };

/**
 * Collect markdown links from one document: relative targets of any kind, and same-file
 * anchors.
 *
 * Same-file anchors (`[text](#section)`) were excluded here until they were counted. They
 * are the largest link class in this repository -- 2,799 against 246 cross-file fragments,
 * 11.4x -- and none of them had ever been resolved. They are also the *most* falsifiable
 * kind of link: a same-file anchor names a section and nothing else, so any rename or
 * renumber of that heading breaks it, with no path change to make the break visible.
 *
 * Non-`.md` targets were excluded here too, by `if (!target.endsWith('.md')) continue`, and
 * that exclusion was worse than the anchor one because it dropped links *before counting
 * them*. 1,110 links -- 470 `.kt`, 341 `.swift`, 126 directory targets, 68 `.ts` -- appeared
 * in no population, no scope line and no finding, while the scope line reported a total that
 * silently excluded them. 22 were broken. A filter applied before the census is invisible to
 * every number the census prints, including the ones whose purpose is to state its reach.
 *
 * @param {string} text
 * @returns {{ links: {href: string, target: string, fragment: string, sameFile: boolean, repoRelative: boolean, line: number}[], skipped: number }}
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
          repoRelative: false,
          line: i + 1,
        });
        continue;
      }
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
      const hash = href.indexOf('#');
      const target = (hash === -1 ? href : href.slice(0, hash)).trim();
      if (!target) continue;
      if (marked[i].fenced) {
        skipped += 1;
        continue;
      }
      const fragment = hash === -1 ? '' : href.slice(hash + 1).trim();
      links.push({
        href,
        target,
        fragment,
        sameFile: false,
        repoRelative: isRepoRelative(target),
        line: i + 1,
      });
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
export function census(git, exists, read, isDirectory = () => false) {
  const files = git(['ls-files', '*.md']).trim().split('\n').filter(Boolean);
  const broken = [];
  const staleAnchors = [];
  const anchorCache = new Map();
  let total = 0;
  let fenced = 0;
  let fragmentless = 0;
  let checkedAnchors = 0;
  let sameFileAnchors = 0;
  let nonMarkdown = 0;
  let repoRelative = 0;

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

      if (link.repoRelative) {
        // GitHub renders these against the repository. They point at nothing on disk and
        // are correct as written, so they are counted and not resolved.
        repoRelative += 1;
        continue;
      }

      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(file.split(path.sep).join('/')), link.target),
      );
      if (!exists(resolved)) {
        broken.push(`${file} -> ${link.href}`);
        continue;
      }
      if (!link.target.endsWith('.md')) {
        // Existence is the whole claim a link to source or to a directory can make. There
        // is no heading structure to resolve a fragment against, so counting it as a
        // checked anchor would overstate the anchor check's reach.
        nonMarkdown += 1;
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
      if (isDirectory(resolved)) {
        // Unreachable for a `.md` target in practice, but `exists` passing does not imply
        // `read` will succeed, and reading a directory throws EISDIR -- which would take
        // the whole gate down rather than report a finding.
        nonMarkdown += 1;
        continue;
      }
      if (!anchorsOf(resolved).has(slugify(decoded))) {
        staleAnchors.push(`${file}:${link.line} -> ${link.href}`);
      }
    }
  }
  return {
    files: files.length,
    scanned: files,
    total,
    fenced,
    broken,
    staleAnchors,
    fragmentless,
    checkedAnchors,
    sameFileAnchors,
    nonMarkdown,
    repoRelative,
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
 * `Not measured` once read "links to non-markdown files". That sentence was true when
 * written and became false the moment those 1,110 links were checked. A disclaimer is the
 * one kind of prose that fails toward *false assurance* when it goes stale -- it under-claims,
 * which reads as caution -- so it has to be edited in the same commit that widens the reach
 * it disclaims.
 *
 * @param {{files: number, total: number, fenced: number, fragmentless: number, checkedAnchors: number, sameFileAnchors?: number, nonMarkdown?: number, repoRelative?: number}} scope
 * @returns {string[]}
 */
export function scopeLines({
  files,
  total,
  fenced,
  fragmentless,
  checkedAnchors,
  sameFileAnchors = 0,
  nonMarkdown = 0,
  repoRelative = 0,
}) {
  const cross = total - sameFileAnchors;
  const share = cross === 0 ? '0.0' : ((100 * fragmentless) / cross).toFixed(1);
  const unresolved = cross - fragmentless - checkedAnchors - nonMarkdown - repoRelative;
  return [
    `Scope: ${total} markdown link(s) across ${files} tracked file(s); ${fenced} inside fenced blocks were skipped.`,
    `Specificity: of ${cross} cross-file link(s), ${fragmentless} name only a markdown file (${share}%); ${checkedAnchors} name a section and had their anchor resolved; ${nonMarkdown} point at source or a directory and were checked for existence only; ${repoRelative} are GitHub repo-relative (issues, pull requests) and resolve against the repository rather than the tree; ${unresolved} point at a file that does not exist and were not classified.`,
    `Same-file anchors: ${sameFileAnchors} link(s) of the form [text](#section), every one resolved against its own document's headings.`,
    'Not measured: URL targets, the contents of a non-markdown target, or whether a target',
    'still contains the content the citing text claims. A file that keeps its name while its',
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
  // Derived from the baseline actually in use, not from the module default: an injected
  // baseline must not be described by the real list's classification. An entry with no
  // recorded reason is counted as unclassified rather than silently folded into either kind.
  const reasonFor = new Map(
    (options.entries ?? UNRESOLVED_ENTRIES).map((e) => [e.target, e.reason]),
  );
  const kindOf = (target) => (reasonFor.get(target) ?? '').split(':')[0];
  const moved = baseline.filter((t) => kindOf(t) === 'moved').length;
  const neverWritten = baseline.filter((t) => kindOf(t) === 'never written').length;
  const unclassified = baseline.length - moved - neverWritten;
  const unexpected = broken.filter((b) => !baselineSet.has(b));
  // Staleness is judged only over files this run actually scanned. Without the scope a baseline
  // entry reads as fixed wherever its citing document is simply absent, so the gate failed in
  // every tree but this one -- and a gate that cannot pass on a clean fixture cannot be proven by
  // one (#4351). The residual hole, an entry naming a document that has been deleted, is pinned
  // by a test rather than left to be rediscovered.
  const scanned = Array.isArray(result.scanned) ? new Set(result.scanned) : null;
  const inScope = (entry) => !scanned || scanned.has(entry.split(' -> ')[0]);
  const fixed = [...baselineSet].filter((b) => inScope(b) && !broken.includes(b));
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
    `${distinctBroken} recorded gap(s) remain across ${broken.length} link(s). ${moved} moved and are repointable; ${neverWritten} name a document this repository has never contained${unclassified > 0 ? `; ${unclassified} carry no recorded reason` : ''}.`,
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
  const isDirectory = (p) => {
    try {
      return fs.statSync(path.join(root, p)).isDirectory();
    } catch {
      return false;
    }
  };

  const result = census(git, exists, read, isDirectory);
  const { lines, failed } = reportLines(result);
  const write = failed ? console.error : console.log;
  for (const line of lines) write(line);
  if (failed) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('check-doc-links.mjs')) {
  main();
}
