#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// AI Manifest Drift Check — docs vs. filesystem reality
// =============================================================================
//
// Suggested package.json script:
//   "ai:manifest:check": "node tools/check-ai-manifest.js"
//
// Addresses audit issue #2863. Compares hardcoded counts in human-maintained
// docs against the actual count of agents / skills / instructions / MCP servers
// on disk (via tools/ai-manifest.js).
//
// IMPORTANT — race-safe default:
//   By default this check is READ-ONLY and INFORMATIONAL: it prints findings and
//   exits 0 even when drift is found. This avoids racing other agents who may be
//   editing the docs concurrently. Set STRICT=1 to make drift BLOCKING (exit 1).
//
// Docs scanned for count claims:
//   - docs/ai/README.md
//   - docs/INDEX.md
//   - AGENTS.md
//
// Usage:
//   node tools/check-ai-manifest.js          # warn-only, exit 0
//   STRICT=1 node tools/check-ai-manifest.js # blocking, exit 1 on drift
//   node tools/check-ai-manifest.js --help
//
// Plain Node, no dependencies.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { buildManifest } = require('./ai-manifest.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const STRICT = process.env.STRICT === '1' || args.includes('--strict');

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
AI Manifest Drift Check — Finance monorepo

Usage:
  node tools/check-ai-manifest.js            # warn-only (exit 0)
  STRICT=1 node tools/check-ai-manifest.js   # blocking (exit 1 on drift)

Compares hardcoded counts in docs/ai/README.md, docs/INDEX.md and AGENTS.md
against the real number of agents / skills / instructions / MCP servers on disk.

Default is informational (exit 0) to avoid racing concurrent doc edits.
Set STRICT=1 (or pass --strict) to fail CI on drift.
`);
  process.exit(0);
}

const DOC_FILES = ['docs/ai/README.md', 'docs/INDEX.md', 'AGENTS.md'];

// Each metric maps to: the manifest count key + a regex capturing a claimed
// numeric count immediately preceding the keyword. Regexes are intentionally
// targeted (with qualifier allow-lists) to limit false positives.
const METRICS = [
  {
    key: 'agents',
    label: 'agents',
    regex: /(\d+)\s+(?:AI\s+|active\s+|custom\s+|copilot\s+|total\s+|defined\s+)*agents?\b/gi,
  },
  {
    key: 'skills',
    label: 'skills',
    regex: /(\d+)\s+(?:reusable\s+|domain\s+|agent\s+|total\s+)*skills?\b/gi,
  },
  {
    key: 'instructions',
    label: 'instructions',
    regex: /(\d+)\s+(?:instruction\s+files?|instructions?)\b/gi,
  },
  {
    key: 'mcpServers',
    label: 'MCP servers',
    regex: /(\d+)\s+MCP\s+servers?\b/gi,
  },
];

function scanDoc(relPath, counts) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return { missing: true, findings: [] };
  const content = fs.readFileSync(abs, 'utf-8');
  const lines = content.split(/\r?\n/);
  const findings = [];
  lines.forEach((line, idx) => {
    // Normalize markdown emphasis (**bold**, _italic_, `code`) to spaces so
    // claims like "there are **22** agents" still match, without losing the
    // original line text used for reporting.
    const normalized = line.replace(/[*`_]+/g, ' ');
    for (const metric of METRICS) {
      metric.regex.lastIndex = 0;
      let match;
      while ((match = metric.regex.exec(normalized)) !== null) {
        const claimed = parseInt(match[1], 10);
        const actual = counts[metric.key];
        findings.push({
          file: relPath,
          line: idx + 1,
          metric: metric.label,
          key: metric.key,
          claimed,
          actual,
          drift: claimed !== actual,
          text: line.trim(),
        });
      }
    }
  });
  return { missing: false, findings };
}

function main() {
  const manifest = buildManifest();
  const counts = manifest.counts;

  process.stdout.write('AI Manifest Drift Check\n');
  process.stdout.write('=======================\n');
  process.stdout.write(
    `Filesystem reality: ${counts.agents} agents, ${counts.skills} skills, ` +
      `${counts.instructions} instructions, ${counts.mcpServers} MCP servers\n`,
  );
  process.stdout.write(`Mode: ${STRICT ? 'STRICT (blocking)' : 'informational (warn-only)'}\n\n`);

  let allFindings = [];
  for (const doc of DOC_FILES) {
    const { missing, findings } = scanDoc(doc, counts);
    if (missing) {
      process.stdout.write(`- ${doc}: not found (skipped)\n`);
      continue;
    }
    if (findings.length === 0) {
      process.stdout.write(`- ${doc}: no count claims detected\n`);
    }
    allFindings = allFindings.concat(findings);
  }
  process.stdout.write('\n');

  const drifted = allFindings.filter((f) => f.drift);

  if (allFindings.length) {
    process.stdout.write('Detected count claims:\n');
    for (const f of allFindings) {
      const status = f.drift ? 'DRIFT' : 'ok';
      process.stdout.write(
        `  [${status}] ${f.file}:${f.line} — claims ${f.claimed} ${f.metric}, actual ${f.actual}\n`,
      );
      if (f.drift) process.stdout.write(`           > ${f.text}\n`);
    }
    process.stdout.write('\n');
  }

  // GitHub Actions annotations + job summary.
  const summaryLines = [];
  summaryLines.push('### AI Manifest Drift Check');
  summaryLines.push('');
  summaryLines.push(
    `Filesystem: **${counts.agents}** agents · **${counts.skills}** skills · ` +
      `**${counts.instructions}** instructions · **${counts.mcpServers}** MCP servers`,
  );
  summaryLines.push('');
  if (drifted.length === 0) {
    summaryLines.push('✅ No drift between doc counts and the filesystem.');
  } else {
    summaryLines.push(`⚠️ Found **${drifted.length}** drifted count claim(s):`);
    summaryLines.push('');
    summaryLines.push('| File | Line | Metric | Claimed | Actual |');
    summaryLines.push('| ---- | ---- | ------ | ------- | ------ |');
    for (const f of drifted) {
      summaryLines.push(`| ${f.file} | ${f.line} | ${f.metric} | ${f.claimed} | ${f.actual} |`);
      // Annotation so the drift shows up inline on the PR.
      process.stdout.write(
        `::${STRICT ? 'error' : 'warning'} file=${f.file},line=${f.line}::Manifest drift: ` +
          `claims ${f.claimed} ${f.metric} but filesystem has ${f.actual}\n`,
      );
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join('\n') + '\n');
    } catch (err) {
      console.error('Could not write GitHub job summary:', err.message);
    }
  }

  if (drifted.length === 0) {
    process.stdout.write('✅ No drift detected.\n');
    process.exit(0);
  }

  if (STRICT) {
    process.stdout.write(`❌ ${drifted.length} drifted count claim(s). Failing (STRICT=1).\n`);
    process.exit(1);
  }

  process.stdout.write(
    `⚠️ ${drifted.length} drifted count claim(s) — informational only. ` +
      'Re-run with STRICT=1 to enforce. Exiting 0.\n',
  );
  process.exit(0);
}

main();
