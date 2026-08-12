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
// Matches the delivered provenance stamp for either origin, in either comment syntax the
// engine emits for it. The previous form matched one origin in one syntax
// (`<!-- synced from jrmoulckers/.github ... -->`), which was the third of three independent
// filters hiding the entire vendored token corpus from the coverage walk (#4204). Tokens
// arrive from a different repository AND in block-comment syntax:
//   .github  <!-- synced from jrmoulckers/.github — canonical source; do not edit here -->
//   tokens   /* generated + synced from jrmoulckers/studio @jrm/tokens — do not edit here */
// Still line-anchored, for the original reason: matching as a substring cannot tell a
// delivered stamp from prose or a code span quoting it, and the one deliberately unstamped
// file is the likeliest to quote it.
const PROVENANCE_LINE =
  /^(?:<!--|\/\*|#) (?:generated \+ )?synced from jrmoulckers\/[^\n]*?do not edit here(?: -->| \*\/)?$/m;
// A substring the regex above cannot match without. Used only as a fast prescreen before the
// line-anchored test, which is the expensive part over a repo-wide walk: without it the walk
// runs a multiline regex over ~44 MB and takes ~59s; with it the regex sees only the ~68 files
// that contain the literal, and the walk costs ~4s.
//
// This is a filter, and filters are precisely what hid the token corpus for the life of this
// check (#4204). It is safe only because it is *implied by* the pattern rather than an
// independent guess about the corpus -- every string PROVENANCE_LINE accepts contains it by
// construction -- and there is a test asserting exactly that, over all delivered stamp forms.
// A prefix-read optimization was considered and rejected for failing this standard: the largest
// stamp offset in this repo is 37,605 bytes, in AGENTS.md, so any plausible prefix window would
// have silently dropped one of the three files this issue exists to reach.
const PROVENANCE_HINT = 'synced from jrmoulckers/';
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

// Scans the whole declared corpus and reports what it observed, not only what it objected to.
//
// The count arm is the first thing this tool advertises in `--help`, and its success line asserts
// that counts are consistent. That line was gated on `driftedCounts.length === 0`, and zero
// drifted claims is byte-identical to zero INSPECTED claims -- so rewriting `**23** agents` as
// `twenty-three agents` retires the claim, matches no METRIC, and the tool certifies counts it
// never read (#4212). The claims sit outside AGENTS.md's studio:base managed region, so
// managedDigest is unchanged and verifyManagedContent raises nothing either.
//
// Zero matched claims is not a legitimate state: the corpus is repo-authored documentation that
// exists to carry these claims, so an empty match set means the arm stopped observing rather than
// that the repo is clean. It fails closed, the same way verifyLockCoverage's premise guard does
// (#4204) -- that guard's vocabulary already existed in this file and this arm never got it.
//
// A document that is present but yields no claims is a different state and is NOT a finding:
// docs/INDEX.md is in that state today. It is named in the report instead, because "3 documents
// inspected" and "3 documents contributing claims" are different numbers and the gap is the
// interesting one.
function countCoverageFindings({ claimCount, missing }) {
  const findings = [];
  for (const doc of missing) {
    // Previously printed as `not found (skipped)` with no finding. AGENTS.md is incidentally
    // covered because it is a lock entry; docs/ai/README.md and docs/INDEX.md are not managed
    // targets, so nothing at all observed their absence.
    findings.push(`count-claim document is missing: ${doc}`);
  }
  if (claimCount === 0) {
    findings.push(
      'count-claim scan matched no claims in any document — the count check is not observing (#4212)',
    );
  }
  return findings;
}

function scanDocs(counts, docs = DOC_FILES) {
  const claims = [];
  const missing = [];
  const inert = [];
  for (const doc of docs) {
    const result = scanDoc(doc, counts);
    if (result.missing) {
      missing.push(doc);
      continue;
    }
    if (!result.findings.length) inert.push(doc);
    claims.push(...result.findings);
  }
  return {
    findings: countCoverageFindings({ claimCount: claims.length, missing }),
    claims,
    missing,
    inert,
    inspected: docs.length - missing.length,
    declared: docs.length,
  };
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
  const coverage = lockCoverage(lock);
  findings.push(...coverage.findings);
  // The walk's breadth is stated, not implied. The claim this check makes is repo-wide -- no
  // stamped file anywhere is missing from the lock -- so the number of files it actually
  // entered belongs next to it. A large stamped count reads as thorough and is exactly what
  // stopped anyone asking which directories were never entered (#4217).
  process.stdout.write(
    `  [coverage] walked ${coverage.walked} file(s); ` +
      `${coverage.visitedRecorded} of ${coverage.recordedPresent} present recorded targets visited` +
      (coverage.skipped ? `; ${coverage.skipped} unreadable or past the size cap` : '') +
      '\n',
  );
  const source = verifySourceReproduction(lock);
  findings.push(...source.findings);
  const total = source.reproduced + source.unreproduced.length + source.knownUnreproduced.length;
  // The unobserved count is printed rather than subtracted away. Reporting only "N of M"
  // over the evaluable population lets the ratio read as coverage of everything recorded,
  // when a recorded-but-absent target was never attempted at all (#4197).
  const unobserved = source.unobserved.length;
  process.stdout.write(
    `  [source] ${source.reproduced} of ${total} managed targets unstamp to their ` +
      `recorded canon source` +
      (unobserved ? `; ${unobserved} recorded targets not evaluable and unobserved` : '') +
      (source.unstated.length
        ? `; ${source.unstated.length} recorded targets state no source hash`
        : '') +
      `\n`,
  );
  // Only entries carrying a pinned exemption are reported here. Everything else that fails
  // to reproduce is a finding, so it leaves through the verdict rather than through stdout.
  // The old line labelled every unreproduced entry "(#4190)" unconditionally, which would
  // have attributed the next, unrelated failure to an issue that had nothing to do with it.
  for (const line of sourceDisclosureLines(source.knownUnreproduced)) {
    process.stdout.write(`${line}\n`);
  }
  return findings;
}

// The engine hashes LF-normalized text (`hashText`, lock.mjs:57). Naming it here rather
// than spelling `.replace(/\r\n/g, '\n')` at each call site keeps one word for one rule:
// three inline spellings is what made this normalization impossible to cite accurately,
// and impossible to notice was untested (#4201).
const toLF = (text) => text.replace(/\r\n/g, '\n');

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
//   marker-managed -> sha256 of the region body, TRAILING whitespace stripped, markers excluded
//   whole-file     -> sha256 of the whole file, LF-normalized, not stripped
// The engine is `toLF(inner).replace(/\s+$/, '')` (basemerge.mjs:165, canonicalizeInner).
// `.trim()` is the natural external guess and is wrong: it strips the leading end too, so the
// two rules agree on every region body that does not begin with whitespace and diverge on
// every one that does. This repo's 68 present lock entries contain no instance of that input
// class, so the sweep that derived `.trim()` returned 0 mismatches over a corpus incapable of
// separating the rules -- a true measurement that could not have found this (.github#659).
// Leading whitespace inside a managed region is therefore significant and must be preserved.
const stripTrailing = (text) => text.replace(/\s+$/, '');

// `toLF` is applied here rather than assumed of the caller. Every current caller already
// normalizes at the read, so this is idempotent today -- but this function is exported, the
// precondition was unstated, and a caller that reads a file plainly is the obvious thing to
// write. The rule stated three lines above now runs in full under it (#4201).
function managedDigest(text) {
  const normalized = toLF(text);
  const region = managedRegion(normalized);
  const payload = region === null ? normalized : stripTrailing(region);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Absence is tolerated only under the vendored-token base. The repo-root sync itself has
// already run (the lock's generatedAt is that run's output); these paths are absent because
// the frozen copies were deliberately deleted in #4066/#4076 so the next run repopulates
// them. Absence is the one state the engine's local-modification guard does not block --
// copier.mjs:248 plans `add` unconditionally for a missing path -- so the tolerance
// self-discharges on the next successful run. Deriving it from the path rather than pinning
// a count is what makes that automatic, and any other missing managed target -- a deleted
// skill, prompt, instruction, or root doc -- is reported rather than silently skipped.
// Counts alone cannot catch this: they count lock entries, not files.
const PENDING_SYNC = /(^|\/)vendor\/@jrm\/tokens\//;

// The engine's own delivered bases, kept only as documentation of what it owns. The coverage
// walk no longer bounds itself by them (#4217): deriving roots from the lock made the check
// blind exactly where it was interesting, and all four bases live under `.github`, a directory
// the lock already supplied, so the union contributed nothing it did not already have.

// The inverse of verifyManagedContent: that asks "entry present, is the file there?", this
// asks "file present, is it recorded?". A lock-iterating check cannot reach a canon target
// that never became an entry, and the engine can produce one -- copier.mjs:94 leaves the lock
// untouched on drift, so a member file that already differed from canon at first sync is
// never recorded and is thereafter invisible to every check either side runs.
//
// Only the STAMPED case is decidable here, and it is decidable exactly: the engine writes the
// provenance line, so a stamped file with no entry means engine-written but unrecorded.
// Baseline is 0 and there is no exemption list.
//
// The unstamped case is NOT decidable member-side and this check does not claim it. A canon
// target that drifted before it was ever synced carries no stamp -- the engine never wrote it
// -- so it is indistinguishable from a legitimately Finance-authored file without canon's
// inventory, which the lock does not record (it stores only version/backbone/generatedAt/
// entries). Two such files are known today, reported as .github#669; closing that axis needs
// the backbone at runtime, the owner-gated question in #4141.
// Directories the coverage walk does not enter. Named explicitly and reported, because an
// unnamed exclusion is how this check spent its whole life blind (#4204, #4217). None of these
// can hold an engine-written file: the sync engine writes only to paths it records in the lock,
// and no lock entry has ever named one of them.
const WALK_SKIP = new Set([
  '.git',
  'node_modules',
  '.gradle',
  'build',
  'dist',
  '.turbo',
  '.next',
  'coverage',
]);

// Reports what the walk saw as well as what it objected to. `verifyLockCoverage` keeps the
// findings-only signature every existing test uses; `main` reads the counts so the passing
// summary carries its own measurement rather than asserting coverage it never states.
function lockCoverage(lock) {
  const findings = [];
  const recorded = new Set(Object.keys(lock.entries || {}));
  const seen = new Set();
  let walked = 0;
  let skipped = 0;
  let stampedRecorded = 0;
  let stampedRecordedNonMarkdown = 0;
  for (const file of walkFiles(ROOT)) {
    const relPath = path.relative(ROOT, file).split(path.sep).join('/');
    if (seen.has(relPath)) continue;
    seen.add(relPath);
    walked += 1;
    const text = readTextForStamp(file);
    if (text === null) {
      skipped += 1;
      continue;
    }
    if (!text.includes(PROVENANCE_HINT)) continue;
    if (!PROVENANCE_LINE.test(text)) continue;
    if (recorded.has(relPath)) {
      stampedRecorded += 1;
      if (!/\.mdx?$/.test(relPath)) stampedRecordedNonMarkdown += 1;
    } else {
      findings.push(`carries canonical provenance but is not a lock entry: ${relPath}`);
    }
  }

  // Conservation, and the clause that would have caught #4217. The walk previously derived its
  // roots from the lock -- `entry.split('/')[0]`, guarded by `top !== entry` -- so the three
  // root-level managed files (.gitattributes, AGENTS.md, agency.toml) were structurally
  // unreachable, and 14 of this repo's 16 top-level directories were never entered at all. The
  // claim is repo-wide ("no stamped file is unrecorded") while the walk covered two directories,
  // and the numerator concealed it: 65 stamped files reads as thorough, so nothing invited the
  // question that a 0 would have. Asserting that the walk REACHES every recorded target that
  // exists on disk is the property; a count of what it happened to find is not.
  const recordedPresent = [...recorded].filter((entry) => fs.existsSync(path.join(ROOT, entry)));
  const unvisited = recordedPresent.filter((entry) => !seen.has(entry));
  if (unvisited.length) {
    findings.push(
      `lock-coverage walk never visited ${unvisited.length} recorded target(s) that exist on ` +
        `disk: ${unvisited.slice(0, 5).join(', ')}${unvisited.length > 5 ? ', …' : ''}`,
    );
  }

  // Premise guard, two-sided. The first clause is the original: nothing observed means the walk
  // stopped reaching managed files, and a clean result reports that as complete coverage. The
  // second exists because this check spent its whole life blind to every non-Markdown entry --
  // 23 of 81, the vendored token corpus -- behind three filters that were each a provable no-op
  // when removed alone (#4204). Only the conjunction was load-bearing.
  if (stampedRecorded === 0) {
    findings.push('lock-coverage walk found no recorded canonical file — check is not observing');
  } else if (stampedRecordedNonMarkdown === 0) {
    findings.push(
      'lock-coverage walk observed only Markdown — the non-Markdown corpus is unobserved (#4204)',
    );
  }
  return {
    findings,
    walked,
    skipped,
    stampedRecorded,
    recordedPresent: recordedPresent.length,
    visitedRecorded: recordedPresent.length - unvisited.length,
  };
}

function verifyLockCoverage(lock) {
  return lockCoverage(lock).findings;
}

// Reads a file only if it is plausibly a stamped text file. The size cap keeps a large
// generated artifact from being read on every run, and anything undecodable or unreadable is
// dropped rather than allowed to throw from inside the walk.
//
// Size and content are taken through ONE descriptor: `statSync` followed by `readFileSync`
// checks one path and then reads it again, so the file can change between the two calls
// (js/file-system-race, flagged by CodeQL on this function's first version). That is not
// hypothetical here -- this walk runs over a tree the sync engine writes, so a run overlapping
// a sync is exactly the case. `fstatSync` on an open descriptor measures the object already
// held, and the subsequent reads come from the same object.
const STAMP_READ_LIMIT = 512 * 1024;
function readTextForStamp(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const { size } = fs.fstatSync(fd);
    if (size > STAMP_READ_LIMIT) return null;
    const buffer = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      const read = fs.readSync(fd, buffer, offset, size - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    return buffer.subarray(0, offset).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    if (WALK_SKIP.has(item.name)) return [];
    const full = path.join(dir, item.name);
    return item.isDirectory() ? walkFiles(full) : [full];
  });
}

// Matches the engine's stamp in any comment syntax it emits, for either message. The
// previous literal recognized exactly one combination -- HTML comment, canon message -- and
// silently skipped 11 present entries that carry the stamp in `#`, `/* */`, or the studio
// "generated + synced" wording. A check that skips is worse than one that fails: the count
// it printed read as complete.
const PROVENANCE_STAMP_LINE =
  /^(<!--|\/\*|#|\/\/)\s*(generated \+ )?synced from jrmoulckers\/(\.github|studio)\b/;

// The engine injects its stamp with a shape chosen by the target's comment syntax, so the
// inverse is a switch on file extension rather than a guess. Documented upstream in
// `sync/README.md` and implemented at `provenance.mjs:57-73`:
//
//   hash   `# note\n`     + content -> strip 1   .toml .yml .sh .gitattributes
//   block  `/* note */\n` + content -> strip 1   .css .js .ts .kt .swift
//   html   `<!-- note -->\n\n` + content -> strip 2   .md .html
//   html + frontmatter: spliced after the closing `---` -> strip 1
//   none   content unchanged -> never stamped, so never reaches this
//
// Frontmatter is an exception *inside* the html family, not the top-level variable. This
// tool previously inferred the latter and scored 55 of 65 -- right about `.md`, accidentally
// right elsewhere -- then hedged with a disjunction that offered both strips and accepted a
// match under either.
//
// The switch replaces that hedge and is a tightening, not a rename. Both score 64 of 65 on
// the corpus (html+frontmatter 50/50, html+plain 5/5, hash 1/1, block 8/9), but a disjunction
// also accepts a match under the WRONG strip: for an html file with no frontmatter whose body
// legitimately begins blank, the one-line strip yields a body differing from canon only by a
// leading blank, and nothing in the result distinguishes that from a correct recovery. The
// switch fails closed instead (#4194).
const HASH_EXTENSIONS = new Set(['.toml', '.yml', '.yaml', '.sh', '.gitattributes', '.gitignore']);
const BLOCK_EXTENSIONS = new Set(['.css', '.js', '.mjs', '.cjs', '.ts', '.kt', '.kts', '.swift']);
const HTML_EXTENSIONS = new Set(['.md', '.markdown', '.html']);

function commentFamily(entryPath) {
  const base = path.basename(entryPath);
  // A dotfile with no further dot IS its own extension: path.extname('.gitattributes') is ''.
  const extension =
    base.startsWith('.') && !base.slice(1).includes('.') ? base : path.extname(base);
  if (HASH_EXTENSIONS.has(extension)) return 'hash';
  if (BLOCK_EXTENSIONS.has(extension)) return 'block';
  if (HTML_EXTENSIONS.has(extension)) return 'html';
  return null;
}

// Returns { status: 'no-stamp' } for a file the engine never stamped, { status: 'unknown' }
// for a stamped file whose extension is unclassified, and { status: 'ok', body } otherwise.
//
// 'unknown' is a distinct status rather than a skip on purpose. Skipping a stamped entry
// would shrink the denominator with nothing saying so, which is the silent-channel defect
// this tool already corrected twice (#4190, #4191). The caller discloses it by path.
function unstampSource(entryPath, text) {
  const lines = toLF(text).split('\n');
  const index = lines.findIndex((line) => PROVENANCE_STAMP_LINE.test(line));
  if (index === -1) return { status: 'no-stamp' };
  const family = commentFamily(entryPath);
  if (family === null) return { status: 'unknown' };
  const hasFrontmatter = lines[0].trim() === '---';
  const copy = lines.slice();
  copy.splice(index, family === 'html' && !hasFrontmatter ? 2 : 1);
  return { status: 'ok', body: copy.join('\n') };
}

// Verifies the lock's sourceSha256 against local bytes. The tool previously recorded this
// field as unreachable member-side, on a measurement that hashed each delivered file as it
// sits on disk and matched 0 of 56. That result was real and its reading was wrong:
// sourceSha256 hashes canon BEFORE the stamp is injected, so the delivered form cannot
// match it for any entry, ever -- the measurement could not have come out otherwise. Undo
// the injection and the field reproduces (64 of 65, byte-identical to canon's blob,
// confirmed against `4950ca7e` for workflow.instructions.md). A false impossibility claim
// stops the search, which is why this is a check and not just a corrected comment (#4186).
//
// Marker-managed files are excluded rather than failed: there sourceSha256 covers canon's
// region source, not the whole file, so whole-file unstamping is inapplicable by
// construction. This proves delivery fidelity, NOT currency -- it shows canon said this at
// sync time, never that canon still says it.
//
// Unreproduced entries are disclosed by path rather than raised as findings. Asserting
// corruption on evidence that does not establish it would make the check red on a file
// that must not be deleted. Listing each path means the set cannot grow unnoticed, which
// is the property a bare count lacks.
//
// Absent targets are counted, not dropped. A recorded target that is not on disk cannot be
// evaluated, but excluding it silently shrinks the denominator and lets the ratio read as
// broader coverage than was actually attempted (#4197). It matters here rather than in the
// abstract: nine of the thirteen absent entries share the exact `syncedAt` of the sole
// residue, so that residue is plausibly one visible member of a ten-entry cohort rather
// than an isolated anomaly. The conservation assertion in the suite -- reproduced plus
// unreproduced plus unobserved equals every entry carrying a `sourceSha256` -- is what
// keeps a future exclusion from reappearing as a quietly smaller number.
//
// For `vendor/@jrm/tokens/css/default/tokens.css` specifically, the engine documents the
// cause at `copier.mjs:494-499`: an overlapping run reverted that entry to the hash and
// timestamp of an older revision and the lock was later hand-repaired, so `targetSha256`
// was corrected to match the bytes while `sourceSha256` and `syncedAt` stayed stale. That
// makes it an internally inconsistent entry, not a stamping question -- the strip rule is
// exact for its family, and the recorded source simply belongs to different bytes.
// The single entry the sync engine is known to have left internally inconsistent (#4190).
// The #4062 run wrote a syncedAt OLDER than the one already recorded, rolling ten token
// entries back to their 08-07 values while the delivered bytes stayed at the 08-09 render.
// A consumer cannot repair it: the lock is engine-owned, and hand-repairing one field of
// this entry is what turned a uniformly stale record into a mixed one in the first place.
//
// So it is tolerated -- but as this exact state, never as a class. Both hashes are pinned,
// so a second corruption of the same file does not inherit the exemption, and no other
// entry inherits it at all. And an exemption whose entry has started reproducing again is
// itself a finding: a tolerance that outlives the defect it was written for is a permanent,
// silent downgrade of the only check that would notice the next one.
const KNOWN_UNREPRODUCED = {
  'vendor/@jrm/tokens/css/default/tokens.css': {
    recorded: '343e10b1ac7914f2a3d1255cfc6ffad1930ac1a17da9eb5aa5551e6e4f67062c',
    reproduces: '658721d427c18960232d1ecb45dbed3e54fcccd7e6efdd088d6b5fd47f5401bb',
    issue: '#4190',
  },
};

// Both hashes, as an exported decision rather than an inline conjunction.
//
// The digest half was unpinnable where it stood. `digest` is derived from the delivered bytes
// of `vendor/@jrm/tokens/css/default/tokens.css` -- the one file in this repo that must not be
// modified or regenerated -- so every test able to reach this comparison could only vary the
// OTHER half, the recorded hash. Two tests do exactly that, and one of them is *named* for
// pinning both. Dropping `known.reproduces === digest` left the suite 37/37 green (#4222).
//
// A conjunction whose second conjunct no test can vary is a conjunction in name only. Taking
// the decision out of the loop makes it answerable from arguments instead of from bytes, so
// all four quadrants become reachable without touching the file the exemption is about.
//
// What the dropped half actually protects: `recorded` alone pins the exemption to a corrupt
// RECORD, while `reproduces` pins it to the corrupt BYTES. Without the second, the exemption
// absorbs any future corruption of this path whose record happens to still read 343e10b1 --
// which is precisely the "second corruption is not inherited" promise made at KNOWN_UNREPRODUCED.
function exemptionMatches(entry, recordedSource, digest) {
  const known = KNOWN_UNREPRODUCED[entry];
  if (!known) return false;
  return known.recorded === recordedSource && known.reproduces === digest;
}

// The disclosure the prose promises: one line per path, never a count. Returned rather than
// written so the promise is assertable -- as a loop inside main() it was reachable by no test,
// and emptying it left the suite green (#4222). A count cannot grow unnoticed into a set.
function sourceDisclosureLines(knownUnreproduced) {
  return knownUnreproduced.map(
    (entry) =>
      `  [source] not reproducible from delivered bytes: ${entry} ` +
      `(${KNOWN_UNREPRODUCED[entry].issue}, known and pinned)`,
  );
}

function verifySourceReproduction(lock) {
  const findings = [];
  const unreproduced = [];
  const knownUnreproduced = [];
  const unobserved = [];
  // #4207: entries carrying no sourceSha256 were skipped by a bare `continue`, leaving them
  // absent from every bucket. The population is 0 today, which is exactly why it is worth a
  // name -- a vacuous exclusion is indistinguishable from a correct one until it isn't.
  const unstated = [];
  const reproducedEntries = new Set();
  for (const [entry, metadata] of Object.entries(lock.entries || {})) {
    if (!metadata || !metadata.sourceSha256) {
      unstated.push(entry);
      continue;
    }
    const absolute = path.join(ROOT, entry);
    if (!fs.existsSync(absolute)) {
      unobserved.push(entry);
      continue;
    }
    const text = toLF(fs.readFileSync(absolute, 'utf8'));
    if (managedRegion(text) !== null) {
      unobserved.push(entry);
      continue;
    }
    const source = unstampSource(entry, text);
    if (source.status === 'no-stamp') {
      unobserved.push(entry);
      continue;
    }
    if (source.status === 'unknown') {
      unreproduced.push({ entry, recorded: metadata.sourceSha256, digest: null });
      continue;
    }
    const digest = crypto.createHash('sha256').update(source.body).digest('hex');
    if (digest === metadata.sourceSha256) {
      reproducedEntries.add(entry);
      continue;
    }
    if (exemptionMatches(entry, metadata.sourceSha256, digest)) {
      knownUnreproduced.push(entry);
      continue;
    }
    unreproduced.push({ entry, recorded: metadata.sourceSha256, digest });
  }
  // Lock keys are unique, so set size is the count; deriving it removes the possibility of
  // a counter and a collection disagreeing about the same population.
  const reproduced = reproducedEntries.size;
  // An unreproduced entry is a delivery-integrity failure and must reach the verdict. It
  // previously reached stdout only, so --strict passed a lock whose recorded source and
  // delivered bytes disagreed -- and would have passed the next one identically (#4209).
  for (const item of unreproduced) {
    findings.push(
      `delivered bytes do not reproduce the recorded canon source: ${item.entry} ` +
        `(bytes unstamp to ${item.digest ? item.digest.slice(0, 12) : '<unstampable>'}, ` +
        `lock records ${item.recorded.slice(0, 12)})`,
    );
  }
  for (const [entry, known] of Object.entries(KNOWN_UNREPRODUCED)) {
    if (!reproducedEntries.has(entry)) continue;
    findings.push(
      `stale reproduction exemption: ${entry} now reproduces its recorded source, so ` +
        `${known.issue} appears repaired — delete the exemption rather than carrying it`,
    );
  }
  // A conservation law rather than a pinned count: every recorded entry lands in exactly one
  // bucket. Counts decay with the corpus; the partition does not.
  const recorded = Object.keys(lock.entries || {}).length;
  const partitioned =
    reproduced +
    unreproduced.length +
    knownUnreproduced.length +
    unobserved.length +
    unstated.length;
  if (partitioned !== recorded) {
    findings.push(
      `source reproduction accounting lost ${recorded - partitioned} of ${recorded} ` +
        `recorded entries — a population was excluded without being named`,
    );
  }
  // Premise guard, for the same reason the claim this replaces was wrong: a population of
  // zero would make this pass unconditionally and read as confirmation of delivery fidelity.
  if (reproduced === 0) {
    findings.push('no lock entry unstamped to its canon source — check is not observing');
  }
  return { findings, reproduced, unreproduced, knownUnreproduced, unobserved, unstated };
}

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
    const text = toLF(fs.readFileSync(absolute, 'utf8'));
    const digest = managedDigest(text);
    if (digest !== metadata.targetSha256) {
      const scope = managedRegion(text) === null ? 'managed file' : 'managed region';
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
  //
  // The wording is deliberate: this asserts "unmodified since sync", NOT "current with
  // canon". targetSha256 records what was delivered; sourceSha256 records what canon
  // looked like at sync time. Canon can therefore move arbitrarily far ahead while every
  // check here stays green, and a stale file defeats detection by existing.
  // Closing that requires comparing against the backbone at runtime, which is the open
  // owner-gated question in #4141. Until then this line must not imply currency.
  process.stdout.write(
    `  [content] ${verified} managed targets unmodified since sync` +
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

  const scan = scanDocs(counts);
  const countFindings = scan.claims;
  const driftedCounts = countFindings.filter((finding) => finding.drift);
  const activationFindings = [
    ...scan.findings,
    ...validateAgentRoster(manifest.agents),
    ...validateActivationDoc(),
    ...validateSyncLock(),
  ];
  for (const doc of scan.missing) process.stdout.write(`- ${doc}: not found\n`);
  // Printed unconditionally, in both the passing and the failing branch. The old report emitted
  // the "Detected count claims:" section only when the set was non-empty, so the sole trace of a
  // zero was a section that did not appear -- and an absent section is not a report (#4212).
  process.stdout.write(
    `Count claims: ${countFindings.length} claim(s) across ` +
      `${scan.inspected} of ${scan.declared} declared document(s)` +
      (scan.inert.length ? `; no claims in ${scan.inert.join(', ')}` : '') +
      '\n',
  );

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
    // Name the axis in the success line, not just in the detail lines above it.
    // "No drift detected" is true and reads as "this repo is in good order" -- and nothing
    // here can distinguish those. Every managed file can be provably unmodified since sync
    // while being an arbitrarily stale copy of canon: `targetSha256` hashes member-local
    // content and is self-contained, but currency needs canon's CURRENT hash, which no
    // member-side run can obtain (#4174, and .github#582 for the fleet-wide measurement).
    // The more accurate this check gets, the more confidently the wrong inference is drawn.
    process.stdout.write(
      '✅ No drift detected — counts, activation, and managed content are consistent ' +
        'with the last sync. Currency against canon is out of scope here (#4174).\n',
    );
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

// Guarded so the digest rule can be exercised by tools/check-ai-manifest.test.mjs. `main()`
// calls process.exit, so an unguarded call would terminate any importer.
if (require.main === module) {
  main();
}

module.exports = {
  toLF,
  PROVENANCE_LINE,
  PROVENANCE_HINT,
  DOC_FILES,
  METRICS,
  scanDoc,
  scanDocs,
  countCoverageFindings,
  managedRegion,
  managedDigest,
  verifyLockCoverage,
  lockCoverage,
  WALK_SKIP,
  unstampSource,
  commentFamily,
  verifySourceReproduction,
  KNOWN_UNREPRODUCED,
  exemptionMatches,
  sourceDisclosureLines,
};
