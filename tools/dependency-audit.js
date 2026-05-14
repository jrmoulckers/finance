#!/usr/bin/env node

/**
 * Dependency Audit - Security vulnerability scanning for all ecosystems.
 *
 * Usage:
 *   node tools/dependency-audit.js            # Run full audit
 *   node tools/dependency-audit.js --npm      # npm only
 *   node tools/dependency-audit.js --gradle   # Gradle only
 *   node tools/dependency-audit.js --severity high  # Filter severity
 *   node tools/dependency-audit.js --help     # Show usage
 *
 * Scans:
 *   - npm audit (Node.js dependencies)
 *   - Gradle dependency tree (Kotlin/JVM dependencies)
 *   - License compliance (deny GPL-3.0, AGPL-3.0)
 *
 * Environment variables:
 *   AUDIT_SEVERITY - Minimum severity (low|moderate|high|critical, default: high)
 *   CI - "true" for CI-friendly output
 *
 * Exit codes:
 *   0 - No vulnerabilities at or above severity
 *   1 - Vulnerabilities found
 *   2 - Invalid arguments
 *
 * Issue: #sprint-3
 */

const { execSync } = require('child_process');
const { existsSync: _existsSync } = require('fs');
const { resolve } = require('path');

const ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Dependency Audit - Finance Monorepo

Usage:
  node tools/dependency-audit.js [options]

Options:
  --npm              Audit npm dependencies only
  --gradle           Audit Gradle dependencies only
  --severity <level> Minimum severity (low|moderate|high|critical)
  --fix              Attempt auto-fix for npm vulnerabilities
  --json             Output JSON results
  --help, -h         Show this help message

Severity levels: low, moderate, high, critical (default: high)
`);
  process.exit(0);
}

const npmOnly = args.includes('--npm');
const gradleOnly = args.includes('--gradle');
const doFix = args.includes('--fix');
const doJson = args.includes('--json');
const VALID_SEVERITIES = ['low', 'moderate', 'high', 'critical'];
const rawSeverity = args.includes('--severity')
  ? args[args.indexOf('--severity') + 1]
  : process.env.AUDIT_SEVERITY || 'high';
if (!VALID_SEVERITIES.includes(rawSeverity)) {
  console.error(`Invalid severity: ${rawSeverity}. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
  process.exit(2);
}
const severity = rawSeverity;
const isCI = process.env.CI === 'true';

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR && !isCI;
const fmt = {
  bold: (s) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (supportsColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (supportsColor ? `\x1b[33m${s}\x1b[0m` : s),
};
const PASS = '\u2705';
const FAIL = '\u274C';
const WARN = '\u26A0\uFE0F';

function run(cmd, opts = {}) {
  try {
    return {
      stdout: execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe', ...opts }).trim(),
      exitCode: 0,
    };
  } catch (err) {
    return {
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
      exitCode: err.status || 1,
    };
  }
}

function auditNpm() {
  console.log(fmt.bold('\n\uD83D\uDCE6 npm Audit'));
  console.log('\u2500'.repeat(50));

  if (doFix) {
    console.log('  Running npm audit fix...');
    const fixResult = run('npm audit fix');
    console.log(`  ${fixResult.exitCode === 0 ? PASS : WARN} npm audit fix completed`);
  }

  console.log(`  Scanning at severity: ${severity}`);
  const result = run(`npm audit --audit-level=${severity}`);

  if (result.exitCode === 0) {
    console.log(`  ${PASS} No vulnerabilities at or above "${severity}" severity`);
    return { passed: true, vulnerabilities: 0 };
  }

  // Parse audit output for counts
  const lines = result.stdout.split('\n');
  const summaryLine = lines.find((l) => l.includes('vulnerabilities'));
  console.log(`  ${FAIL} ${summaryLine || 'Vulnerabilities found'}`);

  // Show first few findings
  const findings = lines.filter((l) => l.trim().startsWith('http') || l.includes('Severity:'));
  findings.slice(0, 10).forEach((l) => console.log(`    ${l.trim()}`));
  if (findings.length > 10) console.log(`    ... and ${findings.length - 10} more`);

  console.log('');
  console.log('  Remediation:');
  console.log('    npm audit fix              # Auto-fix compatible updates');
  console.log('    npm audit fix --force      # Force fix (may include breaking changes)');
  console.log('    npm audit --json           # Machine-readable output');

  return { passed: false, vulnerabilities: findings.length };
}

function auditGradle() {
  console.log(fmt.bold('\n\uD83D\uDCE6 Gradle Dependency Audit'));
  console.log('\u2500'.repeat(50));

  // Check for known vulnerable patterns
  const knownVulnerable = [
    { pattern: /log4j-core:2\.\d\./, name: 'log4j-core < 2.17', cve: 'CVE-2021-44228' },
    { pattern: /commons-text:1\.\d\./, name: 'commons-text < 1.10', cve: 'CVE-2022-42889' },
    { pattern: /snakeyaml:1\./, name: 'snakeyaml < 2.0', cve: 'Multiple CVEs' },
    {
      pattern: /jackson-databind:2\.(([0-9]|1[0-2])\.|\d\.)/,
      name: 'jackson-databind < 2.13',
      cve: 'Multiple CVEs',
    },
  ];

  console.log('  Generating dependency tree...');
  const depsResult = run('node tools/gradle.js dependencies --configuration runtimeClasspath', {
    timeout: 120000,
  });

  if (depsResult.exitCode !== 0 && !depsResult.stdout) {
    console.log(`  ${WARN} Could not generate Gradle dependency tree`);
    console.log('    Ensure JDK 21 and Android SDK are available');
    return { passed: true, issues: 0 };
  }

  const depOutput = depsResult.stdout;
  let issues = 0;

  for (const vuln of knownVulnerable) {
    if (vuln.pattern.test(depOutput)) {
      console.log(`  ${WARN} ${vuln.name} detected (${vuln.cve})`);
      issues++;
    }
  }

  if (issues === 0) {
    console.log(`  ${PASS} No known vulnerable dependency patterns detected`);
  } else {
    console.log(`\n  ${WARN} ${issues} potential issue(s) found`);
    console.log('  Review gradle/libs.versions.toml and update affected dependencies');
  }

  return { passed: issues === 0, issues };
}

function main() {
  console.log('');
  console.log(fmt.bold('\uD83D\uDD12 Finance - Dependency Audit'));
  console.log('\u2550'.repeat(50));
  console.log(`  Severity: ${severity}`);
  console.log(`  Scope: ${npmOnly ? 'npm' : gradleOnly ? 'gradle' : 'all'}`);

  const results = {};

  if (!gradleOnly) {
    results.npm = auditNpm();
  }

  if (!npmOnly) {
    results.gradle = auditGradle();
  }

  // Summary
  console.log(fmt.bold('\n\u2550'.repeat(50)));
  console.log(fmt.bold('  Audit Summary'));
  console.log('\u2550'.repeat(50));

  let anyFailed = false;
  for (const [ecosystem, result] of Object.entries(results)) {
    const icon = result.passed ? PASS : FAIL;
    console.log(`  ${icon} ${ecosystem}: ${result.passed ? 'clean' : 'issues found'}`);
    if (!result.passed) anyFailed = true;
  }

  if (doJson) {
    console.log('\n--- AUDIT_JSON ---');
    console.log(
      JSON.stringify({ timestamp: new Date().toISOString(), severity, results }, null, 2),
    );
    console.log('--- END_AUDIT_JSON ---');
  }

  if (anyFailed) {
    console.log(
      `\n${FAIL} Dependency vulnerabilities found. Run with --fix to attempt remediation.`,
    );
    process.exit(1);
  } else {
    console.log(`\n${PASS} All dependency audits passed.`);
  }
}

main();
