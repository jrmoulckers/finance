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
 * format pass notices. This check closes that gap for existence only; see the scope lines
 * it prints for what it deliberately does not measure.
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
 * Collect relative markdown-file links from one document.
 *
 * @param {string} text
 * @returns {{ links: {href: string, target: string, line: number}[], skipped: number }}
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
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) continue;
      const target = href.split('#')[0].trim();
      if (!target.endsWith('.md')) continue;
      if (marked[i].fenced) {
        skipped += 1;
        continue;
      }
      links.push({ href, target, line: i + 1 });
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
 * @returns {{files: number, total: number, fenced: number, broken: string[]}}
 */
export function census(git, exists, read) {
  const files = git(['ls-files', '*.md']).trim().split('\n').filter(Boolean);
  const broken = [];
  let total = 0;
  let fenced = 0;

  for (const file of files) {
    const { links, skipped } = collectLinks(read(file));
    fenced += skipped;
    for (const link of links) {
      total += 1;
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(file.split(path.sep).join('/')), link.target),
      );
      if (!exists(resolved)) broken.push(`${file} -> ${link.href}`);
    }
  }
  return { files: files.length, total, fenced, broken };
}

/**
 * Lines describing what was and was not measured, printed on both the passing and the
 * failing path. A control that reports its population only when it passes cannot be
 * distinguished from one that measured nothing.
 *
 * @param {{files: number, total: number, fenced: number}} scope
 * @returns {string[]}
 */
export function scopeLines({ files, total, fenced }) {
  return [
    `Scope: ${total} relative markdown link(s) across ${files} tracked file(s); ${fenced} inside fenced blocks were skipped.`,
    'Not measured: URL targets, anchor fragments, links to non-markdown files, or whether',
    'a target still contains the content the citing text claims. A file that keeps its name',
    'while its content moves elsewhere stays green here and is wrong.',
  ];
}

function main() {
  const git = (args) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const root = process.cwd();
  const exists = (p) => fs.existsSync(path.join(root, p));
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

  const { files, total, fenced, broken } = census(git, exists, read);
  const baseline = new Set(UNRESOLVED_BASELINE);
  const unexpected = broken.filter((b) => !baseline.has(b));
  const fixed = [...baseline].filter((b) => !broken.includes(b));
  // `broken` counts occurrences; the baseline names distinct targets, and three of
  // them are linked from two places. Printing one as the other would report twelve
  // gaps against a nine-entry list and invite exactly the wrong correction.
  const distinctBroken = new Set(broken).size;

  if (unexpected.length > 0) {
    console.error(`${unexpected.length} broken relative markdown link(s):`);
    for (const b of unexpected) console.error(`  ${b}`);
    console.error('');
    console.error('A moved or renamed file leaves the citing document syntactically intact,');
    console.error('so nothing in a lint or format pass notices. Repoint or remove the link.');
    console.error('');
    for (const line of scopeLines({ files, total, fenced })) console.error(line);
    console.error(
      `${broken.length} broken occurrence(s) over ${distinctBroken} distinct target(s); ${baseline.size - fixed.length} of those targets are recorded gaps where the document does not exist.`,
    );
    process.exit(1);
  }

  console.log(`All resolvable relative markdown links point at files that exist.`);
  for (const line of scopeLines({ files, total, fenced })) console.log(line);
  console.log(
    `${distinctBroken} recorded gap(s) remain across ${broken.length} link(s), where the target names a document this repository has never contained.`,
  );
  if (fixed.length > 0) {
    console.log('');
    console.log(
      `${fixed.length} recorded gap(s) no longer broken -- remove them from the baseline:`,
    );
    for (const f of fixed) console.log(`  ${f}`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-doc-links.mjs')) {
  main();
}
