#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// Usage: npm run ready-for-pr
// Runs all checks that CI would run, in order:
// 1. Prettier format check (--check, not --write)
// 2. ESLint (--max-warnings 0)
// 3. TypeScript type check (turbo run type-check)
// 4. KMP compilation (if Kotlin files changed)
// 5. Web tests
// 6. KMP tests (if Kotlin files changed)
//
// Reports pass/fail for each step with clear output.
// Exits with non-zero code if any check fails.

const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;

const fmt = {
  green: (s) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (supportsColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (supportsColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (supportsColor ? `\x1b[36m${s}\x1b[0m` : s),
  bold: (s) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (supportsColor ? `\x1b[2m${s}\x1b[0m` : s),
};

// ── --help ────────────────────────────────────────────────────────────────────

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
${fmt.bold('Finance — Pre-PR Validation')}

Runs every check that CI would run so you can catch problems before
opening a pull request.

${fmt.bold('Usage:')}
  npm run ready-for-pr
  node tools/ready-for-pr.js

${fmt.bold('Checks (in order):')}
  1. Prettier format check
  2. ESLint
  3. TypeScript type check
  4. KMP compilation      ${fmt.dim('(skipped when no .kt/.kts files changed)')}
  5. Web tests
  6. KMP tests            ${fmt.dim('(skipped when no .kt/.kts files changed)')}

${fmt.bold('Options:')}
  --help, -h    Show this help message
  --all         Run KMP checks even if no Kotlin files changed
`);
  process.exit(0);
}

// ── Kotlin change detection ──────────────────────────────────────────────────

/**
 * Detect whether any Kotlin (.kt / .kts) files have been modified compared to
 * the merge-base with origin/main. Falls back to checking unstaged/staged
 * changes when the merge-base can't be determined (e.g. shallow clone).
 *
 * @returns {boolean}
 */
function hasKotlinChanges() {
  /** @param {string} cmd @param {string[]} args */
  const run = (cmd, args) => {
    try {
      return execFileSync(cmd, args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };

  // Try merge-base diff first (covers committed + staged + unstaged)
  const mergeBase = run('git', ['merge-base', 'HEAD', 'origin/main']);
  if (mergeBase) {
    const diff = run('git', ['diff', '--name-only', mergeBase]);
    const staged = run('git', ['diff', '--name-only', '--cached']);
    const combined = `${diff}\n${staged}`;
    if (combined.split('\n').some((f) => /\.kts?$/.test(f))) return true;
  }

  // Fallback: unstaged + staged changes
  const status = run('git', ['status', '--porcelain']);
  return status.split('\n').some((line) => /\.kts?\s*$/.test(line));
}

const forceAll = process.argv.includes('--all');
const kotlinChanged = forceAll || hasKotlinChanges();

// ── Step runner ──────────────────────────────────────────────────────────────

const startTime = Date.now();

/** @type {{ name: string; status: 'pass' | 'fail' | 'skip'; duration: number }[]} */
const results = [];

/**
 * Run a named check step.
 *
 * @param {string} name   Human-readable step name
 * @param {string} cmd    Command to execute
 * @param {string[]} args Arguments
 * @param {{ skip?: boolean; shell?: boolean }} [opts]
 */
function step(name, cmd, args, opts = {}) {
  if (opts.skip) {
    results.push({ name, status: 'skip', duration: 0 });
    console.log(`\n${fmt.yellow('○')} ${fmt.bold(name)} ${fmt.dim('— skipped')}`);
    return;
  }

  console.log(`\n${fmt.cyan('▶')} ${fmt.bold(name)}`);
  const t0 = Date.now();

  try {
    execFileSync(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: opts.shell ?? true,
    });
    const duration = Date.now() - t0;
    results.push({ name, status: 'pass', duration });
    console.log(`${fmt.green('✓')} ${name} ${fmt.dim(`(${formatMs(duration)})`)}`);
  } catch {
    const duration = Date.now() - t0;
    results.push({ name, status: 'fail', duration });
    console.log(`${fmt.red('✗')} ${name} ${fmt.dim(`(${formatMs(duration)})`)}`);
  }
}

/**
 * Format milliseconds into a human-friendly string.
 * @param {number} ms
 * @returns {string}
 */
function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

// ── Banner ───────────────────────────────────────────────────────────────────

console.log(`\n${fmt.bold('🚀 Finance — Pre-PR Validation')}`);
console.log(`${'─'.repeat(48)}`);

if (!kotlinChanged) {
  console.log(fmt.dim('  No Kotlin file changes detected — KMP steps will be skipped.'));
  console.log(fmt.dim('  Use --all to force all checks.'));
}

// ── Checks ───────────────────────────────────────────────────────────────────

// 1. Prettier format check (mirrors lint-format.yml → "npx prettier --check .")
step('Prettier format check', 'npx', ['prettier', '--check', '.']);

// 2. ESLint (mirrors lint-format.yml → "npx eslint . --max-warnings 0")
step('ESLint', 'npx', ['eslint', '.', '--max-warnings', '0']);

// 3. TypeScript type check (mirrors turbo pipeline)
step('TypeScript type check', 'npx', ['turbo', 'run', 'type-check']);

// 4. KMP compilation (mirrors ci.yml → shared package build)
step(
  'KMP compilation',
  'node',
  ['tools/gradle.js', 'build', '-x', 'jsBrowserTest', '-x', 'allTests'],
  { skip: !kotlinChanged },
);

// 5. Web tests (mirrors web-ci.yml → "npm test -w apps/web")
step('Web tests', 'npm', ['test', '-w', 'apps/web']);

// 6. KMP tests (mirrors ci.yml → JVM tests)
step('KMP tests', 'node', ['tools/gradle.js', ':packages:core:jvmTest'], {
  skip: !kotlinChanged,
});

// ── Summary ──────────────────────────────────────────────────────────────────

const totalMs = Date.now() - startTime;
const passed = results.filter((r) => r.status === 'pass').length;
const failed = results.filter((r) => r.status === 'fail').length;
const skipped = results.filter((r) => r.status === 'skip').length;

console.log(`\n${'─'.repeat(48)}`);
console.log(fmt.bold('  Results:\n'));

for (const r of results) {
  const icon =
    r.status === 'pass' ? fmt.green('✓') : r.status === 'fail' ? fmt.red('✗') : fmt.yellow('○');
  const time = r.status === 'skip' ? fmt.dim('skipped') : fmt.dim(formatMs(r.duration));
  console.log(`  ${icon}  ${r.name}  ${time}`);
}

console.log(`\n${'─'.repeat(48)}`);
console.log(
  `  ${fmt.green('Passed:')} ${passed}   ${fmt.red('Failed:')} ${failed}   ${fmt.yellow('Skipped:')} ${skipped}   ${fmt.dim('Total:')} ${formatMs(totalMs)}`,
);
console.log(`${'─'.repeat(48)}`);

if (failed > 0) {
  console.log(
    `\n${fmt.red('⛔')} ${failed} check(s) failed — fix the issues above before opening a PR.\n`,
  );
  process.exit(1);
}

console.log(`\n${fmt.green('✅')} All checks passed — you're ready to open a PR!\n`);
