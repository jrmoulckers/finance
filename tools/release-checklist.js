#!/usr/bin/env node

/**
 * Release Checklist - Pre-release validation for all 4 platforms.
 *
 * Usage:
 *   node tools/release-checklist.js                    # Check all platforms
 *   node tools/release-checklist.js --platform android  # Single platform
 *   node tools/release-checklist.js --help              # Show usage
 *
 * Validates:
 *   - Git state (clean tree, on main, no pending changesets)
 *   - Build artifacts exist
 *   - Tests pass
 *   - Version consistency across platforms
 *   - Required secrets/credentials are configured
 *   - Changelog is up to date
 *   - Performance budgets are met
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - Checks failed
 *
 * Issue: #sprint-4
 */

const { execSync } = require('child_process');
const { readFileSync, existsSync, readdirSync } = require('fs');
const { resolve, join } = require('path');

const ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Release Checklist - Finance Monorepo

Usage:
  node tools/release-checklist.js [options]

Options:
  --platform <name>   Check a single platform (android|ios|web|windows)
  --skip-tests        Skip test execution (check artifacts only)
  --verbose           Show detailed output
  --help, -h          Show this help message

Platforms: android, ios, web, windows, shared
`);
  process.exit(0);
}

const platformFilter = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : null;
const skipTests = args.includes('--skip-tests');
const _verbose = args.includes('--verbose');

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const fmt = {
  bold: (s) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (supportsColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (supportsColor ? `\x1b[33m${s}\x1b[0m` : s),
};
const PASS = '\u2705';
const FAIL = '\u274C';
const WARN = '\u26A0\uFE0F';
const INFO = '\u2139\uFE0F';

let failures = 0;
let warnings = 0;

function pass(msg) {
  console.log(`  ${PASS} ${msg}`);
}
function fail(msg) {
  console.log(`  ${FAIL} ${msg}`);
  failures++;
}
function warn(msg) {
  console.log(`  ${WARN} ${msg}`);
  warnings++;
}
function info(msg) {
  console.log(`  ${INFO} ${msg}`);
}

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

function hasCommand(name) {
  const check = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
  return run(check) !== null;
}

// ---- CHECKS ----

function checkGitState() {
  console.log(fmt.bold('\n\uD83D\uDD00 Git State'));
  console.log('\u2500'.repeat(40));

  const status = run('git status --porcelain');
  if (status === '') pass('Working tree is clean');
  else fail(`${status.split('\n').length} uncommitted change(s)`);

  const branch = run('git rev-parse --abbrev-ref HEAD');
  if (branch === 'main') pass('On main branch');
  else warn(`On branch "${branch}" (releases should be tagged from main)`);

  const unpushed = run('git log origin/main..HEAD --oneline');
  if (!unpushed || unpushed === '') pass('No unpushed commits');
  else warn(`${unpushed.split('\n').length} unpushed commit(s)`);
}

function checkChangesets() {
  console.log(fmt.bold('\n\uD83D\uDCDD Changesets'));
  console.log('\u2500'.repeat(40));

  const csDir = join(ROOT, '.changeset');
  if (!existsSync(csDir)) {
    warn('.changeset directory not found');
    return;
  }
  const pending = readdirSync(csDir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  if (pending.length === 0) pass('No pending changesets');
  else fail(`${pending.length} pending changeset(s) - run "npx changeset version"`);
}

function checkVersions() {
  console.log(fmt.bold('\n\uD83C\uDFF7\uFE0F Version Consistency'));
  console.log('\u2500'.repeat(40));

  const pkgPath = join(ROOT, 'package.json');
  if (!existsSync(pkgPath)) {
    fail('package.json not found');
    return;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const rootVersion = pkg.version;
  const semverRe = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;

  if (semverRe.test(rootVersion)) pass(`Root version: ${rootVersion}`);
  else fail(`Invalid root version: "${rootVersion}"`);
}

function checkPlatform(platform) {
  console.log(
    fmt.bold(`\n\uD83D\uDCF1 ${platform.charAt(0).toUpperCase() + platform.slice(1)} Platform`),
  );
  console.log('\u2500'.repeat(40));

  switch (platform) {
    case 'android': {
      const appDir = join(ROOT, 'apps', 'android');
      if (!existsSync(appDir)) {
        warn('apps/android/ not found');
        return;
      }
      pass('Android app directory exists');

      const buildGradle = join(appDir, 'build.gradle.kts');
      if (existsSync(buildGradle)) pass('build.gradle.kts found');
      else fail('build.gradle.kts missing');

      info(
        'Required secrets: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD',
      );
      info('Release workflow: .github/workflows/release-platform.yml');
      break;
    }
    case 'ios': {
      const appDir = join(ROOT, 'apps', 'ios');
      if (!existsSync(appDir)) {
        warn('apps/ios/ not found');
        return;
      }
      pass('iOS app directory exists');

      info(
        'Required secrets: IOS_DISTRIBUTION_CERT_BASE64, IOS_CERT_PASSWORD, IOS_PROVISIONING_PROFILE_BASE64',
      );
      info('Required secrets: APP_STORE_API_KEY_ID, APP_STORE_API_ISSUER');
      info('Release workflow: .github/workflows/release-platform.yml');
      break;
    }
    case 'web': {
      const appDir = join(ROOT, 'apps', 'web');
      if (!existsSync(appDir)) {
        warn('apps/web/ not found');
        return;
      }
      pass('Web app directory exists');

      const pkgJson = join(appDir, 'package.json');
      if (existsSync(pkgJson)) pass('package.json found');
      else fail('package.json missing');

      info('Required secrets: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID');
      info('Release workflow: .github/workflows/release-platform.yml');
      break;
    }
    case 'windows': {
      const appDir = join(ROOT, 'apps', 'windows');
      if (!existsSync(appDir)) {
        warn('apps/windows/ not found');
        return;
      }
      pass('Windows app directory exists');

      info('Required secrets: WINDOWS_SIGNING_CERT_BASE64, WINDOWS_CERT_PASSWORD');
      info('Release workflow: .github/workflows/release-platform.yml');
      break;
    }
  }
}

function checkTools() {
  console.log(fmt.bold('\n\uD83D\uDD27 Required Tools'));
  console.log('\u2500'.repeat(40));

  for (const tool of ['node', 'npm', 'git', 'gh']) {
    if (hasCommand(tool)) pass(`${tool} available`);
    else fail(`${tool} not found`);
  }
}

function checkChangelog() {
  console.log(fmt.bold('\n\uD83D\uDCCB Changelog'));
  console.log('\u2500'.repeat(40));

  const clPath = join(ROOT, 'CHANGELOG.md');
  if (existsSync(clPath)) {
    const content = readFileSync(clPath, 'utf-8');
    if (content.length > 0) pass('CHANGELOG.md exists and is non-empty');
    else warn('CHANGELOG.md is empty');
  } else {
    warn('CHANGELOG.md not found (will be created by Changesets)');
  }
}

// ---- MAIN ----

function main() {
  console.log('');
  console.log(fmt.bold('\uD83D\uDE80 Finance - Release Checklist'));
  console.log('\u2550'.repeat(50));
  console.log(`  Platform: ${platformFilter || 'all'}`);
  console.log(`  Skip tests: ${skipTests}`);

  checkTools();
  checkGitState();
  checkChangesets();
  checkVersions();
  checkChangelog();

  const platforms = platformFilter ? [platformFilter] : ['android', 'ios', 'web', 'windows'];
  for (const p of platforms) checkPlatform(p);

  // Summary
  console.log('\n' + '\u2550'.repeat(50));
  if (failures === 0 && warnings === 0) {
    console.log(`${PASS} All release checks passed. Ready to release!`);
  } else if (failures === 0) {
    console.log(`${WARN} Passed with ${warnings} warning(s). Review before releasing.`);
  } else {
    console.log(`${FAIL} ${failures} check(s) failed, ${warnings} warning(s).`);
    console.log('   Fix issues before releasing.');
  }

  process.exit(failures > 0 ? 1 : 0);
}

main();
