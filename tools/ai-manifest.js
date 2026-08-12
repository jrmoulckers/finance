#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// AI Manifest Generator — inventory of agents, skills, instructions, MCP servers
// =============================================================================
//
// Suggested package.json script:
//   "ai:manifest": "node tools/ai-manifest.js"
//
// Addresses audit issue #2863. Scans the AI configuration surface and emits a
// machine-readable JSON manifest plus a human-readable Markdown summary. The
// companion check (tools/check-ai-manifest.js) uses this manifest to detect
// drift between hardcoded counts in docs and the actual filesystem.
//
// Sources scanned:
//   - .github/agents/*.agent.md
//   - .github/skills/* / SKILL.md
//   - .github/instructions/*.instructions.md
//   - .vscode/mcp.json  (servers map)
//
// Usage:
//   node tools/ai-manifest.js                 # Markdown + JSON to stdout
//   node tools/ai-manifest.js --json          # JSON only
//   node tools/ai-manifest.js --markdown      # Markdown only
//   node tools/ai-manifest.js --out-dir out   # Also write ai-manifest.{json,md}
//   node tools/ai-manifest.js --help
//
// Plain Node, no dependencies. Always exits 0 (it is a generator, not a check).
// =============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

// `require.main === module` is load-bearing, not decoration. This block calls process.exit at
// module scope, so without the guard `require('./ai-manifest.js')` terminates the REQUIRING
// process whenever `--help` is anywhere in argv -- which is why `check-ai-manifest.js --help`
// printed this generator's help and never its own. The same idiom already guards run() below;
// it was applied to the main block and not to the earlier exit.
if (require.main === module && (args.includes('--help') || args.includes('-h'))) {
  process.stdout.write(`
AI Manifest Generator — Finance monorepo

Usage:
  node tools/ai-manifest.js [options]

Options:
  --json          Emit JSON only
  --markdown      Emit Markdown only
  --out-dir <d>   Also write ai-manifest.json and ai-manifest.md to <d>
  --help, -h      Show this help
`);
  process.exit(0);
}

function argVal(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] === undefined ? fallback : args[i + 1];
}

const jsonOnly = args.includes('--json');
const markdownOnly = args.includes('--markdown');
const outDir = argVal('--out-dir', null);

// ── Scanners ─────────────────────────────────────────────────────────────────
function listFiles(dir, predicate) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isFile() && predicate(d.name))
    .map((d) => d.name)
    .sort();
}

function scanAgents() {
  const files = listFiles('.github/agents', (n) => n.endsWith('.agent.md'));
  return files.map((f) => f.replace(/\.agent\.md$/, ''));
}

function scanSkills() {
  const abs = path.join(ROOT, '.github', 'skills');
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(abs, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

function scanInstructions() {
  const files = listFiles('.github/instructions', (n) => n.endsWith('.instructions.md'));
  return files.map((f) => f.replace(/\.instructions\.md$/, ''));
}

// Strip JSONC (// and /* */ comments + trailing commas) without corrupting
// string contents such as "https://..." URLs. Character scanner that tracks
// string/escape state.
function stripJsonc(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1; // land on '/', loop's i++ consumes it
      continue;
    }
    out += c;
  }
  // Remove trailing commas before } or ].
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function scanMcpServers() {
  const abs = path.join(ROOT, '.vscode', 'mcp.json');
  if (!fs.existsSync(abs)) return [];
  try {
    const raw = fs.readFileSync(abs, 'utf-8').replace(/^\uFEFF/, '');
    const json = JSON.parse(stripJsonc(raw));
    return Object.keys(json.servers || {}).sort();
  } catch {
    return [];
  }
}

function buildManifest() {
  const agents = scanAgents();
  const skills = scanSkills();
  const instructions = scanInstructions();
  const mcpServers = scanMcpServers();

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      agents: '.github/agents/*.agent.md',
      skills: '.github/skills/*/SKILL.md',
      instructions: '.github/instructions/*.instructions.md',
      mcpServers: '.vscode/mcp.json (servers)',
    },
    counts: {
      agents: agents.length,
      skills: skills.length,
      instructions: instructions.length,
      mcpServers: mcpServers.length,
    },
    agents,
    skills,
    instructions,
    mcpServers,
  };
}

function toMarkdown(m) {
  const lines = [];
  lines.push('# AI Configuration Manifest');
  lines.push('');
  lines.push(`- **Generated:** ${m.generatedAt}`);
  lines.push('');
  lines.push('| Surface | Count |');
  lines.push('| ------- | ----- |');
  lines.push(`| Agents | ${m.counts.agents} |`);
  lines.push(`| Skills | ${m.counts.skills} |`);
  lines.push(`| Instructions | ${m.counts.instructions} |`);
  lines.push(`| MCP servers | ${m.counts.mcpServers} |`);
  lines.push('');

  const section = (title, source, items) => {
    lines.push(`## ${title} (${items.length})`);
    lines.push('');
    lines.push(`_Source: \`${source}\`_`);
    lines.push('');
    if (items.length) {
      for (const i of items) lines.push(`- ${i}`);
    } else {
      lines.push('_None found._');
    }
    lines.push('');
  };

  section('Agents', m.sources.agents, m.agents);
  section('Skills', m.sources.skills, m.skills);
  section('Instructions', m.sources.instructions, m.instructions);
  section('MCP Servers', m.sources.mcpServers, m.mcpServers);

  return lines.join('\n');
}

function main() {
  const manifest = buildManifest();
  const markdown = toMarkdown(manifest);

  if (outDir) {
    const dir = path.isAbsolute(outDir) ? outDir : path.join(ROOT, outDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ai-manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(dir, 'ai-manifest.md'), markdown + '\n');
    process.stdout.write(`ai-manifest: wrote JSON + Markdown to ${dir}\n`);
  }

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  } else if (markdownOnly) {
    process.stdout.write(markdown + '\n');
  } else {
    process.stdout.write(markdown + '\n\n');
    process.stdout.write('```json\n');
    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
    process.stdout.write('```\n');
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
    } catch (err) {
      console.error('Could not write GitHub job summary:', err.message);
    }
  }

  process.exit(0);
}

// Export the builder so check-ai-manifest.js can reuse it without re-globbing.
module.exports = { buildManifest, scanAgents, scanSkills, scanInstructions, scanMcpServers };

if (require.main === module) {
  main();
}
