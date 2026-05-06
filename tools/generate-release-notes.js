#!/usr/bin/env node

// =============================================================================
// Release Notes Generator — Aggregate PR titles with scope grouping
// =============================================================================
//
// Usage:
//   node tools/generate-release-notes.js --from v1.0.0 --to v2.0.0
//   node tools/generate-release-notes.js --from v1.0.0              # to HEAD
//   node tools/generate-release-notes.js --help
//
// Generates structured release notes by:
//   1. Aggregating merged PR titles from the git log
//   2. Grouping by scope (android, ios, web, windows, core, devops, docs)
//   3. Extracting issue references (Closes #N, Fixes #N)
//   4. Categorizing by conventional commit type (feat, fix, perf, etc.)
//   5. Attributing contributors
//
// Output: Markdown-formatted release notes suitable for GitHub Releases,
//         store changelogs, and team announcements.
//
// Issue: #1147
// =============================================================================

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Release Notes Generator — PR-based release notes with scope grouping

Usage:
  node tools/generate-release-notes.js --from <tag> --to <tag|HEAD>
  node tools/generate-release-notes.js --from <tag>
  node tools/generate-release-notes.js --help

Options:
  --from <ref>         Start ref (tag or commit SHA)
  --to <ref>           End ref (default: HEAD)
  --format <fmt>       Output format: markdown (default), json
  --platform <name>    Filter to a single platform scope
  --include-breaking   Highlight breaking changes separately
  --help, -h           Show this help
`);
  process.exit(0);
}

/**
 * Read a CLI flag value.
 * @param {string} flag
 * @param {string} [defaultValue]
 * @returns {string|undefined}
 */
function flag(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}

const fromRef = flag('--from');
const toRef = flag('--to', 'HEAD');
const format = flag('--format', 'markdown');
const platformFilter = flag('--platform');
const includeBreaking = args.includes('--include-breaking');

if (!fromRef) {
  console.error('Error: --from <ref> is required');
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' }).trim();
}

// ── Conventional commit categories ──────────────────────────────────────────

const CATEGORIES = {
  feat: { emoji: '✨', title: 'Features' },
  fix: { emoji: '🐛', title: 'Bug Fixes' },
  perf: { emoji: '⚡', title: 'Performance' },
  refactor: { emoji: '♻️', title: 'Refactoring' },
  docs: { emoji: '📚', title: 'Documentation' },
  test: { emoji: '🧪', title: 'Tests' },
  ci: { emoji: '🔧', title: 'CI/CD' },
  chore: { emoji: '🧹', title: 'Maintenance' },
  build: { emoji: '📦', title: 'Build' },
  style: { emoji: '🎨', title: 'Style' },
};

const PLATFORM_LABELS = {
  android: '🤖 Android',
  ios: '🍎 iOS',
  web: '🌐 Web',
  windows: '🪟 Windows',
  core: '🔧 Core / Shared',
  devops: '⚙️ DevOps / CI',
  docs: '📚 Documentation',
  other: '📋 Other',
};

// ── Parse commits ───────────────────────────────────────────────────────────

const LOG_FORMAT = '%H||%s||%an||%ae';
const rawLog = git('log', '--pretty=format:' + LOG_FORMAT, `${fromRef}..${toRef}`);

if (!rawLog) {
  console.error(`No commits found between ${fromRef} and ${toRef}`);
  process.exit(0);
}

const lines = rawLog.split('\n').filter(Boolean);

/**
 * @typedef {Object} ParsedCommit
 * @property {string} hash
 * @property {string} subject
 * @property {string} author
 * @property {string} email
 * @property {string} type
 * @property {string} scope
 * @property {string} description
 * @property {string} platform
 * @property {string[]} issues
 * @property {string|null} pr
 * @property {boolean} breaking
 */

/** @type {ParsedCommit[]} */
const commits = [];

// Conventional commit regex: type(scope): description
const CC_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
// PR reference in subject: (#123)
const PR_RE = /\(#(\d+)\)/;
// Issue references
const ISSUE_RE = /(?:closes?|fixes?|resolves?)\s+#(\d+)/gi;

for (const line of lines) {
  const [hash, subject, author, email] = line.split('||');
  if (!hash || !subject) continue;

  const ccMatch = subject.match(CC_RE);
  const prMatch = subject.match(PR_RE);

  const type = ccMatch ? ccMatch[1] : 'other';
  const scope = ccMatch ? ccMatch[2] || '' : '';
  const breaking = ccMatch ? !!ccMatch[3] : false;
  const description = ccMatch ? ccMatch[4] : subject;

  // Extract issue references from subject
  const issues = [];
  let issueMatch;
  while ((issueMatch = ISSUE_RE.exec(subject)) !== null) {
    issues.push(issueMatch[1]);
  }

  // Determine platform from scope
  let platform = 'other';
  const scopeLower = scope.toLowerCase();
  if (['android', 'droid'].some((s) => scopeLower.includes(s))) platform = 'android';
  else if (['ios', 'swift', 'xcode'].some((s) => scopeLower.includes(s))) platform = 'ios';
  else if (['web', 'vite', 'react'].some((s) => scopeLower.includes(s))) platform = 'web';
  else if (['windows', 'win', 'desktop'].some((s) => scopeLower.includes(s))) platform = 'windows';
  else if (['core', 'kmp', 'shared', 'common'].some((s) => scopeLower.includes(s)))
    platform = 'core';
  else if (['ci', 'devops', 'workflow'].some((s) => scopeLower.includes(s))) platform = 'devops';
  else if (['docs', 'readme'].some((s) => scopeLower.includes(s))) platform = 'docs';

  commits.push({
    hash: hash.substring(0, 7),
    subject,
    author,
    email,
    type,
    scope,
    description: description.replace(PR_RE, '').trim(),
    platform,
    issues,
    pr: prMatch ? prMatch[1] : null,
    breaking,
  });
}

// ── Filter by platform if requested ─────────────────────────────────────────

const filtered = platformFilter ? commits.filter((c) => c.platform === platformFilter) : commits;

// ── Group commits ───────────────────────────────────────────────────────────

/** @type {Record<string, Record<string, ParsedCommit[]>>} */
const byPlatformAndType = {};

for (const commit of filtered) {
  const plat = commit.platform;
  const type = commit.type;
  if (!byPlatformAndType[plat]) byPlatformAndType[plat] = {};
  if (!byPlatformAndType[plat][type]) byPlatformAndType[plat][type] = [];
  byPlatformAndType[plat][type].push(commit);
}

// ── Collect contributors ────────────────────────────────────────────────────

const contributors = new Map();
for (const commit of filtered) {
  if (!contributors.has(commit.email)) {
    contributors.set(commit.email, commit.author);
  }
}

// ── Collect all referenced issues ───────────────────────────────────────────

const allIssues = new Set();
for (const commit of filtered) {
  for (const issue of commit.issues) {
    allIssues.add(issue);
  }
}

// ── Generate output ─────────────────────────────────────────────────────────

if (format === 'json') {
  const output = {
    from: fromRef,
    to: toRef,
    totalCommits: filtered.length,
    commits: filtered,
    contributors: Array.from(contributors.entries()).map(([email, name]) => ({
      name,
      email,
    })),
    issues: Array.from(allIssues),
  };
  console.log(JSON.stringify(output, null, 2));
} else {
  // Markdown output
  const lines = [];

  lines.push(`## Release Notes: ${fromRef} → ${toRef}`);
  lines.push('');
  lines.push(`> ${filtered.length} commits from ${contributors.size} contributors`);
  lines.push('');

  // Breaking changes first
  if (includeBreaking) {
    const breaking = filtered.filter((c) => c.breaking);
    if (breaking.length > 0) {
      lines.push('### ⚠️ Breaking Changes');
      lines.push('');
      for (const c of breaking) {
        const pr = c.pr ? ` (#${c.pr})` : '';
        lines.push(`- **${c.scope || 'general'}:** ${c.description}${pr}`);
      }
      lines.push('');
    }
  }

  // Group by platform
  const platformOrder = ['core', 'android', 'ios', 'web', 'windows', 'devops', 'docs', 'other'];
  const typeOrder = [
    'feat',
    'fix',
    'perf',
    'refactor',
    'test',
    'ci',
    'chore',
    'build',
    'style',
    'docs',
  ];

  for (const platform of platformOrder) {
    const types = byPlatformAndType[platform];
    if (!types) continue;

    const label = PLATFORM_LABELS[platform] || platform;
    lines.push(`### ${label}`);
    lines.push('');

    for (const type of typeOrder) {
      const typeCommits = types[type];
      if (!typeCommits || typeCommits.length === 0) continue;

      const cat = CATEGORIES[type] || { emoji: '📋', title: type };

      for (const c of typeCommits) {
        const pr = c.pr ? ` ([#${c.pr}](../../pull/${c.pr}))` : '';
        const issues = c.issues.map((i) => `[#${i}](../../issues/${i})`).join(', ');
        const issueRef = issues ? ` — ${issues}` : '';
        lines.push(`- ${cat.emoji} ${c.description}${pr}${issueRef} — @${c.author}`);
      }
    }
    lines.push('');
  }

  // Contributors
  if (contributors.size > 0) {
    lines.push('### 👥 Contributors');
    lines.push('');
    for (const [, name] of contributors) {
      lines.push(`- ${name}`);
    }
    lines.push('');
  }

  // Referenced issues
  if (allIssues.size > 0) {
    lines.push('### 🔗 Referenced Issues');
    lines.push('');
    for (const issue of allIssues) {
      lines.push(`- #${issue}`);
    }
    lines.push('');
  }

  console.log(lines.join('\n'));
}
