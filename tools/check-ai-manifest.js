#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildManifest } = require('./ai-manifest.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const STRICT = process.env.STRICT === '1' || args.includes('--strict');
const ACTIVATION_DOC = 'docs/ai/README.md';
// The stamp is delivered as a standalone comment on its own line. Matching it as a substring
// cannot tell the delivered stamp from prose or a code span that quotes it — which the one
// deliberately unstamped file is the most likely file to do — so match the delivered form.
const PROVENANCE_LINE =
  /^<!-- synced from jrmoulckers\/\.github — canonical source; do not edit here -->$/m;
const GENERATED_AGENTS = [
  'accessibility-reviewer',
  'ai-ops-engineer',
  'architect',
  'backend-engineer',
  'business-analyst',
  'compliance-specialist',
  'data-engineer',
  'database-engineer',
  'design-engineer',
  'devops-engineer',
  'docs-writer',
  'experimentation-engineer',
  'localization-engineer',
  'marketing-strategist',
  'native-app-engineer',
  'performance-engineer',
  'product-manager',
  'qa-tester',
  'release-manager',
  'security-reviewer',
  'sre-engineer',
  'web-engineer',
];
const LOCAL_AGENTS = ['finance-domain'];
const EXPECTED_AGENTS = [...GENERATED_AGENTS, ...LOCAL_AGENTS].sort();
const RETIRED_AGENT_FILES = [
  'android-engineer.agent.md',
  'bug-basher.agent.md',
  'ios-engineer.agent.md',
  'kmp-engineer.agent.md',
  'windows-engineer.agent.md',
];
const MANAGED_COUNTS = {
  agents: 22,
  skills: 19,
  prompts: 8,
  instructions: 5,
  tokens: 23,
  base: 2,
  rootDocs: 2,
  total: 81,
};

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
AI Manifest Drift Check — Finance monorepo

Usage:
  node tools/check-ai-manifest.js            # warn-only (exit 0)
  node tools/check-ai-manifest.js --strict   # blocking (exit 1 on drift)
  STRICT=1 node tools/check-ai-manifest.js   # blocking (exit 1 on drift)

Validates filesystem counts, the exact 23-agent activated roster, generated
provenance, the sole local finance-domain agent, retired-role absence, canonical
runtime documentation, and the 81-entry Studio sync inventory.
`);
  process.exit(0);
}

const DOC_FILES = ['docs/ai/README.md', 'docs/INDEX.md', 'AGENTS.md'];
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

// A wrapped prose paragraph and a wrapped list item are the constructs a markdown formatter
// re-flows, so neither may be assumed to keep its line breaks. These markers begin a new
// logical line; lines that follow without one are continuations of it.
const STRUCTURED_LINE = /^(\s*([-*+]|\d+\.)\s|\s*[|>#]|\s*```|\s{4,}\S)/;

/**
 * Split text into logical lines, joining wrapped prose and wrapped list items.
 *
 * Pinned phrases and `<number> <noun>` metric claims are asserted against text that no
 * formatter promises to leave hard-wrapped where it is today. Matching physical lines makes
 * every such assertion depend on wrap position: a re-wrap silently drops metric matches and
 * splits the roster statement, which reports as missing content rather than as a format change.
 * Whitespace is never the content being asserted, so collapsing it weakens nothing — a
 * genuinely absent phrase or wrong number still fails.
 *
 * A new logical line begins at each structural marker, so continuation lines join the item
 * they belong to and a number in one bullet can never pair with a noun in the next. Fenced
 * code is emitted verbatim, including any blank lines inside it.
 *
 * @param {string} text Raw document or section text.
 * @returns {{ text: string, line: number }[]} Logical lines with their 1-based start line.
 */
function logicalLines(text) {
  const physical = text.split(/\r?\n/);
  const out = [];
  let buffer = [];
  let start = 0;
  let fenced = false;

  const flush = () => {
    if (!buffer.length) return;
    out.push({ text: buffer.map((line) => line.trim()).join(' '), line: start + 1 });
    buffer = [];
  };

  physical.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      flush();
      fenced = !fenced;
      out.push({ text: line, line: index + 1 });
      return;
    }
    if (fenced) {
      out.push({ text: line, line: index + 1 });
      return;
    }
    if (line.trim() === '') {
      flush();
      return;
    }
    if (STRUCTURED_LINE.test(line)) {
      flush();
      start = index;
      buffer = [line];
      return;
    }
    if (!buffer.length) start = index;
    buffer.push(line);
  });
  flush();
  return out;
}

function scanDoc(relPath, counts) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return { missing: true, findings: [] };

  const lines = logicalLines(fs.readFileSync(abs, 'utf8'));
  const findings = [];
  lines.forEach((entry) => {
    const line = entry.text;
    const normalized = line.replace(/[*`_]+/g, ' ');
    for (const metric of METRICS) {
      metric.regex.lastIndex = 0;
      let match;
      while ((match = metric.regex.exec(normalized)) !== null) {
        const claimed = Number.parseInt(match[1], 10);
        const actual = counts[metric.key];
        findings.push({
          file: relPath,
          line: entry.line,
          metric: metric.label,
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

function difference(left, right) {
  return left.filter((value) => !right.includes(value));
}

function readJson(relPath, findings) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    findings.push(`${relPath} is missing`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (error) {
    findings.push(`${relPath} is invalid JSON: ${error.message}`);
    return null;
  }
}

function validateAgentRoster(runtimeAgents) {
  const findings = [];
  const actual = [...runtimeAgents].sort();
  const missing = difference(EXPECTED_AGENTS, actual);
  const extra = difference(actual, EXPECTED_AGENTS);
  if (missing.length) findings.push(`runtime roster misses: ${missing.join(', ')}`);
  if (extra.length) findings.push(`runtime roster has unknown roles: ${extra.join(', ')}`);

  for (const role of GENERATED_AGENTS) {
    const relPath = `.github/agents/${role}.agent.md`;
    const abs = path.join(ROOT, relPath);
    if (!fs.existsSync(abs)) continue;
    if (!PROVENANCE_LINE.test(fs.readFileSync(abs, 'utf8'))) {
      findings.push(`${relPath} is missing canonical provenance`);
    }
  }

  for (const role of LOCAL_AGENTS) {
    const relPath = `.github/agents/${role}.agent.md`;
    const abs = path.join(ROOT, relPath);
    if (!fs.existsSync(abs)) continue;
    if (PROVENANCE_LINE.test(fs.readFileSync(abs, 'utf8'))) {
      findings.push(`${relPath} must remain Finance-authored, not generated`);
    }
  }

  for (const file of RETIRED_AGENT_FILES) {
    if (fs.existsSync(path.join(ROOT, '.github', 'agents', file))) {
      findings.push(`retired runtime file remains: .github/agents/${file}`);
    }
  }

  return findings;
}

function validateActivationDoc() {
  const abs = path.join(ROOT, ACTIVATION_DOC);
  if (!fs.existsSync(abs)) return [`${ACTIVATION_DOC} is missing`];

  const content = fs.readFileSync(abs, 'utf8');
  const start = content.indexOf('### Canonical Runtime Roster');
  const end = content.indexOf('### Supported AI Tools', start);
  if (start === -1 || end === -1) {
    return [`${ACTIVATION_DOC} is missing the bounded canonical runtime roster section`];
  }

  const section = logicalLines(content.slice(start, end))
    .map((entry) => entry.text)
    .join('\n');
  const rosterLine = section
    .split('\n')
    .find((line) => line.startsWith('The generated canonical roster is:'));
  const documented = rosterLine
    ? [...rosterLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]).sort()
    : [];
  const findings = [];
  const missing = difference(GENERATED_AGENTS, documented);
  const extra = difference(documented, GENERATED_AGENTS);
  if (documented.length !== GENERATED_AGENTS.length) {
    findings.push(
      `documented generated roster has ${documented.length} roles; expected ${GENERATED_AGENTS.length}`,
    );
  }
  if (missing.length) findings.push(`documented generated roster misses: ${missing.join(', ')}`);
  if (extra.length)
    findings.push(`documented generated roster has unknown roles: ${extra.join(', ')}`);

  const countMatch = section.match(
    /active runtime contains (\d+) physical agent files: (\d+) generated canonical files and one Finance-authored local file, `finance-domain`/,
  );
  if (!countMatch) {
    findings.push('active runtime count statement is missing');
  } else if (
    Number(countMatch[1]) !== EXPECTED_AGENTS.length ||
    Number(countMatch[2]) !== GENERATED_AGENTS.length
  ) {
    findings.push(
      `active runtime count statement must be ${EXPECTED_AGENTS.length} physical / ${GENERATED_AGENTS.length} generated`,
    );
  }

  return findings;
}

function validateSyncLock() {
  const findings = [];
  const lock = readJson('.studio-sync.lock.json', findings);
  if (!lock) return findings;
  if (lock.version !== 1) findings.push(`sync lock version is ${lock.version}; expected 1`);
  if (lock.backbone !== 'jrmoulckers/.github') {
    findings.push(`sync lock backbone is ${lock.backbone}; expected jrmoulckers/.github`);
  }

  const entries = Object.keys(lock.entries || {});
  // Counts and the exhaustiveness assertion below are both derived from this one table,
  // so a kind can never be counted by one and missed by the other.
  const KIND_PREDICATES = {
    agents: (entry) => entry.startsWith('.github/agents/'),
    skills: (entry) => entry.startsWith('.github/skills/'),
    prompts: (entry) => entry.startsWith('.github/prompts/'),
    instructions: (entry) => entry.startsWith('.github/instructions/'),
    // Tolerates the pre- and post-migration vendored token roots
    // (apps/web/vendor/@jrm/tokens/ vs. vendor/@jrm/tokens/) so the check stays
    // green until the sync engine regenerates the lock at the new target path.
    tokens: (entry) => /(^|\/)vendor\/@jrm\/tokens\//.test(entry),
    base: (entry) => entry === 'AGENTS.md' || entry === 'agency.toml',
    rootDocs: (entry) => entry === '.gitattributes' || entry === '.github/copilot-instructions.md',
  };
  const counts = { total: entries.length };
  for (const [kind, predicate] of Object.entries(KIND_PREDICATES)) {
    counts[kind] = entries.filter(predicate).length;
  }
  for (const [kind, expected] of Object.entries(MANAGED_COUNTS)) {
    if (counts[kind] !== expected) {
      findings.push(`sync lock has ${counts[kind]} managed ${kind}; expected ${expected}`);
    }
  }

  // The kind buckets must exhaustively partition the lock. `total` is a cardinality,
  // so it only catches entries being added or dropped -- an entry that is *substituted*
  // inside a region no bucket matches keeps every count correct and passes silently.
  // Asserting exhaustiveness fails on a future managed asset landing in an unmatched
  // path, rather than only on the two entries that exposed the gap.
  const predicates = Object.values(KIND_PREDICATES);
  const unclassified = entries.filter((entry) => !predicates.some((match) => match(entry)));
  if (unclassified.length) {
    findings.push(
      `sync lock has ${unclassified.length} entries in no counted kind: ${unclassified.join(', ')}`,
    );
  }

  for (const role of GENERATED_AGENTS) {
    const entry = `.github/agents/${role}.agent.md`;
    if (!entries.includes(entry)) findings.push(`sync lock misses generated agent: ${role}`);
  }
  if (entries.includes('.github/agents/finance-domain.agent.md')) {
    findings.push('sync lock must not manage local agent finance-domain');
  }
  for (const file of RETIRED_AGENT_FILES) {
    if (entries.includes(`.github/agents/${file}`)) {
      findings.push(`sync lock retains retired agent: ${file}`);
    }
  }

  for (const [entry, metadata] of Object.entries(lock.entries || {})) {
    if (!metadata.sourceSha256 || !metadata.targetSha256 || !metadata.syncedAt) {
      findings.push(`sync lock entry is incomplete: ${entry}`);
    }
  }

  findings.push(...verifyManagedContent(lock));
  return findings;
}

// Markers delimiting a managed region, per comment syntax of the host file.
// Group 2 is the region body; the markers themselves are excluded from the digest.
const REGION_MARKERS = [
  /^<!-- studio:([\w-]+):start -->\n([\s\S]*?)^<!-- studio:\1:end -->$/m,
  /^# studio:([\w-]+):start\n([\s\S]*?)^# studio:\1:end$/m,
];

function managedRegion(text) {
  for (const pattern of REGION_MARKERS) {
    const match = text.match(pattern);
    if (match) return match[2];
  }
  return null;
}

// Reproduces the sync engine's targetSha256. The two shapes differ in trimming, so a
// single rule verifies one group and reports false drift on the other:
//   marker-managed -> sha256 of the region body, trimmed, markers excluded
//   whole-file     -> sha256 of the whole file, LF-normalized, NOT trimmed
// Verified against every present lock entry: 3 region, 65 whole, 0 mismatches.
// Absence is tolerated only for the vendored token outputs still awaiting the repo-root
// sync (see #4169). Deriving the tolerance from that path rather than pinning a count
// means it shrinks to zero on its own when the sync lands, and any other missing managed
// target -- a deleted skill, prompt, instruction, or root doc -- is reported rather than
// silently skipped. Counts alone cannot catch this: they count lock entries, not files.
const PENDING_SYNC = /(^|\/)vendor\/@jrm\/tokens\//;

function verifyManagedContent(lock) {
  const findings = [];
  const pending = [];
  let verified = 0;
  for (const [entry, metadata] of Object.entries(lock.entries || {})) {
    if (!metadata || !metadata.targetSha256) continue;
    const absolute = path.join(ROOT, entry);
    // Presence before classification: an absent target has no content to classify, and
    // must not fall through to a whole-file compare that would report permanent drift.
    if (!fs.existsSync(absolute)) {
      if (PENDING_SYNC.test(entry)) pending.push(entry);
      else findings.push(`managed target is missing: ${entry}`);
      continue;
    }
    const text = fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
    const region = managedRegion(text);
    const payload = region === null ? text : region.trim();
    const digest = crypto.createHash('sha256').update(payload).digest('hex');
    if (digest !== metadata.targetSha256) {
      const scope = region === null ? 'managed file' : 'managed region';
      findings.push(
        `${scope} was edited after sync: ${entry} ` +
          `(sha256 ${digest.slice(0, 12)}, lock records ${metadata.targetSha256.slice(0, 12)})`,
      );
    } else {
      verified += 1;
    }
  }
  // Report what was verified, not only what was skipped. A run that verifies nothing must
  // be distinguishable at a glance from one that verifies everything -- otherwise the
  // check can stop observing while still reading as success.
  process.stdout.write(
    `  [content] ${verified} managed targets verified against the lock` +
      (pending.length ? `; ${pending.length} awaiting the next sync run` : '') +
      '\n',
  );
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

  let countFindings = [];
  for (const doc of DOC_FILES) {
    const { missing, findings } = scanDoc(doc, counts);
    if (missing) process.stdout.write(`- ${doc}: not found (skipped)\n`);
    countFindings = countFindings.concat(findings);
  }
  const driftedCounts = countFindings.filter((finding) => finding.drift);
  const activationFindings = [
    ...validateAgentRoster(manifest.agents),
    ...validateActivationDoc(),
    ...validateSyncLock(),
  ];

  process.stdout.write('Canonical runtime activation:\n');
  if (activationFindings.length === 0) {
    process.stdout.write(
      `  [ok] ${GENERATED_AGENTS.length} generated canonical agents + ` +
        `${LOCAL_AGENTS.length} local agent; ${MANAGED_COUNTS.total} managed assets\n\n`,
    );
  } else {
    for (const finding of activationFindings) process.stdout.write(`  [DRIFT] ${finding}\n`);
    process.stdout.write('\n');
  }

  if (countFindings.length) {
    process.stdout.write('Detected count claims:\n');
    for (const finding of countFindings) {
      process.stdout.write(
        `  [${finding.drift ? 'DRIFT' : 'ok'}] ${finding.file}:${finding.line} — ` +
          `claims ${finding.claimed} ${finding.metric}, actual ${finding.actual}\n`,
      );
      if (finding.drift) process.stdout.write(`           > ${finding.text}\n`);
    }
    process.stdout.write('\n');
  }

  const summaryLines = [
    '### AI Manifest Drift Check',
    '',
    `Filesystem: **${counts.agents}** agents · **${counts.skills}** skills · ` +
      `**${counts.instructions}** instructions · **${counts.mcpServers}** MCP servers`,
    '',
  ];
  if (driftedCounts.length === 0 && activationFindings.length === 0) {
    summaryLines.push(
      '✅ Counts, canonical provenance, local roster, and sync inventory are valid.',
    );
  } else {
    summaryLines.push(
      `⚠️ Found **${driftedCounts.length}** drifted count claim(s) and ` +
        `**${activationFindings.length}** canonical-activation finding(s).`,
    );
    for (const finding of driftedCounts) {
      process.stdout.write(
        `::${STRICT ? 'error' : 'warning'} file=${finding.file},line=${finding.line}::` +
          `Manifest drift: claims ${finding.claimed} ${finding.metric} but filesystem has ${finding.actual}\n`,
      );
    }
    for (const finding of activationFindings) {
      summaryLines.push(`- Canonical activation: ${finding}`);
      process.stdout.write(
        `::${STRICT ? 'error' : 'warning'} file=${ACTIVATION_DOC}::` +
          `Canonical activation drift: ${finding}\n`,
      );
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summaryLines.join('\n')}\n`);
    } catch (error) {
      console.error('Could not write GitHub job summary:', error.message);
    }
  }

  if (driftedCounts.length === 0 && activationFindings.length === 0) {
    process.stdout.write('✅ No drift detected.\n');
    process.exit(0);
  }
  const result =
    `${driftedCounts.length} drifted count claim(s), ` +
    `${activationFindings.length} canonical-activation finding(s)`;
  if (STRICT) {
    process.stdout.write(`❌ ${result}. Failing (STRICT=1).\n`);
    process.exit(1);
  }
  process.stdout.write(`⚠️ ${result} — informational only. Re-run with STRICT=1 to enforce.\n`);
  process.exit(0);
}

main();
