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
const PREPARATION_DOC = 'docs/ai/README.md';
const EXPECTED_CURRENT_ROLE_TARGETS = {
  'accessibility-reviewer': 'canonical:accessibility-reviewer',
  'ai-ops-engineer': 'canonical:ai-ops-engineer',
  'android-engineer': 'canonical:native-app-engineer',
  architect: 'canonical:architect',
  'backend-engineer': 'canonical:backend-engineer',
  'bug-basher': 'task:bug-bash',
  'business-analyst': 'canonical:business-analyst',
  'compliance-specialist': 'canonical:compliance-specialist',
  'data-engineer': 'canonical:data-engineer',
  'design-engineer': 'canonical:design-engineer',
  'devops-engineer': 'canonical:devops-engineer',
  'docs-writer': 'canonical:docs-writer',
  'experimentation-engineer': 'canonical:experimentation-engineer',
  'finance-domain': 'local:finance-domain',
  'ios-engineer': 'canonical:native-app-engineer',
  'kmp-engineer': 'canonical:native-app-engineer',
  'localization-engineer': 'canonical:localization-engineer',
  'marketing-strategist': 'canonical:marketing-strategist',
  'performance-engineer': 'canonical:performance-engineer',
  'product-manager': 'canonical:product-manager',
  'qa-tester': 'canonical:qa-tester',
  'release-manager': 'canonical:release-manager',
  'security-reviewer': 'canonical:security-reviewer',
  'web-engineer': 'canonical:web-engineer',
  'windows-engineer': 'canonical:native-app-engineer',
};
const NEW_CANONICAL_AGENTS = ['database-engineer', 'sre-engineer'];
const PLANNED_CANONICAL_AGENTS = [
  ...new Set([
    ...Object.values(EXPECTED_CURRENT_ROLE_TARGETS)
      .filter((target) => target.startsWith('canonical:'))
      .map((target) => target.slice('canonical:'.length)),
    ...NEW_CANONICAL_AGENTS,
  ]),
].sort();

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

function validateCanonicalPreparation(runtimeAgents) {
  const abs = path.join(ROOT, PREPARATION_DOC);
  if (!fs.existsSync(abs)) return [`${PREPARATION_DOC} is missing`];

  const content = fs.readFileSync(abs, 'utf-8');
  const start = content.indexOf('### Future Canonical Mapping (Not Active)');
  const end = content.indexOf('### Supported AI Tools', start);
  if (start === -1 || end === -1) {
    return [`${PREPARATION_DOC} is missing the bounded future canonical mapping section`];
  }

  const section = content.slice(start, end);
  const mappedRows = [...section.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|$/gm)];
  const mappedTargets = new Map(mappedRows.map((match) => [match[1], match[2]]));
  const mappedCurrentRoles = mappedRows.map((match) => match[1]).sort();
  const expectedCurrentRoles = Object.keys(EXPECTED_CURRENT_ROLE_TARGETS).sort();
  const actualRuntimeRoles = [...runtimeAgents].sort();
  const missingRuntimeRoles = expectedCurrentRoles.filter(
    (role) => !actualRuntimeRoles.includes(role),
  );
  const extraRuntimeRoles = actualRuntimeRoles.filter(
    (role) => !expectedCurrentRoles.includes(role),
  );
  const missingMappings = expectedCurrentRoles.filter((role) => !mappedTargets.has(role));
  const extraMappings = mappedCurrentRoles.filter((role) => !expectedCurrentRoles.includes(role));
  const findings = [];

  if (missingRuntimeRoles.length) {
    findings.push(`runtime roster misses preparation roles: ${missingRuntimeRoles.join(', ')}`);
  }
  if (extraRuntimeRoles.length) {
    findings.push(`runtime roster has unplanned roles: ${extraRuntimeRoles.join(', ')}`);
  }
  if (mappedCurrentRoles.length !== expectedCurrentRoles.length) {
    findings.push(
      `future mapping has ${mappedCurrentRoles.length} current-role rows; expected ${expectedCurrentRoles.length}`,
    );
  }
  if (missingMappings.length) findings.push(`future mapping misses: ${missingMappings.join(', ')}`);
  if (extraMappings.length)
    findings.push(`future mapping has unknown roles: ${extraMappings.join(', ')}`);

  for (const [currentRole, expectedTarget] of Object.entries(EXPECTED_CURRENT_ROLE_TARGETS)) {
    const documentedTarget = mappedTargets.get(currentRole);
    if (!documentedTarget) continue;
    const [kind, target] = expectedTarget.split(':');
    const expectedText =
      kind === 'canonical'
        ? `Canonical \`${target}\``
        : kind === 'local'
          ? `Local \`${target}\` retained`
          : 'No permanent role';
    if (!documentedTarget.includes(expectedText)) {
      findings.push(`${currentRole} maps to "${documentedTarget}", expected ${expectedTarget}`);
    }
  }

  const rosterLine = section
    .split(/\r?\n/)
    .find((line) => line.startsWith('The planned canonical roster is:'));
  const documentedCanonicalAgents = rosterLine
    ? [...rosterLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]).sort()
    : [];
  const missingCanonicalAgents = PLANNED_CANONICAL_AGENTS.filter(
    (role) => !documentedCanonicalAgents.includes(role),
  );
  const extraCanonicalAgents = documentedCanonicalAgents.filter(
    (role) => !PLANNED_CANONICAL_AGENTS.includes(role),
  );
  if (documentedCanonicalAgents.length !== PLANNED_CANONICAL_AGENTS.length) {
    findings.push(
      `planned canonical roster has ${documentedCanonicalAgents.length} roles; ` +
        `expected ${PLANNED_CANONICAL_AGENTS.length}`,
    );
  }
  if (missingCanonicalAgents.length) {
    findings.push(`planned canonical roster misses: ${missingCanonicalAgents.join(', ')}`);
  }
  if (extraCanonicalAgents.length) {
    findings.push(`planned canonical roster has unknown roles: ${extraCanonicalAgents.join(', ')}`);
  }

  const futureCountMatch = section.match(
    /future runtime therefore contains (\d+) physical agent files: (\d+) generated canonical files and one Finance-authored local file/,
  );
  if (!futureCountMatch) {
    findings.push('future runtime count statement is missing');
  } else {
    const physicalCount = Number.parseInt(futureCountMatch[1], 10);
    const canonicalCount = Number.parseInt(futureCountMatch[2], 10);
    if (canonicalCount !== PLANNED_CANONICAL_AGENTS.length) {
      findings.push(
        `future runtime claims ${canonicalCount} canonical files; ` +
          `expected ${PLANNED_CANONICAL_AGENTS.length}`,
      );
    }
    if (physicalCount !== canonicalCount + 1) {
      findings.push(
        `future runtime claims ${physicalCount} physical files; ` +
          `expected ${canonicalCount + 1}`,
      );
    }
  }

  return findings;
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
  const preparationFindings = validateCanonicalPreparation(manifest.agents);

  process.stdout.write('Canonical activation preparation:\n');
  if (preparationFindings.length === 0) {
    process.stdout.write(
      `  [ok] ${manifest.agents.length} current roles mapped; ` +
        `${PLANNED_CANONICAL_AGENTS.length} canonical roles + finance-domain prepared\n\n`,
    );
  } else {
    for (const finding of preparationFindings) process.stdout.write(`  [DRIFT] ${finding}\n`);
    process.stdout.write('\n');
  }

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
  if (drifted.length === 0 && preparationFindings.length === 0) {
    summaryLines.push('✅ No drift between doc counts and the filesystem.');
  } else {
    summaryLines.push(
      `⚠️ Found **${drifted.length}** drifted count claim(s) and ` +
        `**${preparationFindings.length}** canonical-preparation finding(s).`,
    );
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
    for (const finding of preparationFindings) {
      summaryLines.push(`- Canonical preparation: ${finding}`);
      process.stdout.write(
        `::${STRICT ? 'error' : 'warning'} file=${PREPARATION_DOC}::` +
          `Canonical preparation drift: ${finding}\n`,
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

  if (drifted.length === 0 && preparationFindings.length === 0) {
    process.stdout.write('✅ No drift detected.\n');
    process.exit(0);
  }

  if (STRICT) {
    process.stdout.write(
      `❌ ${drifted.length} drifted count claim(s), ` +
        `${preparationFindings.length} canonical-preparation finding(s). Failing (STRICT=1).\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    `⚠️ ${drifted.length} drifted count claim(s), ` +
      `${preparationFindings.length} canonical-preparation finding(s) — informational only. ` +
      'Re-run with STRICT=1 to enforce. Exiting 0.\n',
  );
  process.exit(0);
}

main();
