#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Changelog Generator — Structured release notes from conventional commits
// =============================================================================
//
// Usage:
//   node tools/generate-changelog.js                    # auto-detect latest tag range
//   node tools/generate-changelog.js v1.0.0 v1.1.0     # explicit range
//   node tools/generate-changelog.js --from <tag>       # from tag to HEAD
//
// Parses conventional commit messages (feat, fix, perf, etc.) and generates
// a categorized, Markdown-formatted changelog with PR links and contributors.
//
// Issue: #962
// =============================================================================

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Changelog Generator — Structured release notes from conventional commits

Usage:
  node tools/generate-changelog.js                      # auto-detect tag range
  node tools/generate-changelog.js v1.0.0 v1.1.0       # explicit range
  node tools/generate-changelog.js --from v1.0.0        # from tag to HEAD

Options:
  --from <tag>     Start tag (end defaults to HEAD)
  --to <tag>       End tag (defaults to HEAD)
  --repo <owner/repo>  GitHub repo for PR links (default: auto-detect)
  --help, -h       Show this help
`);
  process.exit(0);
}

// ── Git helpers ──────────────────────────────────────────────────────────────

/**
 * @param {string[]} gitArgs
 * @returns {string}
 */
function git(gitArgs) {
  try {
    return execFileSync('git', gitArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Detect GitHub repo from git remote.
 * @returns {string} e.g. "jrmoulckers/finance"
 */
function detectRepo() {
  const fromArg = args[args.indexOf('--repo') + 1];
  if (fromArg) return fromArg;

  const remoteUrl = git(['remote', 'get-url', 'origin']);
  const match = remoteUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
  return match ? match[1] : '';
}

/**
 * Get the two most recent tags sorted by version.
 * @returns {{ from: string; to: string }}
 */
function detectTagRange() {
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');

  if (fromIdx !== -1) {
    const from = args[fromIdx + 1];
    const to = toIdx !== -1 ? args[toIdx + 1] : 'HEAD';
    return { from, to };
  }

  // Positional args: <from> <to>
  if (args.length >= 2 && !args[0].startsWith('-') && !args[1].startsWith('-')) {
    return { from: args[0], to: args[1] };
  }

  // Auto-detect: latest two tags
  const tags = git(['tag', '--sort=-version:refname', '--list', 'v*']).split('\n').filter(Boolean);

  if (tags.length >= 2) {
    return { from: tags[1], to: tags[0] };
  }
  if (tags.length === 1) {
    return { from: '', to: tags[0] };
  }

  return { from: '', to: 'HEAD' };
}

// ── Commit parsing ───────────────────────────────────────────────────────────

/**
 * @typedef {{ type: string; scope: string; subject: string; hash: string; author: string; prNumber: string; breaking: boolean }} ParsedCommit
 */

const COMMIT_PATTERN =
  /^(?<type>feat|fix|perf|refactor|docs|style|test|build|ci|chore|revert)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<subject>.+)$/;

/**
 * Parse a single conventional commit message.
 * @param {string} line  Format: "hash|author|subject"
 * @returns {ParsedCommit | null}
 */
function parseCommit(line) {
  const [hash, author, ...rest] = line.split('|');
  const subject = rest.join('|'); // subject may contain |

  if (!hash || !subject) return null;

  const match = subject.match(COMMIT_PATTERN);
  if (!match || !match.groups) return null;

  // Extract PR number from subject like "... (#123)"
  const prMatch = subject.match(/\(#(\d+)\)\s*$/);
  const prNumber = prMatch ? prMatch[1] : '';

  return {
    type: match.groups.type,
    scope: match.groups.scope || '',
    subject: subject
      .replace(COMMIT_PATTERN, '$<subject>')
      .replace(/\s*\(#\d+\)\s*$/, '')
      .trim(),
    hash: hash.slice(0, 7),
    author: author.trim(),
    prNumber,
    breaking: !!match.groups.bang,
  };
}

// ── Category definitions ─────────────────────────────────────────────────────

const CATEGORIES = [
  { type: 'feat', emoji: '🚀', heading: 'Features' },
  { type: 'fix', emoji: '🐛', heading: 'Bug Fixes' },
  { type: 'perf', emoji: '⚡', heading: 'Performance' },
  { type: 'refactor', emoji: '♻️', heading: 'Refactoring' },
  { type: 'docs', emoji: '📝', heading: 'Documentation' },
  { type: 'ci', emoji: '🔧', heading: 'CI/CD' },
  { type: 'build', emoji: '📦', heading: 'Build' },
  { type: 'test', emoji: '✅', heading: 'Tests' },
  { type: 'style', emoji: '🎨', heading: 'Style' },
  { type: 'chore', emoji: '🏗️', heading: 'Chores' },
  { type: 'revert', emoji: '⏪', heading: 'Reverts' },
];

// ── Changelog generation ─────────────────────────────────────────────────────

const repo = detectRepo();
const { from, to } = detectTagRange();

const logRange = from ? `${from}..${to}` : to;
const logFormat = '%h|%an|%s';

const rawLog = git(['log', '--pretty=format:' + logFormat, '--no-merges', logRange]);
const lines = rawLog ? rawLog.split('\n').filter(Boolean) : [];

// Parse all commits
const commits = lines.map(parseCommit).filter(Boolean);

// Group by category
/** @type {Map<string, ParsedCommit[]>} */
const grouped = new Map();
const breakingChanges = [];
const uncategorized = [];

for (const commit of commits) {
  if (commit.breaking) {
    breakingChanges.push(commit);
  }

  const category = CATEGORIES.find((c) => c.type === commit.type);
  if (category) {
    if (!grouped.has(commit.type)) grouped.set(commit.type, []);
    grouped.get(commit.type).push(commit);
  } else {
    uncategorized.push(commit);
  }
}

// Collect unique contributors
const contributors = [...new Set(commits.map((c) => c.author))].sort();

// ── Render Markdown ──────────────────────────────────────────────────────────

/**
 * Format a single commit line.
 * @param {ParsedCommit} c
 * @returns {string}
 */
function formatCommit(c) {
  const scope = c.scope ? `**${c.scope}:** ` : '';
  const pr =
    c.prNumber && repo ? ` ([#${c.prNumber}](https://github.com/${repo}/pull/${c.prNumber}))` : '';
  const hashLink = repo
    ? ` ([${c.hash}](https://github.com/${repo}/commit/${c.hash}))`
    : ` (${c.hash})`;
  return `- ${scope}${c.subject}${pr}${hashLink}`;
}

const output = [];

// Header
const tagDisplay = to === 'HEAD' ? 'Unreleased' : to;
const dateStr = new Date().toISOString().split('T')[0];
output.push(`## ${tagDisplay} (${dateStr})\n`);

// Breaking changes
if (breakingChanges.length > 0) {
  output.push('### ⚠️ Breaking Changes\n');
  for (const c of breakingChanges) {
    output.push(formatCommit(c));
  }
  output.push('');
}

// Categorized changes
for (const cat of CATEGORIES) {
  const items = grouped.get(cat.type);
  if (!items || items.length === 0) continue;

  output.push(`### ${cat.emoji} ${cat.heading}\n`);

  // Sub-group by scope
  const byScope = new Map();
  for (const item of items) {
    const key = item.scope || '_none';
    if (!byScope.has(key)) byScope.set(key, []);
    byScope.get(key).push(item);
  }

  // Sort scopes alphabetically (unsorted at end)
  const scopes = [...byScope.keys()].sort((a, b) => {
    if (a === '_none') return 1;
    if (b === '_none') return -1;
    return a.localeCompare(b);
  });

  for (const scope of scopes) {
    for (const c of byScope.get(scope)) {
      output.push(formatCommit(c));
    }
  }
  output.push('');
}

// Statistics
const totalCommits = commits.length;
const totalPRs = commits.filter((c) => c.prNumber).length;

output.push('### 📊 Statistics\n');
output.push(`- **${totalCommits}** commits from **${contributors.length}** contributor(s)`);
if (totalPRs > 0) {
  output.push(`- **${totalPRs}** pull request(s) merged`);
}
if (from) {
  output.push(`- Comparing: \`${from}...${to}\``);
}
output.push('');

// Contributors
if (contributors.length > 0) {
  output.push('### 👥 Contributors\n');
  output.push(contributors.map((c) => `- ${c}`).join('\n'));
  output.push('');
}

const changelog = output.join('\n');
process.stdout.write(changelog);
