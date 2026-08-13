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
const RETURN_TEMPLATE = /return\s+`/;
// A report line may also be a bare template literal used as an array element or a call argument,
// e.g. `const lines = [`a ${x}`, `b ${y}`];`. Those carry the same values as a logged line and
// were invisible to an earlier version of this detector that only looked at calls -- which meant
// extracting a printer into a returning function removed its sites from the population instead of
// making them asserted, improving the ratio for the wrong reason.
const BARE_TEMPLATE = /^`/;
// `process.stdout.write` is report output that `console.*` does not cover. Two such sites existed
// in this tree, both written in the same session that published a coverage ratio computed without
// them, so the ratio's denominator omitted report lines the same author had just added (#4317).
const STREAM_WRITE = /process\.(?:stdout|stderr)\.write\(/;
// An array of report lines built in one expression -- `return ['', 'header:', ...xs.map(...)]`.
// The elements are report output; only those beginning a line were caught by BARE_TEMPLATE.
const ARRAY_BUILDER = /(?:return|=)\s*\[/;
// Prose is not output. This guard is required only by ARRAY_BUILDER, which is loose enough to
// match a comment illustrating the shape -- measured: the four original shapes matched zero
// comment lines across 330 sites, and the first line ARRAY_BUILDER newly matched was the comment
// above documenting BARE_TEMPLATE. A detector that counts its own explanation is measuring prose.
const COMMENT = /^(?:\/\/|\*|\/\*)/;

/**
 * Decide whether a line builds report output.
 *
 * One predicate, used by both `reportSites` and `unclassifiedSites`, so the counted and the
 * declined populations cannot disagree about where the boundary is.
 *
 * @param {string} text Raw source line.
 * @returns {boolean} True when the line builds report output.
 */
export function buildsReport(text) {
  const trimmed = text.trim();
  if (COMMENT.test(trimmed)) return false;
  return (
    PRINT_CALL.test(text) ||
    PUSH_CALL.test(text) ||
    RETURN_TEMPLATE.test(text) ||
    STREAM_WRITE.test(text) ||
    (ARRAY_BUILDER.test(text) && text.includes('`')) ||
    BARE_TEMPLATE.test(trimmed)
  );
}

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
    if (!buildsReport(text)) continue;
    for (const m of text.matchAll(/\$\{([^{}]+)\}/g)) {
      out.push({ line: i + 1, expr: m[1] });
    }
  }
  return out;
}

/**
 * Count interpolation sites this detector declined to treat as report output.
 *
 * The ratio this tool publishes has a denominator drawn by six regexes, and a site those regexes
 * miss is absent from *both* the numerator and the denominator -- so the percentage describes a
 * subset, and is only trustworthy if that subset's assertion rate matches the whole. It need not.
 *
 * An earlier version of this comment claimed the omission "biases the percentage upward," on the
 * reasoning that a missed site cannot be counted as unasserted. That reasoning is wrong: a missed
 * site cannot be counted as *asserted* either. Measured when the boundary was widened, all six
 * newly included sites turned out to be asserted, so the old boundary had been understating the
 * ratio by 1.0pp -- the opposite of the claimed direction. Asserting a sign without measuring it
 * is the same error this tool exists to find.
 *
 * Most of this residue is legitimately not report output -- regex construction, key building,
 * error messages. The number is published as a magnitude to watch, not as a defect count.
 *
 * @param {string} source Full source text of a tool.
 * @returns {number} Interpolation sites on non-report lines.
 */
export function unclassifiedSites(source) {
  let count = 0;
  for (const text of source.split('\n')) {
    if (!text.includes('${') || buildsReport(text)) continue;
    count += [...text.matchAll(/\$\{([^{}]+)\}/g)].length;
  }
  return count;
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
 * @param {{tools: number, allTools: number, skippedRed: string[], sentinel: string,
 *   unclassified?: number}} result Counts.
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
  if (result.unclassified > 0) {
    lines.push(
      `  ${result.unclassified} interpolation site(s) were not classified as report output and are outside`,
    );
    lines.push(
      `  the ratio entirely -- absent from both numerator and denominator, so the percentage`,
    );
    lines.push(
      `  describes a subset whose assertion rate need not match the whole. The direction of that`,
    );
    lines.push(`  error is not knowable a priori; this figure is how much the ratio never saw.`);
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
  let unclassified = 0;

  for (const tool of tools) {
    const file = path.join(dir, tool);
    const original = fs.readFileSync(file, 'utf8');
    if (!run(dir, tool)) {
      skippedRed.push(tool);
      continue;
    }
    unclassified += unclassifiedSites(original);
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
    unclassified,
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

/**
 * Determine which tools are invoked by a workflow, directly or via an npm script.
 *
 * Wiring and assertion coverage are independent properties (#4303). Measured across finance's 15
 * tested tools, all four quadrants of the cross are populated: the two best-asserted tools are
 * both unwired, and two required gates score 0%. Treating "inert" as a single summary judgement
 * covering both conflates a tool nothing runs with a tool nothing checks, and the remedies differ
 * -- the first needs a workflow step, the second needs a callable report surface.
 *
 * @param {typeof fs} [fsImpl] Injectable filesystem.
 * @returns {Set<string>} Tool filenames referenced by at least one workflow.
 */
export function wiredTools(fsImpl = fs) {
  const scripts = JSON.parse(fsImpl.readFileSync('package.json', 'utf8')).scripts ?? {};
  const dir = '.github/workflows';
  const workflows = fsImpl
    .readdirSync(dir)
    .map((f) => fsImpl.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  const wired = new Set();
  for (const [name, body] of Object.entries(scripts)) {
    if (!workflows.includes(`npm run ${name}`)) continue;
    for (const match of body.matchAll(/tools\/([\w.-]+\.(?:mjs|js))/g)) wired.add(match[1]);
  }
  for (const match of workflows.matchAll(/tools\/([\w.-]+\.(?:mjs|js))/g)) wired.add(match[1]);
  return wired;
}

/**
 * Render the per-tool breakdown, crossed against gate wiring.
 *
 * An earlier version of this report printed the aggregate ratio and the survivor list only. It
 * withheld the caught list, so its own output could not be decomposed per tool -- producing the
 * table below required a bespoke probe against `measure()`. A report that publishes a ratio while
 * withholding its components cannot support the finding it exists to produce, and the specific
 * finding it suppressed was that wiring and assertion do not correlate.
 *
 * @param {{caught: string[], survivors: string[]}} result Measurement.
 * @param {Set<string>} wired Tools invoked by a workflow.
 * @returns {string[]} Report lines.
 */
export function perToolLines(result, wired) {
  const per = new Map();
  const tally = (labels, key) => {
    for (const label of labels) {
      const tool = label.split(':')[0];
      const entry = per.get(tool) ?? { asserted: 0, total: 0 };
      entry.total += 1;
      if (key === 'asserted') entry.asserted += 1;
      per.set(tool, entry);
    }
  };
  tally(result.caught, 'asserted');
  tally(result.survivors, 'unasserted');

  const rows = [...per.entries()]
    .map(([tool, c]) => ({
      tool,
      ...c,
      pct: Math.round((c.asserted / c.total) * 100),
      wired: wired.has(tool),
    }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total);

  const lines = ['', 'per tool:', `  ${'tool'.padEnd(38)}${'asserted'.padEnd(11)}rate   gate`];
  for (const r of rows) {
    lines.push(
      `  ${r.tool.padEnd(38)}${`${r.asserted}/${r.total}`.padEnd(11)}${`${r.pct}%`.padEnd(7)}${
        r.wired ? 'yes' : 'no'
      }`,
    );
  }
  const quadrant = (isWired, isAsserted) =>
    rows.filter((r) => r.wired === isWired && r.pct >= 50 === isAsserted).length;
  lines.push(
    '',
    'wiring x assertion (asserted = >=50% of sites):',
    `  gate,  asserted    ${quadrant(true, true)}`,
    `  gate,  unasserted  ${quadrant(true, false)}`,
    `  inert, asserted    ${quadrant(false, true)}`,
    `  inert, unasserted  ${quadrant(false, false)}`,
    'A populated off-diagonal means these are independent properties, not one judgement:',
    'a tool can be well-tested and never run, or run on every push and assert nothing.',
  );
  return lines;
}

/**
 * Render the unasserted-site list.
 *
 * @param {string[]} survivors Site labels.
 * @returns {string[]} Report lines, empty when nothing survived.
 */
export function survivorLines(survivors) {
  if (survivors.length === 0) return [];
  return ['', 'unasserted sites:', ...survivors.map((s) => `  ${s}`)];
}

/**
 * Render the elapsed-time line.
 *
 * @param {number} ms Duration in milliseconds.
 * @returns {string} Report line.
 */
export function elapsedLine(ms) {
  return `elapsed                 ${(ms / 1000).toFixed(1)}s`;
}

/**
 * Render the refusal message.
 *
 * @param {string} reason Why the run was refused.
 * @returns {string} Message written to stderr.
 */
export function refusalLine(reason) {
  return `check-report-assertions: ${reason}`;
}

function main() {
  const sentinel = process.argv[2] ?? DEFAULT_SENTINEL;
  const reason = refuseReason();
  if (reason !== null) {
    console.error(refusalLine(reason));
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  const result = measure({ sentinel });
  for (const line of reportLines(result)) console.log(line);
  console.log('');
  for (const line of scopeLines(result)) console.log(line);
  console.log('');
  console.log(elapsedLine(Date.now() - started));
  for (const line of perToolLines(result, wiredTools())) console.log(line);
  for (const line of survivorLines(result.survivors)) console.log(line);
}

if (process.argv[1] && process.argv[1].endsWith('check-report-assertions.mjs')) {
  main();
}
