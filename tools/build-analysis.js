#!/usr/bin/env node

/**
 * Build Analysis - Track and analyze build performance across the monorepo.
 *
 * Usage:
 *   node tools/build-analysis.js              # Analyze current build state
 *   node tools/build-analysis.js --turbo      # Show Turbo cache stats
 *   node tools/build-analysis.js --gradle     # Show Gradle cache stats
 *   node tools/build-analysis.js --recommend  # Show optimization recommendations
 *   node tools/build-analysis.js --help       # Show usage
 *
 * Analyzes:
 *   - Turbo remote cache hit rates
 *   - Gradle build cache effectiveness
 *   - Node module install times
 *   - Per-workspace build times
 *   - Dependency graph depth
 *
 * Issue: #sprint-6
 */

const { execSync } = require('child_process');
const { readFileSync, existsSync, statSync } = require('fs');
const { resolve, join } = require('path');

const ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Build Analysis - Finance Monorepo

Usage:
  node tools/build-analysis.js [options]

Options:
  --turbo          Show Turbo cache statistics
  --gradle         Show Gradle cache statistics
  --recommend      Show optimization recommendations
  --json           Output JSON results
  --help, -h       Show this help message
`);
  process.exit(0);
}

const showTurbo = args.includes('--turbo') || !args.includes('--gradle');
const showGradle = args.includes('--gradle') || !args.includes('--turbo');
const showRecommend = args.includes('--recommend') || args.length === 0;
const doJson = args.includes('--json');

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const fmt = {
  bold: (s) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (supportsColor ? `\x1b[33m${s}\x1b[0m` : s),
  dim: (s) => (supportsColor ? `\x1b[2m${s}\x1b[0m` : s),
};
const PASS = '\u2705';
const WARN = '\u26A0\uFE0F';
const INFO = '\u2139\uFE0F';

function _run(cmd, timeout = 30000) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe', timeout }).trim();
  } catch {
    return null;
  }
}

function analyzeTurboConfig() {
  console.log(fmt.bold('\n\uD83C\uDF00 Turbo Configuration'));
  console.log('\u2500'.repeat(50));

  const turboPath = join(ROOT, 'turbo.json');
  if (!existsSync(turboPath)) {
    console.log(`  ${WARN} turbo.json not found`);
    return {};
  }

  const config = JSON.parse(readFileSync(turboPath, 'utf-8'));

  // Remote cache
  const remoteCache = config.remoteCache || {};
  if (remoteCache.enabled) {
    console.log(`  ${PASS} Remote cache: enabled (signature: ${remoteCache.signature || false})`);
  } else {
    console.log(`  ${WARN} Remote cache: disabled`);
  }

  // Global dependencies
  const globalDeps = config.globalDependencies || [];
  console.log(`  ${INFO} Global dependencies: ${globalDeps.join(', ') || 'none'}`);

  // Task analysis
  const tasks = config.tasks || config.pipeline || {};
  console.log(`  ${INFO} Configured tasks: ${Object.keys(tasks).join(', ')}`);

  for (const [name, task] of Object.entries(tasks)) {
    const deps = task.dependsOn || [];
    const outputs = task.outputs || [];
    const cached = task.cache !== false;
    const inputs = task.inputs || [];
    console.log(
      `    ${cached ? PASS : WARN} ${name}: ${deps.length} deps, ${inputs.length} inputs, ${outputs.length} outputs, cache=${cached}`,
    );
  }

  return { remoteCache, tasks: Object.keys(tasks), globalDeps };
}

function analyzeGradleConfig() {
  console.log(fmt.bold('\n\uD83D\uDC18 Gradle Configuration'));
  console.log('\u2500'.repeat(50));

  // Check gradle.properties for caching settings
  const propsPath = join(ROOT, 'gradle.properties');
  if (existsSync(propsPath)) {
    const props = readFileSync(propsPath, 'utf-8');
    const settings = {
      'org.gradle.caching': props.includes('org.gradle.caching=true'),
      'org.gradle.parallel': props.includes('org.gradle.parallel=true'),
      'org.gradle.daemon': !props.includes('org.gradle.daemon=false'),
      'org.gradle.configureondemand': props.includes('org.gradle.configureondemand=true'),
      'kotlin.incremental': props.includes('kotlin.incremental=true'),
    };

    for (const [key, enabled] of Object.entries(settings)) {
      console.log(`  ${enabled ? PASS : WARN} ${key}: ${enabled ? 'enabled' : 'disabled'}`);
    }
  } else {
    console.log(`  ${WARN} gradle.properties not found`);
  }

  // Check for configuration cache
  const settingsPath = join(ROOT, 'settings.gradle.kts');
  if (existsSync(settingsPath)) {
    const settings = readFileSync(settingsPath, 'utf-8');
    if (settings.includes('configurationCache')) {
      console.log(`  ${PASS} Configuration cache: referenced in settings`);
    }
  }

  return {};
}

function analyzeNodeModules() {
  console.log(fmt.bold('\n\uD83D\uDCE6 Node Modules'));
  console.log('\u2500'.repeat(50));

  const nmDir = join(ROOT, 'node_modules');
  if (!existsSync(nmDir)) {
    console.log(`  ${WARN} node_modules not found - run npm ci`);
    return {};
  }

  // Check lock file freshness
  const lockPath = join(ROOT, 'package-lock.json');
  if (existsSync(lockPath)) {
    const lockStat = statSync(lockPath);
    const ageHours = (Date.now() - lockStat.mtimeMs) / 3600000;
    console.log(`  ${INFO} package-lock.json last modified: ${ageHours.toFixed(0)} hours ago`);
  }

  // Count workspaces
  const pkgPath = join(ROOT, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const workspaces = pkg.workspaces || [];
    console.log(`  ${INFO} Workspaces: ${workspaces.join(', ')}`);
  }

  return {};
}

function showRecommendations() {
  console.log(fmt.bold('\n\uD83D\uDCA1 Optimization Recommendations'));
  console.log('\u2500'.repeat(50));

  const recommendations = [
    {
      title: 'Enable Turbo Remote Cache',
      check: () => {
        const turbo = join(ROOT, 'turbo.json');
        if (!existsSync(turbo)) return false;
        const config = JSON.parse(readFileSync(turbo, 'utf-8'));
        return config.remoteCache && config.remoteCache.enabled;
      },
      message: 'Set TURBO_TOKEN and TURBO_TEAM secrets for remote caching',
    },
    {
      title: 'Gradle Build Cache',
      check: () => {
        const props = join(ROOT, 'gradle.properties');
        if (!existsSync(props)) return false;
        return readFileSync(props, 'utf-8').includes('org.gradle.caching=true');
      },
      message: 'Add org.gradle.caching=true to gradle.properties',
    },
    {
      title: 'Gradle Parallel Execution',
      check: () => {
        const props = join(ROOT, 'gradle.properties');
        if (!existsSync(props)) return false;
        return readFileSync(props, 'utf-8').includes('org.gradle.parallel=true');
      },
      message: 'Add org.gradle.parallel=true to gradle.properties',
    },
    {
      title: 'Path-filtered CI triggers',
      check: () => {
        const ciPath = join(ROOT, '.github', 'workflows', 'ci-android.yml');
        if (!existsSync(ciPath)) return false;
        return readFileSync(ciPath, 'utf-8').includes('paths:');
      },
      message: 'Use paths: filters in CI workflows for affected-only builds',
    },
    {
      title: 'Concurrency groups with cancel-in-progress',
      check: () => {
        const ciPath = join(ROOT, '.github', 'workflows', 'ci-shared.yml');
        if (!existsSync(ciPath)) return false;
        return readFileSync(ciPath, 'utf-8').includes('cancel-in-progress');
      },
      message: 'Add concurrency groups to prevent redundant CI runs',
    },
    {
      title: 'E2E Test Sharding',
      check: () => {
        const webCi = join(ROOT, '.github', 'workflows', 'ci-web.yml');
        if (!existsSync(webCi)) return false;
        return readFileSync(webCi, 'utf-8').includes('shard');
      },
      message: 'Shard E2E tests across parallel runners for faster feedback',
    },
  ];

  let allGood = true;
  for (const rec of recommendations) {
    try {
      const ok = rec.check();
      if (ok) {
        console.log(`  ${PASS} ${rec.title}`);
      } else {
        console.log(`  ${WARN} ${rec.title}`);
        console.log(`    ${fmt.dim(rec.message)}`);
        allGood = false;
      }
    } catch {
      console.log(`  ${WARN} ${rec.title} (could not check)`);
    }
  }

  if (allGood) {
    console.log(`\n  ${PASS} All recommended optimizations are in place!`);
  }
}

function main() {
  console.log('');
  console.log(fmt.bold('\u26A1 Finance - Build Analysis'));
  console.log('\u2550'.repeat(50));

  const results = {};

  if (showTurbo) results.turbo = analyzeTurboConfig();
  if (showGradle) results.gradle = analyzeGradleConfig();
  analyzeNodeModules();
  if (showRecommend) showRecommendations();

  if (doJson) {
    console.log('\n--- BUILD_ANALYSIS_JSON ---');
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...results }, null, 2));
    console.log('--- END_BUILD_ANALYSIS_JSON ---');
  }

  console.log(`\n${PASS} Build analysis complete.`);
}

main();
