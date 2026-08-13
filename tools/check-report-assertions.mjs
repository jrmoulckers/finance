#!/usr/bin/env node
/**
 * Measure how many interpolated values in tool report lines are actually asserted by a test.
 *
 * Method: direct mutation. For each interpolation site in a printed or pushed report line,
 * substitute a sentinel for the interpolated expression and re-run that tool's own test file.
 * A green run means no test reads that value.
 *
 * This deliberately replaces an earlier literal-fragment heuristic (does the test file contain a
 * static substring of the printed line?). That heuristic's numerator moved 8 -> 0 across a
 * minimum-fragment-length constant nobody chose, and it detects whether a test quotes a static
 * *label*, which is uncorrelated with whether it asserts the interpolated *value*. Two sessions
 * running it on different trees over different populations obtained identical figures, because
 * the figures were a property of the instrument rather than of either repository.
 *
 * Report-only. Not wired into CI: it rewrites source files in place, and runs for ~30 s.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SENTINEL = '${0}';
export const TOOLS_DIR = 'tools';

const PRINT_CALL = /console\.(?:log|error|warn)\(/;
const PUSH_CALL = /\w+\.push\(`/;

/**
 * Find interpolation sites on lines that build report output.
 *
 * @param {string} source Full source text of a tool.
 * @returns {{line: number, expr: string}[]} One entry per `${...}` on a report-building line.
 */
export function reportSites(source) {
  const lines = source.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (!text.includes('${')) continue;
    if (!PRINT_CALL.test(text) && !PUSH_CALL.test(text)) continue;
    for (const m of text.matchAll(/\$\{([^{}]+)\}/g)) {
      out.push({ line: i + 1, expr: m[1] });
    }
  }
  return out;
}

/**
 * Apply a sentinel substitution to one interpolation site.
 *
 * Returns `null` when the substitution is a no-op, which happens when the site's own text already
 * equals the sentinel. Such a site cannot be measured: a surviving mutant would be indistinguishable
 * from an unchanged file, so it is excluded from the denominator rather than counted as unasserted.
 *
 * @param {string[]} lines Source split on newlines.
 * @param {{line: number, expr: string}} site Site to mutate.
 * @param {string} sentinel Replacement text for the whole `${...}` expression.
 * @returns {string[] | null} Mutated lines, or `null` if the substitution changed nothing.
 */
export function mutateSite(lines, site, sentinel) {
  const before = lines[site.line - 1];
  const after = before.replace(`\${${site.expr}}`, sentinel);
  if (after === before) return null;
  const mutated = [...lines];
  mutated[site.line - 1] = after;
  return mutated;
}

/**
 * List tools that have a colocated `*.test.mjs` file.
 *
 * @param {string} dir Directory to scan.
 * @param {{readdirSync: Function, existsSync: Function}} [fsImpl] Injectable fs for tests.
 * @returns {string[]} Tool filenames, sorted.
 */
export function toolsWithTests(dir, fsImpl = fs) {
  return fsImpl
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .filter((f) => fsImpl.existsSync(path.join(dir, f.replace(/\.mjs$/, '.test.mjs'))))
    .sort();
}

/**
 * Summarise a completed run.
 *
 * @param {{tools: number, caught: string[], survivors: string[], unmeasurable: number,
 *   skippedRed: string[]}} result Raw counts.
 * @returns {string[]} Report lines.
 */
export function reportLines(result) {
  const sites = result.caught.length + result.survivors.length;
  const lines = [
    `tools with tests        ${result.tools}`,
    `interpolation sites     ${sites}`,
    `  detected by a test    ${result.caught.length}`,
    `  unasserted            ${result.survivors.length}`,
  ];
  if (result.unmeasurable > 0) {
    lines.push(`  unmeasurable          ${result.unmeasurable} (site text equals the sentinel)`);
  }
  if (result.skippedRed.length > 0) {
    lines.push(
      `  skipped, red baseline ${result.skippedRed.length}: ${result.skippedRed.join(', ')}`,
    );
  }
  return lines;
}

/**
 * Describe what this run did and did not cover.
 *
 * Every figure above is over tools that have a colocated test file and a green baseline. Tools
 * without tests contribute no sites and are therefore invisible in the ratio rather than counted
 * as unasserted -- the omission that would otherwise make the number look better than the tree.
 *
 * @param {{tools: number, allTools: number, skippedRed: string[], sentinel: string}} result Counts.
 * @returns {string[]} Scope lines.
 */
export function scopeLines(result) {
  const untested = result.allTools - result.tools;
  const lines = [
    `Scope: ${result.tools} of ${result.allTools} tools in ${TOOLS_DIR}/ have a colocated test file.`,
  ];
  if (untested > 0) {
    lines.push(
      `  ${untested} tool(s) have no test file; their report lines are unmeasured, not counted as asserted.`,
    );
  }
  if (result.skippedRed.length > 0) {
    lines.push(
      `  ${result.skippedRed.length} tool(s) had a red baseline and were skipped; a red baseline makes every mutant look caught.`,
    );
  }
  lines.push(`  Sentinel: ${result.sentinel}. Counts are stable across sentinel choice;`);
  lines.push(`  a site whose true value equals the sentinel is reported as unmeasurable.`);
  return lines;
}

const runTests = (dir, tool) => {
  try {
    execFileSync(
      process.execPath,
      ['--test', path.join(dir, tool.replace(/\.mjs$/, '.test.mjs'))],
      { stdio: 'pipe', timeout: 180000 },
    );
    return true;
  } catch {
    return false;
  }
};

/**
 * Run the full measurement.
 *
 * @param {{dir?: string, sentinel?: string, run?: Function}} [options] Overrides for tests.
 * @returns {{tools: number, allTools: number, caught: string[], survivors: string[],
 *   unmeasurable: number, skippedRed: string[], sentinel: string}} Result.
 */
export function measure(options = {}) {
  const dir = options.dir ?? TOOLS_DIR;
  const sentinel = options.sentinel ?? DEFAULT_SENTINEL;
  const run = options.run ?? runTests;

  const allTools = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).length;
  const tools = toolsWithTests(dir);

  const caught = [];
  const survivors = [];
  const skippedRed = [];
  let unmeasurable = 0;

  for (const tool of tools) {
    const file = path.join(dir, tool);
    const original = fs.readFileSync(file, 'utf8');
    if (!run(dir, tool)) {
      skippedRed.push(tool);
      continue;
    }
    const lines = original.split('\n');
    try {
      for (const site of reportSites(original)) {
        const mutated = mutateSite(lines, site, sentinel);
        if (mutated === null) {
          unmeasurable++;
          continue;
        }
        fs.writeFileSync(file, mutated.join('\n'));
        const green = run(dir, tool);
        fs.writeFileSync(file, original);
        const label = `${tool}:${site.line}  \${${site.expr}}`;
        if (green) survivors.push(label);
        else caught.push(label);
      }
    } finally {
      // Restore unconditionally: an interrupted run must not leave a mutant on disk.
      fs.writeFileSync(file, original);
    }
  }

  return {
    tools: tools.length - skippedRed.length,
    allTools,
    caught,
    survivors,
    unmeasurable,
    skippedRed,
    sentinel,
  };
}

/**
 * Refuse to run when the working tree is dirty.
 *
 * The measurement rewrites source files in place. On a clean tree a crash is recoverable with
 * `git checkout`; on a dirty tree it could destroy uncommitted work.
 *
 * @returns {string | null} Reason to refuse, or `null` when safe.
 */
export function refuseReason() {
  let status;
  try {
    status = execFileSync('git', ['status', '--porcelain', '--', TOOLS_DIR], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return 'unable to determine git status; refusing to mutate source files';
  }
  if (status.trim() !== '') {
    return `uncommitted changes under ${TOOLS_DIR}/; commit or stash before running`;
  }
  return null;
}

function main() {
  const sentinel = process.argv[2] ?? DEFAULT_SENTINEL;
  const reason = refuseReason();
  if (reason !== null) {
    console.error(`check-report-assertions: ${reason}`);
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  const result = measure({ sentinel });
  for (const line of reportLines(result)) console.log(line);
  console.log('');
  for (const line of scopeLines(result)) console.log(line);
  console.log(`\nelapsed                 ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (result.survivors.length > 0) {
    console.log('\nunasserted sites:');
    for (const s of result.survivors) console.log(`  ${s}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-report-assertions.mjs')) {
  main();
}
