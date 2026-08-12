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
  findings.push(...verifyLockCoverage(lock));
  const source = verifySourceReproduction(lock);
  findings.push(...source.findings);
  const total = source.reproduced + source.unreproduced.length;
  // The unobserved count is printed rather than subtracted away. Reporting only "N of M"
  // over the evaluable population lets the ratio read as coverage of everything recorded,
  // when a recorded-but-absent target was never attempted at all (#4197).
  const unobserved = source.unobserved.length;
  process.stdout.write(
    `  [source] ${source.reproduced} of ${total} managed targets unstamp to their ` +
      `recorded canon source` +
      (unobserved ? `; ${unobserved} recorded targets not evaluable and unobserved` : '') +
      `\n`,
  );
  // States only what was computed. The earlier wording asserted "cause unknown", which was
  // false once the engine documented this entry (copier.mjs:494-499) and would be unfounded
  // for any future path landing here -- the line cannot know the cause of an entry it has
  // just met. Causes belong in the docblock and the issue, not in a per-entry verdict.
  for (const entry of source.unreproduced) {
    process.stdout.write(`  [source] not reproducible from delivered bytes: ${entry} (#4190)\n`);
  }
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

function managedDigest(text) {
  const region = managedRegion(text);
  const payload = region === null ? text : stripTrailing(region);
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

// Bases whose contents the sync engine may own. Used only to bound the coverage walk below.
const MANAGED_BASES = [
  '.github/agents',
  '.github/skills',
  '.github/prompts',
  '.github/instructions',
];

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
function verifyLockCoverage(lock) {
  const findings = [];
  const recorded = new Set(Object.keys(lock.entries || {}));
  let stampedRecorded = 0;
  for (const base of MANAGED_BASES) {
    for (const file of walkFiles(path.join(ROOT, base))) {
      const relPath = path.relative(ROOT, file).split(path.sep).join('/');
      if (!/\.mdx?$/.test(relPath)) continue;
      if (!PROVENANCE_LINE.test(fs.readFileSync(file, 'utf8'))) continue;
      if (recorded.has(relPath)) stampedRecorded += 1;
      else findings.push(`carries canonical provenance but is not a lock entry: ${relPath}`);
    }
  }
  // Premise guard: if nothing stamped is recorded, the walk is not reaching managed files and
  // a clean result means the check stopped observing, not that coverage is complete.
  if (stampedRecorded === 0) {
    findings.push('lock-coverage walk found no recorded canonical file — check is not observing');
  }
  return findings;
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
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
  const lines = text.replace(/\r\n/g, '\n').split('\n');
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
function verifySourceReproduction(lock) {
  const findings = [];
  const unreproduced = [];
  const unobserved = [];
  let reproduced = 0;
  for (const [entry, metadata] of Object.entries(lock.entries || {})) {
    if (!metadata || !metadata.sourceSha256) continue;
    const absolute = path.join(ROOT, entry);
    if (!fs.existsSync(absolute)) {
      unobserved.push(entry);
      continue;
    }
    const text = fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
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
      unreproduced.push(entry);
      continue;
    }
    const digest = crypto.createHash('sha256').update(source.body).digest('hex');
    if (digest === metadata.sourceSha256) reproduced += 1;
    else unreproduced.push(entry);
  }
  // Premise guard, for the same reason the claim this replaces was wrong: a population of
  // zero would make this pass unconditionally and read as confirmation of delivery fidelity.
  if (reproduced === 0) {
    findings.push('no lock entry unstamped to its canon source — check is not observing');
  }
  return { findings, reproduced, unreproduced, unobserved };
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
    const text = fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
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
  managedRegion,
  managedDigest,
  verifyLockCoverage,
  unstampSource,
  commentFamily,
  verifySourceReproduction,
};
